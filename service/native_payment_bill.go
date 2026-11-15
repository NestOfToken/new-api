package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/nativepay"
	"gorm.io/gorm"
)

type nativeBillFinding struct {
	OrderNo string `json:"order_no"`
	Reason  string `json:"reason"`
}

func RunNativePaymentBillSchedule(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		RunNativePaymentBills(ctx)
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// RunNativePaymentBills catches up the latest seven completed China-time days.
// A durable lease avoids duplicate downloads across master instances. Missing
// or unrecognized official files stay retryable; they never count as a match.
func RunNativePaymentBills(ctx context.Context) {
	china := time.FixedZone("Asia/Shanghai", 8*60*60)
	now := time.Now().In(china)
	for _, profile := range NativePaymentProfiles() {
		provider, ok := NativePaymentProvider(profile.ID)
		if !ok {
			continue
		}
		biller, ok := provider.(nativepay.BillProvider)
		if !ok {
			continue
		}
		for days := 1; days <= 7; days++ {
			if ctx.Err() != nil {
				return
			}
			date := now.AddDate(0, 0, -days).Format("2006-01-02")
			run, claimed, err := model.ClaimNativePaymentBill(profile.ID, date)
			if err != nil || !claimed {
				continue
			}
			callCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
			bill, err := biller.DownloadBill(callCtx, date)
			cancel()
			if err == nil && (bill.Date != date || bill.Provider != provider.Name() || bill.MerchantID != provider.MerchantID()) {
				err = nativepay.ErrIdentityMismatch
			}
			if err == nil {
				err = compareNativePaymentBill(run, bill, profile.ID)
			}
			if err != nil {
				run.Status, run.ErrorCode = "error", "bill_unavailable_or_invalid"
			}
			if err := model.FinishNativePaymentBill(run); err != nil {
				common.SysError(common.LogText("native payment bill persistence failed"))
			}
			if run.Status == "differences" {
				common.SysError(common.LogText("native payment reconciliation differences profile=%s date=%s", profile.ID, date))
			}
		}
	}
}

func compareNativePaymentBill(run *model.NativePaymentBill, bill *nativepay.Bill, profile string) error {
	run.EntryCount, run.PaymentCents, run.RefundCents, run.FeeCents = 0, 0, 0, 0
	findings := make([]nativeBillFinding, 0)
	seen := make(map[string]bool)
	for _, entry := range bill.Entries {
		if !strings.HasPrefix(entry.TradeNo, "NP") {
			continue
		}
		order, err := model.GetNativePaymentOrder(entry.TradeNo, 0)
		if errors.Is(err, gorm.ErrRecordNotFound) {
			findings = append(findings, nativeBillFinding{entry.TradeNo, "official_payment_without_local_order"})
			continue
		}
		if err != nil {
			return err
		}
		if order.ConfigVersion != profile {
			continue
		}
		run.EntryCount++
		run.FeeCents += entry.FeeCents
		if order.Provider != bill.Provider || order.MerchantID != bill.MerchantID {
			return nativepay.ErrIdentityMismatch
		}
		if order.ProviderTradeNo != "" && order.ProviderTradeNo != entry.TransactionID {
			findings = append(findings, nativeBillFinding{entry.TradeNo, "transaction_mismatch"})
		}
		if entry.Kind == "payment" {
			seen[order.TradeNo] = true
			run.PaymentCents += entry.AmountCents
			if entry.AmountCents != order.AmountCents {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "amount_mismatch"})
			}
			if order.PaymentState != model.NativePaymentPaid {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "official_paid_local_unconfirmed"})
			}
			if order.FulfillmentState == model.NativeFulfillmentPending && order.RefundState == "" {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "paid_unfulfilled"})
			}
		} else if entry.Kind == "refund" {
			run.RefundCents += entry.AmountCents
			if entry.Status != nativepay.RefundSuccess {
				// Some Alipay statement layouts do not specify terminal refund
				// status. Keep them visible for official-query review.
				findings = append(findings, nativeBillFinding{entry.TradeNo, "refund_requires_query"})
			}
			refund, err := model.GetNativePaymentRefund(order.TradeNo)
			if errors.Is(err, gorm.ErrRecordNotFound) {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "official_refund_without_local_refund"})
				continue
			}
			if err != nil {
				return err
			}
			if refund.AmountCents != entry.AmountCents || (entry.RefundNo != "" && refund.RefundNo != entry.RefundNo) {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "refund_mismatch"})
			}
			if refund.Status != model.NativeRefundSucceeded {
				findings = append(findings, nativeBillFinding{entry.TradeNo, "official_refund_local_pending"})
			}
		}
	}
	start, err := time.ParseInLocation("2006-01-02", bill.Date, time.FixedZone("Asia/Shanghai", 8*60*60))
	if err != nil {
		return err
	}
	// Official payment timestamps, not receipt timestamps, determine bill dates.
	var local []model.NativePaymentOrder
	if err = model.DB.Select("trade_no").Where("config_version = ? AND payment_state = ? AND paid_at >= ? AND paid_at < ?", profile, model.NativePaymentPaid, start.Unix(), start.AddDate(0, 0, 1).Unix()).Find(&local).Error; err != nil {
		return err
	}
	for _, order := range local {
		if !seen[order.TradeNo] {
			findings = append(findings, nativeBillFinding{order.TradeNo, "local_payment_missing_from_bill"})
		}
	}
	encoded, err := common.Marshal(findings)
	if err != nil {
		return err
	}
	run.Findings, run.Status, run.ErrorCode = string(encoded), "matched", ""
	if len(findings) > 0 {
		run.Status = "differences"
	}
	return nil
}
