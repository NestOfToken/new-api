package controller

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/nativepay"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type nativePaymentRequest struct {
	Kind           string `json:"kind"`
	Amount         int64  `json:"amount"`
	PlanID         int    `json:"plan_id"`
	Provider       string `json:"provider"`
	Scene          string `json:"scene"`
	IdempotencyKey string `json:"idempotency_key"`
}

func NativePaymentCapabilities(c *gin.Context) {
	channels := make([]gin.H, 0, 2)
	_, originErr := service.NativePaymentOrigin()
	ready := operation_setting.IsPaymentComplianceConfirmed() && model.NativePaymentWalletMode() && originErr == nil
	if ready {
		for _, p := range service.NativePaymentProfiles() {
			if p.Enabled {
				name := "Alipay"
				if p.Provider == "wechat" {
					name = "WeChat Pay"
				}
				channels = append(channels, gin.H{"provider": p.Provider, "name": name, "scenes": p.Scenes})
			}
		}
	}
	common.ApiSuccess(c, gin.H{"enabled": len(channels) > 0, "currency": "CNY", "channels": channels})
}

func nativePaymentQuote(userID int, req nativePaymentRequest) (*model.NativePaymentOrder, error) {
	provider, ok := service.ActiveNativePaymentProvider(req.Provider, req.Scene)
	if !ok || !model.NativePaymentWalletMode() {
		return nil, nativepay.ErrProviderUnavailable
	}
	order := &model.NativePaymentOrder{UserID: userID, Kind: req.Kind, Provider: req.Provider, Scene: req.Scene,
		ConfigVersion: provider.ConfigID(), MerchantID: provider.MerchantID(), AppID: provider.AppID(), Currency: "CNY", PlanID: req.PlanID}
	if req.Kind == "subscription" {
		if req.PlanID <= 0 || req.Amount != 0 {
			return nil, nativepay.ErrInvalidRequest
		}
		plan, err := model.GetSubscriptionPlanById(req.PlanID)
		if err != nil {
			return nil, err
		}
		if !plan.Enabled || plan.CNYPriceCents < 1 || plan.CNYPriceCents > nativepay.MaxAmountCents {
			return nil, nativepay.ErrInvalidRequest
		}
		order.AmountCents = plan.CNYPriceCents
		return order, nil
	}
	if req.Kind != "topup" || req.PlanID != 0 || req.Amount < getMinTopup() || req.Amount > getMaxTopUpAmount() {
		return nil, nativepay.ErrInvalidRequest
	}
	quota, err := validateTopUpQuota(req.Amount)
	if err != nil {
		return nil, err
	}
	if err = model.ValidateTopUpQuotaCapacity(userID, quota); err != nil {
		return nil, err
	}
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		return nil, err
	}
	price, ratio := operation_setting.Price, common.GetTopupGroupRatio(group)
	if ratio == 0 {
		ratio = 1
	}
	discount := 1.0
	if configured, exists := operation_setting.GetPaymentSetting().AmountDiscount[int(req.Amount)]; exists {
		discount = configured
	}
	for _, value := range []float64{price, ratio, discount, common.QuotaPerUnit} {
		if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return nil, nativepay.ErrInvalidRequest
		}
	}
	units := decimal.NewFromInt(req.Amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		units = units.Div(decimal.NewFromFloat(common.QuotaPerUnit))
	}
	cents := units.Mul(decimal.NewFromFloat(price)).Mul(decimal.NewFromFloat(ratio)).Mul(decimal.NewFromFloat(discount)).Mul(decimal.NewFromInt(100)).Round(0)
	if cents.LessThan(decimal.NewFromInt(1)) || cents.GreaterThan(decimal.NewFromInt(nativepay.MaxAmountCents)) {
		return nil, nativepay.ErrInvalidRequest
	}
	order.AmountCents, order.CreditQuota = cents.IntPart(), quota
	return order, nil
}

func QuoteNativePayment(c *gin.Context) {
	if !requirePaymentCompliance(c) {
		return
	}
	var req nativePaymentRequest
	if c.ShouldBindJSON(&req) != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	order, err := nativePaymentQuote(c.GetInt("id"), req)
	if err != nil {
		common.ApiErrorT(c, "Payment information has not been configured by administrator")
		return
	}
	common.ApiSuccess(c, gin.H{"amount_cents": order.AmountCents, "currency": order.Currency, "quota": order.CreditQuota})
}

func CreateNativePayment(c *gin.Context) {
	var req nativePaymentRequest
	if c.ShouldBindJSON(&req) != nil || len(req.IdempotencyKey) < 16 || len(req.IdempotencyKey) > 64 || strings.TrimSpace(req.IdempotencyKey) != req.IdempotencyKey {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	userID := c.GetInt("id")
	key := req.IdempotencyKey
	req.IdempotencyKey = ""
	payload, err := common.Marshal(req)
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	digest := sha256.Sum256(payload)
	requestHash := hex.EncodeToString(digest[:])
	existing, err := model.FindNativePaymentByIdempotency(userID, key)
	if err == nil {
		if existing.RequestHash != requestHash {
			common.ApiErrorT(c, "Invalid parameters")
			return
		}
		common.ApiSuccess(c, nativePaymentView(existing))
		return
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	if !requirePaymentCompliance(c) {
		return
	}
	_, err = service.NativePaymentOrigin()
	if err != nil {
		common.ApiErrorT(c, "Callback URL configuration error")
		return
	}
	order, err := nativePaymentQuote(userID, req)
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	var random [15]byte
	if _, err = rand.Read(random[:]); err != nil {
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	order.TradeNo = "NP" + hex.EncodeToString(random[:])
	order.ClientIP = c.ClientIP()
	order.IdempotencyKey, order.RequestHash = key, requestHash
	order.ExpiresAt = time.Now().Add(15 * time.Minute).Unix()
	if order.Provider == "wechat" && order.Scene == "h5" {
		// The official H5 checkout link is valid for five minutes.
		order.ExpiresAt = time.Now().Add(5 * time.Minute).Unix()
	}
	order, created, err := model.CreateNativePaymentOrder(order)
	if err != nil {
		common.ApiErrorT(c, "Failed to create order")
		return
	}
	if !created {
		common.ApiSuccess(c, nativePaymentView(order))
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	if err = service.PrepareNativePaymentCheckout(ctx, order); err != nil {
		// Do not create another order after an ambiguous timeout. Return its
		// recoverable ID; subsequent retries reuse this exact business order.
		common.ApiSuccess(c, nativePaymentView(order))
		return
	}
	common.ApiSuccess(c, nativePaymentView(order))
}

func nativePaymentView(order *model.NativePaymentOrder) gin.H {
	var checkout any
	if order.PaymentState == model.NativePaymentPending && order.ExpiresAt > time.Now().Unix() && order.CheckoutURL != "" {
		checkout = nativepay.Checkout{Kind: order.CheckoutKind, URL: order.CheckoutURL}
	}
	return gin.H{"id": order.ID, "order_no": order.TradeNo, "user_id": order.UserID, "kind": order.Kind,
		"provider": order.Provider, "amount_cents": order.AmountCents, "currency": order.Currency,
		"quota": order.CreditQuota, "plan_id": order.PlanID, "status": order.PaymentState,
		"fulfillment_status": order.FulfillmentState, "refund_status": order.RefundState,
		"created_at": order.CreatedAt, "expires_at": order.ExpiresAt, "paid_at": order.PaidAt, "checkout": checkout}
}

func GetNativePayment(c *gin.Context) {
	order, err := model.GetNativePaymentOrder(c.Param("order_no"), c.GetInt("id"))
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	common.ApiSuccess(c, nativePaymentView(order))
}

func ListNativePayments(c *gin.Context)      { listNativePayments(c, c.GetInt("id")) }
func AdminListNativePayments(c *gin.Context) { listNativePayments(c, 0) }

func AdminListNativePaymentBills(c *gin.Context) {
	page := common.GetPageQuery(c)
	page.Page = min(max(page.Page, 1), 1000000)
	page.PageSize = min(max(page.PageSize, 1), 100)
	bills, total, err := model.ListNativePaymentBills(page.GetStartIdx(), page.PageSize)
	if err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	common.ApiSuccess(c, gin.H{"items": bills, "total": total, "page": page.Page, "page_size": page.PageSize})
}

func listNativePayments(c *gin.Context, userID int) {
	page := common.GetPageQuery(c)
	page.Page = min(max(page.Page, 1), 1000000)
	page.PageSize = min(max(page.PageSize, 1), 100)
	orders, total, err := model.ListNativePaymentOrders(userID, page.GetStartIdx(), page.PageSize)
	if err != nil {
		common.ApiErrorT(c, "Failed to get top-up records")
		return
	}
	items := make([]gin.H, 0, len(orders))
	for i := range orders {
		items = append(items, nativePaymentView(&orders[i]))
	}
	common.ApiSuccess(c, gin.H{"items": items, "total": total, "page": page.Page, "page_size": page.PageSize})
}

func CancelNativePayment(c *gin.Context) {
	order, err := model.GetNativePaymentOrder(c.Param("order_no"), c.GetInt("id"))
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	if order.PaymentState != model.NativePaymentPending {
		common.ApiSuccess(c, nativePaymentView(order))
		return
	}
	provider, ok := service.NativePaymentProvider(order.ConfigVersion)
	if !ok {
		common.ApiErrorT(c, "Payment information has not been configured by administrator")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	// A close request must never erase a successful payment racing with it.
	if err = service.ReconcileNativePayment(ctx, order); err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	order, err = model.GetNativePaymentOrder(order.TradeNo, c.GetInt("id"))
	if err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	if order.PaymentState == model.NativePaymentPending {
		if err = provider.Close(ctx, order.TradeNo); err != nil {
			common.ApiErrorT(c, "Please try again later.")
			return
		}
		if err = model.MarkNativePaymentClosed(order.TradeNo); err != nil {
			common.ApiErrorT(c, "Please try again later.")
			return
		}
		order, err = model.GetNativePaymentOrder(order.TradeNo, c.GetInt("id"))
		if err != nil {
			common.ApiErrorT(c, "Please try again later.")
			return
		}
	}
	common.ApiSuccess(c, nativePaymentView(order))
}

func AdminReconcileNativePayment(c *gin.Context) {
	order, err := model.GetNativePaymentOrder(c.Param("order_no"), 0)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	if err = service.ReconcileNativePayment(ctx, order); err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	order, err = model.GetNativePaymentOrder(order.TradeNo, 0)
	if err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	common.ApiSuccess(c, nativePaymentView(order))
}

func NativePaymentNotify(c *gin.Context) {
	provider, ok := service.NativePaymentProvider(c.Param("profile"))
	if !ok || provider.Name() != c.Param("provider") {
		c.Status(http.StatusNotFound)
		return
	}
	payment, err := provider.VerifyNotify(c.Request)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if payment.Status == nativepay.StatusPaid {
		if err = service.AcceptNativePayment(provider, payment); err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
	}
	if provider.Name() == "alipay" {
		c.String(http.StatusOK, "success")
		return
	}
	c.Status(http.StatusNoContent)
}

func AdminRefundNativePayment(c *gin.Context) {
	order, err := model.GetNativePaymentOrder(c.Param("order_no"), 0)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	if order.PaymentState != model.NativePaymentPaid || order.FulfillmentState == model.NativeFulfillmentComplete {
		common.ApiErrorT(c, "This payment requires manual refund review.")
		return
	}
	operation, err := common.Marshal(service.NativePaymentRefundContext{OrderNo: order.TradeNo, AmountCents: order.AmountCents})
	if err != nil {
		common.ApiErrorT(c, "Invalid parameters")
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{Scope: service.VerificationScopeNativePaymentRefund, Context: operation}) == nil {
		return
	}
	var random [15]byte
	if _, err = rand.Read(random[:]); err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	refund, err := model.PrepareNativePaymentRefund(order.TradeNo, "NR"+hex.EncodeToString(random[:]), c.GetInt("id"))
	if err != nil {
		common.ApiErrorT(c, "This payment requires manual refund review.")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	// The persisted refund remains pending when the upstream outcome is unknown.
	_ = service.ProcessNativePaymentRefund(ctx, refund)
	refund, err = model.GetNativePaymentRefund(order.TradeNo)
	if err != nil {
		common.ApiErrorT(c, "Please try again later.")
		return
	}
	common.ApiSuccess(c, refund)
}
