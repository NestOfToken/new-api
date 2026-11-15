package service

import (
	"context"
	"errors"
	"net/url"
	"slices"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/nativepay"
	"github.com/QuantumNous/new-api/setting/native_payment_setting"
)

var nativePaymentRegistry atomic.Pointer[nativepay.Registry]
var nativePaymentWake = make(chan struct{}, 1)

// InitNativePayments runs before serving requests or starting batch writers.
// Once native orders exist, wallet authority stays in SQL even if new payments
// are disabled. Merely staging disabled credentials must preserve the current
// wallet authority. Drain and restart all instances together when first enabling.
func InitNativePayments() error {
	cfg, err := native_payment_setting.Load()
	if err != nil {
		return err
	}
	registry, err := nativepay.NewRegistry(cfg)
	if err != nil {
		return err
	}
	var count int64
	if err = model.DB.Model(&model.NativePaymentOrder{}).Limit(1).Count(&count).Error; err != nil {
		return err
	}
	enabled := slices.ContainsFunc(registry.Profiles(), func(profile nativepay.ProfileInfo) bool { return profile.Enabled })
	model.SetNativePaymentWalletMode(enabled || count > 0)
	nativePaymentRegistry.Store(registry)
	return nil
}

func NativePaymentProfiles() []nativepay.ProfileInfo {
	return nativePaymentRegistry.Load().Profiles()
}

func NativePaymentProvider(id string) (nativepay.Provider, bool) {
	return nativePaymentRegistry.Load().Get(id)
}

func ActiveNativePaymentProvider(name, scene string) (nativepay.Provider, bool) {
	registry := nativePaymentRegistry.Load()
	p, ok := registry.Active(name)
	if !ok {
		return nil, false
	}
	for _, profile := range registry.Profiles() {
		if profile.ID == p.ConfigID() && slices.Contains(profile.Scenes, scene) {
			return p, true
		}
	}
	return nil, false
}

func NativePaymentOrigin() (string, error) {
	u, err := url.Parse(GetCallbackAddress())
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", errors.New("invalid payment callback origin")
	}
	return strings.TrimRight(u.String(), "/"), nil
}

// ReconcileNativePayment is shared by polling, admin reconciliation and the
// durable retry loop. Provider API calls never run inside a database transaction.
func ReconcileNativePayment(ctx context.Context, order *model.NativePaymentOrder) error {
	if order.PaymentState == "paid" {
		return model.FulfillNativePayment(order.TradeNo)
	}
	if order.PaymentState == "closed" {
		return nil
	}
	p, ok := NativePaymentProvider(order.ConfigVersion)
	if !ok || p.Name() != order.Provider || p.MerchantID() != order.MerchantID || p.AppID() != order.AppID {
		return nativepay.ErrProviderUnavailable
	}
	return reconcileNativePayment(ctx, order, p)
}

func reconcileNativePayment(ctx context.Context, order *model.NativePaymentOrder, p nativepay.Provider) error {
	payment, err := p.Query(ctx, order.TradeNo)
	// Alipay page/wap orders only exist upstream after the buyer opens the
	// signed URL. A definitive absence can release the local reservation once
	// its absolute upstream expiry plus clock-skew grace has elapsed. Network
	// failures must never be mistaken for absence; late signed paid evidence
	// can still move a locally closed order to paid.
	if errors.Is(err, nativepay.ErrOrderNotFound) && order.ExpiresAt+300 <= time.Now().Unix() {
		return model.MarkNativePaymentClosed(order.TradeNo)
	}
	if errors.Is(err, nativepay.ErrOrderNotFound) && order.CheckoutURL == "" && order.ExpiresAt > time.Now().Unix() {
		return PrepareNativePaymentCheckout(ctx, order)
	}
	if err != nil {
		return err
	}
	if payment.TradeNo != order.TradeNo {
		return nativepay.ErrIdentityMismatch
	}
	if payment.Status == nativepay.StatusPaid {
		if err = AcceptNativePayment(p, payment); err != nil {
			return err
		}
		return model.FulfillNativePayment(order.TradeNo)
	}
	if payment.Status == nativepay.StatusClosed {
		return model.MarkNativePaymentClosed(order.TradeNo)
	}
	if payment.Status == nativepay.StatusPending && order.ExpiresAt <= time.Now().Unix() {
		if err = p.Close(ctx, order.TradeNo); err != nil {
			return err
		}
		return model.MarkNativePaymentClosed(order.TradeNo)
	}
	if payment.Status == nativepay.StatusPending && order.CheckoutURL == "" {
		return PrepareNativePaymentCheckout(ctx, order)
	}
	return nil
}

// Retrying checkout always uses the original number, price and absolute expiry.
// This recovers a process exit before saving a successful upstream response.
func PrepareNativePaymentCheckout(ctx context.Context, order *model.NativePaymentOrder) error {
	p, ok := NativePaymentProvider(order.ConfigVersion)
	if !ok || p.MerchantID() != order.MerchantID || p.AppID() != order.AppID || p.Name() != order.Provider {
		return nativepay.ErrProviderUnavailable
	}
	origin, err := NativePaymentOrigin()
	if err != nil {
		return err
	}
	description := "API service credit"
	if order.Kind == "subscription" {
		description = "API service subscription"
	}
	checkout, err := p.Create(ctx, nativepay.CreateRequest{TradeNo: order.TradeNo, Description: description, NotifyURL: origin + "/api/payments/" + order.Provider + "/notify/" + order.ConfigVersion, ReturnURL: origin + "/wallet", ClientIP: order.ClientIP, Scene: order.Scene, AmountCents: order.AmountCents, ExpiresAt: time.Unix(order.ExpiresAt, 0)})
	if err != nil {
		return err
	}
	if err = model.SaveNativePaymentCheckout(order.TradeNo, checkout.Kind, checkout.URL); err != nil {
		return err
	}
	order.CheckoutKind, order.CheckoutURL = checkout.Kind, checkout.URL
	return nil
}

func AcceptNativePayment(provider nativepay.Provider, payment *nativepay.Payment) error {
	if payment == nil || payment.Status != nativepay.StatusPaid || payment.MerchantID != provider.MerchantID() || payment.AppID != provider.AppID() {
		return nativepay.ErrIdentityMismatch
	}
	paidAt := int64(0)
	if !payment.PaidAt.IsZero() {
		paidAt = payment.PaidAt.Unix()
	}
	err := model.MarkNativePaymentPaid(model.NativePaymentEvidence{
		TradeNo: payment.TradeNo, Provider: provider.Name(), MerchantID: payment.MerchantID,
		AppID: payment.AppID, ProviderTradeNo: payment.TransactionID,
		Currency: payment.Currency, AmountCents: payment.AmountCents,
		PaidAt: paidAt,
	})
	if err != nil {
		return err
	}
	// A durable paid record is the acknowledgement boundary. Delivery is kept
	// out of the callback's short response deadline and survives process exits.
	select {
	case nativePaymentWake <- struct{}{}:
	default:
	}
	return nil
}

func RunNativePaymentRecovery(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for {
		orders, err := model.ListDueNativePayments(time.Now().Unix(), 50)
		if err != nil {
			common.SysError(common.LogText("native payment recovery scan failed"))
		} else {
			for i := range orders {
				if ctx.Err() != nil {
					return
				}
				callCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
				err = ReconcileNativePayment(callCtx, &orders[i])
				cancel()
				delay := int64(30)
				code := ""
				if err != nil {
					delay, code = 120, "payment_recovery_pending"
				}
				if scheduleErr := model.RescheduleNativePayment(orders[i].TradeNo, time.Now().Unix()+delay, code); scheduleErr != nil {
					common.SysError(common.LogText("native payment recovery scheduling failed"))
				}
			}
		}
		refunds, refundErr := model.ListPendingNativePaymentRefunds(50)
		if refundErr != nil {
			common.SysError(common.LogText("native payment refund recovery scan failed"))
		} else {
			for i := range refunds {
				if ctx.Err() != nil {
					return
				}
				callCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
				refundErr = ProcessNativePaymentRefund(callCtx, &refunds[i])
				cancel()
				delay, code := int64(120), ""
				if errors.Is(refundErr, nativepay.ErrRefundManualReview) {
					delay, code = 3600, "refund_manual_review"
					if refunds[i].LastError != code {
						common.SysError(common.LogText("native payment refund requires merchant review refund=%s", refunds[i].RefundNo))
					}
				} else if refundErr != nil {
					code = "refund_recovery_pending"
					// Preserve the actionable review marker through transient query
					// errors until official evidence shows its state has changed.
					if refunds[i].LastError == "refund_manual_review" {
						code = refunds[i].LastError
					}
				}
				if scheduleErr := model.RescheduleNativePaymentRefund(refunds[i].RefundNo, time.Now().Unix()+delay, code); scheduleErr != nil {
					common.SysError(common.LogText("native payment refund recovery scheduling failed"))
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-nativePaymentWake:
		}
	}
}

func ProcessNativePaymentRefund(ctx context.Context, refund *model.NativePaymentRefund) error {
	if refund.Status != model.NativeRefundPending {
		return nil
	}
	order, err := model.GetNativePaymentOrder(refund.TradeNo, 0)
	if err != nil {
		return err
	}
	provider, ok := NativePaymentProvider(order.ConfigVersion)
	if !ok || provider.Name() != order.Provider || provider.MerchantID() != order.MerchantID || provider.AppID() != order.AppID {
		return nativepay.ErrProviderUnavailable
	}
	result, err := provider.QueryRefund(ctx, nativepay.RefundQuery{TradeNo: refund.TradeNo, RefundNo: refund.RefundNo})
	if err != nil && !errors.Is(err, nativepay.ErrOrderNotFound) && !errors.Is(err, nativepay.ErrRefundNotFound) {
		return err
	}
	if errors.Is(err, nativepay.ErrOrderNotFound) || errors.Is(err, nativepay.ErrRefundNotFound) || (err == nil && result.Status == nativepay.RefundProcessing) {
		// Reuse the original refund number; official refund idempotency covers
		// a lost response or a crash between submitting and recording success.
		result, err = provider.Refund(ctx, nativepay.RefundRequest{TradeNo: refund.TradeNo, RefundNo: refund.RefundNo,
			AmountCents: refund.AmountCents, TotalCents: order.AmountCents, Reason: "Unfulfilled service order refund"})
	}
	if err != nil {
		return err
	}
	if result.TradeNo != refund.TradeNo || result.RefundNo != refund.RefundNo || result.AmountCents != refund.AmountCents {
		return nativepay.ErrIdentityMismatch
	}
	switch result.Status {
	case nativepay.RefundSuccess:
		return model.CompleteNativePaymentRefund(refund.RefundNo, result.RefundID, result.AmountCents)
	case nativepay.RefundFailed:
		return model.FailNativePaymentRefund(refund.RefundNo)
	case nativepay.RefundManualReview:
		return nativepay.ErrRefundManualReview
	}
	return nil
}
