package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const (
	NativePaymentPending            = "pending"
	NativePaymentPaid               = "paid"
	NativePaymentClosed             = "closed"
	NativeFulfillmentPending        = "pending"
	NativeFulfillmentComplete       = "complete"
	NativeFulfillmentRefunded       = "refunded"
	NativeRefundPending             = "pending"
	NativeRefundSucceeded           = "succeeded"
	NativeRefundFailed              = "failed"
	MaxNativePaymentCents     int64 = 100_000_000
)

var (
	ErrNativePaymentInvalid    = errors.New("invalid native payment order")
	ErrNativePaymentMismatch   = errors.New("native payment evidence mismatch")
	ErrNativePaymentConflict   = errors.New("native payment idempotency conflict")
	ErrNativePaymentWalletMode = errors.New("native payment requires synchronous wallet accounting")
	ErrNativeRefundReview      = errors.New("fulfilled payment requires manual refund review")
	nativePaymentWalletMode    atomic.Bool
)

// Native payment credits require synchronous, database-authoritative wallet
// accounting so a process crash cannot lose or duplicate a cache delta.
func SetNativePaymentWalletMode(enabled bool) { nativePaymentWalletMode.Store(enabled) }
func NativePaymentWalletMode() bool           { return nativePaymentWalletMode.Load() }

// NativePaymentOrder owns one immutable channel payment attempt. Switching a
// channel creates a new order only after the previous order is confirmed closed.
type NativePaymentOrder struct {
	ID               int     `json:"id"`
	TradeNo          string  `json:"trade_no" gorm:"type:varchar(32);not null;uniqueIndex"`
	UserID           int     `json:"user_id" gorm:"not null;uniqueIndex:idx_native_payment_idempotency,priority:1;index"`
	IdempotencyKey   string  `json:"-" gorm:"type:varchar(64);not null;uniqueIndex:idx_native_payment_idempotency,priority:2"`
	RequestHash      string  `json:"-" gorm:"type:varchar(64);not null"`
	Provider         string  `json:"provider" gorm:"type:varchar(16);not null"`
	ConfigVersion    string  `json:"-" gorm:"type:varchar(64);not null"`
	MerchantID       string  `json:"-" gorm:"type:varchar(64);not null"`
	AppID            string  `json:"-" gorm:"type:varchar(64);not null"`
	Kind             string  `json:"kind" gorm:"type:varchar(16);not null"`
	Scene            string  `json:"scene" gorm:"type:varchar(16);not null"`
	ClientIP         string  `json:"-" gorm:"type:varchar(45)"`
	AmountCents      int64   `json:"amount_cents" gorm:"not null"`
	Currency         string  `json:"currency" gorm:"type:varchar(8);not null"`
	CreditQuota      int     `json:"credit_quota" gorm:"not null"`
	PlanID           int     `json:"plan_id" gorm:"index"`
	PlanSnapshot     string  `json:"-" gorm:"type:text"`
	SubscriptionID   int     `json:"subscription_id"`
	CheckoutURL      string  `json:"checkout_url,omitempty" gorm:"type:text"`
	CheckoutKind     string  `json:"checkout_kind,omitempty" gorm:"type:varchar(16)"`
	PaymentState     string  `json:"payment_state" gorm:"type:varchar(16);not null;index:idx_native_payment_due,priority:1"`
	FulfillmentState string  `json:"fulfillment_state" gorm:"type:varchar(16);not null"`
	ProviderTradeNo  string  `json:"provider_trade_no,omitempty" gorm:"type:varchar(64)"`
	ProviderTradeKey *string `json:"-" gorm:"type:varchar(64);uniqueIndex"`
	CreatedAt        int64   `json:"created_at"`
	ExpiresAt        int64   `json:"expires_at"`
	PaidAt           int64   `json:"paid_at"`
	CompletedAt      int64   `json:"completed_at"`
	NextCheckAt      int64   `json:"-" gorm:"index:idx_native_payment_due,priority:2"`
	CheckAttempts    int     `json:"-"`
	LastError        string  `json:"last_error,omitempty" gorm:"type:varchar(64)"`
	RefundState      string  `json:"refund_state,omitempty" gorm:"type:varchar(16)"`
}

type NativePaymentEvidence struct {
	TradeNo         string
	Provider        string
	MerchantID      string
	AppID           string
	ProviderTradeNo string
	Currency        string
	AmountCents     int64
	PaidAt          int64
}

func IsNativePaymentProvider(provider string) bool {
	return provider == "native_wechat" || provider == "native_alipay"
}

func CreateNativePaymentOrder(order *NativePaymentOrder) (*NativePaymentOrder, bool, error) {
	if order == nil || order.UserID <= 0 || order.TradeNo == "" || len(order.TradeNo) > 32 ||
		order.IdempotencyKey == "" || len(order.IdempotencyKey) > 64 || len(order.RequestHash) != 64 ||
		(order.Provider != "wechat" && order.Provider != "alipay") || order.ConfigVersion == "" ||
		order.MerchantID == "" || order.AppID == "" || order.Currency != "CNY" ||
		order.AmountCents <= 0 || order.AmountCents > MaxNativePaymentCents || order.ExpiresAt <= common.GetTimestamp() {
		return nil, false, ErrNativePaymentInvalid
	}
	if (order.Provider == "wechat" && order.Scene != "native" && order.Scene != "h5") ||
		(order.Provider == "alipay" && order.Scene != "page" && order.Scene != "wap") {
		return nil, false, ErrNativePaymentInvalid
	}
	var result NativePaymentOrder
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "status", "quota").Where("id = ?", order.UserID).First(&user).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return ErrNativePaymentInvalid
		}
		err := tx.Where("user_id = ? AND idempotency_key = ?", order.UserID, order.IdempotencyKey).First(&result).Error
		if err == nil {
			if result.RequestHash != order.RequestHash {
				return ErrNativePaymentConflict
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		switch order.Kind {
		case "topup":
			if !NativePaymentWalletMode() {
				return ErrNativePaymentWalletMode
			}
			maxQuota, err := topUpQuotaMaxCurrent(order.CreditQuota)
			if err != nil {
				return err
			}
			if user.Quota > maxQuota {
				return ErrTopUpQuotaLimitExceeded
			}
			order.PlanID, order.PlanSnapshot = 0, ""
		case "subscription":
			var plan SubscriptionPlan
			if err := tx.Where("id = ?", order.PlanID).First(&plan).Error; err != nil {
				return err
			}
			if !plan.Enabled || plan.CNYPriceCents != order.AmountCents {
				return ErrNativePaymentInvalid
			}
			if plan.MaxPurchasePerUser > 0 {
				var purchased, reserved int64
				if err := tx.Model(&UserSubscription{}).Where("user_id = ? AND plan_id = ?", order.UserID, plan.Id).Count(&purchased).Error; err != nil {
					return err
				}
				// An expired local timer does not release the slot until official close
				// confirmation; an already paid order reserves its slot until fulfilled.
				if err := tx.Model(&NativePaymentOrder{}).Where("user_id = ? AND plan_id = ? AND fulfillment_state = ? AND payment_state IN ? AND refund_state <> ?", order.UserID, plan.Id, NativeFulfillmentPending, []string{NativePaymentPending, NativePaymentPaid}, NativeRefundSucceeded).Count(&reserved).Error; err != nil {
					return err
				}
				if purchased+reserved >= int64(plan.MaxPurchasePerUser) {
					return common.NewMessage("Purchase limit for this plan has been reached")
				}
			}
			snapshot, err := common.Marshal(plan)
			if err != nil {
				return err
			}
			order.PlanSnapshot, order.CreditQuota = string(snapshot), 0
		default:
			return ErrNativePaymentInvalid
		}
		order.ID = 0
		order.PaymentState, order.FulfillmentState = NativePaymentPending, NativeFulfillmentPending
		order.ProviderTradeNo, order.ProviderTradeKey = "", nil
		order.CheckoutURL, order.LastError, order.RefundState = "", "", ""
		order.CheckoutKind = ""
		order.CreatedAt, order.NextCheckAt = common.GetTimestamp(), common.GetTimestamp()+30
		order.PaidAt, order.CompletedAt, order.SubscriptionID, order.CheckAttempts = 0, 0, 0, 0
		if err := tx.Create(order).Error; err != nil {
			return err
		}
		money, _ := decimal.NewFromInt(order.AmountCents).Div(decimal.NewFromInt(100)).Float64()
		provider := "native_" + order.Provider
		if order.Kind == "topup" {
			if err := tx.Create(&TopUp{UserId: order.UserID, Money: money, TradeNo: order.TradeNo, PaymentMethod: order.Provider, PaymentProvider: provider, CreateTime: order.CreatedAt, Status: common.TopUpStatusPending}).Error; err != nil {
				return err
			}
		} else {
			if err := tx.Create(&SubscriptionOrder{UserId: order.UserID, PlanId: order.PlanID, Money: money, TradeNo: order.TradeNo, PaymentMethod: order.Provider, PaymentProvider: provider, CreateTime: order.CreatedAt, Status: common.TopUpStatusPending}).Error; err != nil {
				return err
			}
		}
		result, created = *order, true
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	return &result, created, nil
}

// userID == 0 is reserved for trusted server callbacks and administrators.
func GetNativePaymentOrder(tradeNo string, userID int) (*NativePaymentOrder, error) {
	var order NativePaymentOrder
	query := DB.Where("trade_no = ?", tradeNo)
	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}
	err := query.First(&order).Error
	return &order, err
}

func FindNativePaymentByIdempotency(userID int, key string) (*NativePaymentOrder, error) {
	var order NativePaymentOrder
	err := DB.Where("user_id = ? AND idempotency_key = ?", userID, key).First(&order).Error
	return &order, err
}

func SaveNativePaymentCheckout(tradeNo, kind, checkoutURL string) error {
	return DB.Model(&NativePaymentOrder{}).Where("trade_no = ? AND payment_state = ?", tradeNo, NativePaymentPending).Updates(map[string]any{"checkout_url": checkoutURL, "checkout_kind": kind}).Error
}

// MarkNativePaymentPaid is only called with verified server-to-server evidence.
// It persists money receipt independently of the potentially failing delivery.
func MarkNativePaymentPaid(e NativePaymentEvidence) error {
	if e.ProviderTradeNo == "" || len(e.ProviderTradeNo) > 64 || e.Currency != "CNY" || e.PaidAt < 0 || e.PaidAt > common.GetTimestamp()+300 {
		return ErrNativePaymentMismatch
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", e.TradeNo).First(&order).Error; err != nil {
			return err
		}
		if order.Provider != e.Provider || order.MerchantID != e.MerchantID || order.AppID != e.AppID || order.Currency != e.Currency || order.AmountCents != e.AmountCents {
			return ErrNativePaymentMismatch
		}
		if order.ProviderTradeNo != "" && order.ProviderTradeNo != e.ProviderTradeNo {
			return ErrNativePaymentMismatch
		}
		if order.PaymentState == NativePaymentPaid {
			return nil
		}
		digest := sha256.Sum256([]byte(e.Provider + "\x00" + e.MerchantID + "\x00" + e.ProviderTradeNo))
		tradeKey := hex.EncodeToString(digest[:])
		paidAt := e.PaidAt
		if paidAt == 0 {
			paidAt = common.GetTimestamp()
		}
		return tx.Model(&order).Updates(map[string]any{"payment_state": NativePaymentPaid, "provider_trade_no": e.ProviderTradeNo, "provider_trade_key": tradeKey, "paid_at": paidAt, "next_check_at": common.GetTimestamp(), "last_error": ""}).Error
	})
}

func FulfillNativePayment(tradeNo string) error {
	var groupUserID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
			return err
		}
		if order.PaymentState != NativePaymentPaid {
			return ErrNativePaymentInvalid
		}
		if order.FulfillmentState == NativeFulfillmentComplete {
			return nil
		}
		if order.FulfillmentState != NativeFulfillmentPending || (order.RefundState != "" && order.RefundState != NativeRefundFailed) {
			return ErrNativePaymentInvalid
		}
		var user User
		if err := lockForUpdate(tx).Select("id", "status").Where("id = ?", order.UserID).First(&user).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return ErrNativePaymentInvalid
		}
		// Claim and grant in one transaction. This remains a compare-and-swap
		// even on SQLite, where SELECT FOR UPDATE is unavailable.
		claim := tx.Model(&order).Where("fulfillment_state = ?", NativeFulfillmentPending).Updates(map[string]any{"fulfillment_state": NativeFulfillmentComplete, "completed_at": common.GetTimestamp(), "last_error": ""})
		if claim.Error != nil {
			return claim.Error
		}
		if claim.RowsAffected != 1 {
			return ErrNativePaymentConflict
		}
		provider := "native_" + order.Provider
		if order.Kind == "topup" {
			if !NativePaymentWalletMode() {
				return ErrNativePaymentWalletMode
			}
			if err := creditTopUpQuota(tx, order.UserID, order.CreditQuota, nil); err != nil {
				return err
			}
			update := tx.Model(&TopUp{}).Where("trade_no = ? AND payment_provider = ? AND status = ?", order.TradeNo, provider, common.TopUpStatusPending).Updates(map[string]any{"status": common.TopUpStatusSuccess, "complete_time": common.GetTimestamp()})
			if update.Error != nil {
				return update.Error
			}
			if update.RowsAffected != 1 {
				return ErrNativePaymentConflict
			}
			return nil
		}
		var plan SubscriptionPlan
		if err := common.UnmarshalJsonStr(order.PlanSnapshot, &plan); err != nil {
			return err
		}
		if plan.Id != order.PlanID || plan.CNYPriceCents != order.AmountCents {
			return ErrNativePaymentInvalid
		}
		subscription, err := CreateUserSubscriptionFromPlanTx(tx, order.UserID, &plan, "order")
		if err != nil {
			return err
		}
		if err := tx.Model(subscription).Updates(map[string]any{"native_reset_snapshot": true, "reset_period": plan.QuotaResetPeriod, "reset_custom_seconds": plan.QuotaResetCustomSeconds}).Error; err != nil {
			return err
		}
		if err := tx.Model(&order).Update("subscription_id", subscription.Id).Error; err != nil {
			return err
		}
		update := tx.Model(&SubscriptionOrder{}).Where("trade_no = ? AND payment_provider = ? AND status = ?", order.TradeNo, provider, common.TopUpStatusPending).Updates(map[string]any{"status": common.TopUpStatusSuccess, "complete_time": common.GetTimestamp()})
		if update.Error != nil {
			return update.Error
		}
		if update.RowsAffected != 1 {
			return ErrNativePaymentConflict
		}
		money, _ := decimal.NewFromInt(order.AmountCents).Div(decimal.NewFromInt(100)).Float64()
		if err := tx.Create(&TopUp{UserId: order.UserID, Money: money, TradeNo: order.TradeNo, PaymentMethod: order.Provider, PaymentProvider: provider, CreateTime: order.CreatedAt, CompleteTime: common.GetTimestamp(), Status: common.TopUpStatusSuccess}).Error; err != nil {
			return err
		}
		groupUserID = order.UserID
		return nil
	})
	if err == nil && groupUserID > 0 {
		refreshSubscriptionUserGroupCache(groupUserID, "native payment")
	}
	return err
}

func MarkNativePaymentClosed(tradeNo string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
			return err
		}
		if order.PaymentState != NativePaymentPending {
			return nil
		}
		if err := tx.Model(&order).Updates(map[string]any{"payment_state": NativePaymentClosed, "checkout_url": ""}).Error; err != nil {
			return err
		}
		return nil
	})
}

func ListDueNativePayments(now int64, limit int) ([]NativePaymentOrder, error) {
	var orders []NativePaymentOrder
	err := DB.Where("next_check_at <= ? AND (payment_state = ? OR (payment_state = ? AND fulfillment_state = ? AND refund_state IN ?))", now, NativePaymentPending, NativePaymentPaid, NativeFulfillmentPending, []string{"", NativeRefundFailed}).Order("next_check_at, id").Limit(min(max(limit, 1), 100)).Find(&orders).Error
	return orders, err
}

func RescheduleNativePayment(tradeNo string, nextCheckAt int64, errorCode string) error {
	if len(errorCode) > 64 || strings.ContainsAny(errorCode, "\r\n") {
		return ErrNativePaymentInvalid
	}
	return DB.Model(&NativePaymentOrder{}).Where("trade_no = ?", tradeNo).Updates(map[string]any{"next_check_at": nextCheckAt, "check_attempts": gorm.Expr("check_attempts + ?", 1), "last_error": errorCode}).Error
}

func ListNativePaymentOrders(userID, offset, limit int) ([]NativePaymentOrder, int64, error) {
	var orders []NativePaymentOrder
	var total int64
	query := DB.Model(&NativePaymentOrder{})
	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Offset(max(offset, 0)).Limit(min(max(limit, 1), 100)).Find(&orders).Error
	return orders, total, err
}

func HasNativePaymentOrders() (bool, error) {
	var count int64
	err := DB.Model(&NativePaymentOrder{}).Limit(1).Count(&count).Error
	return count > 0, err
}

// NativePaymentRefund persists the immutable refund request number before an
// external request. Only unfulfilled payments can be refunded automatically.
// Refunding delivered quota needs admission freeze and in-flight usage draining.
type NativePaymentRefund struct {
	ID               int    `json:"id"`
	RefundNo         string `json:"refund_no" gorm:"type:varchar(32);not null;uniqueIndex"`
	TradeNo          string `json:"trade_no" gorm:"type:varchar(32);not null;uniqueIndex"`
	AmountCents      int64  `json:"amount_cents"`
	Status           string `json:"status" gorm:"type:varchar(16);index;index:idx_native_refund_due,priority:1"`
	AdminID          int    `json:"admin_id"`
	CreatedAt        int64  `json:"created_at"`
	CompletedAt      int64  `json:"completed_at"`
	ProviderRefundNo string `json:"provider_refund_no,omitempty" gorm:"type:varchar(64)"`
	NextCheckAt      int64  `json:"-" gorm:"not null;default:0;index:idx_native_refund_due,priority:2"`
	LastError        string `json:"last_error,omitempty" gorm:"type:varchar(64)"`
}

func PrepareNativePaymentRefund(tradeNo, refundNo string, adminID int) (*NativePaymentRefund, error) {
	if refundNo == "" || len(refundNo) > 32 || adminID <= 0 {
		return nil, ErrNativePaymentInvalid
	}
	var refund NativePaymentRefund
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", tradeNo).First(&order).Error; err != nil {
			return err
		}
		if order.PaymentState != NativePaymentPaid {
			return ErrNativePaymentInvalid
		}
		err := tx.Where("trade_no = ?", tradeNo).First(&refund).Error
		if err == nil {
			if refund.Status == NativeRefundFailed {
				// A terminally closed official refund cannot reuse its number.
				// A new attempt needs a separate auditable refund record.
				return ErrNativeRefundReview
			}
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if order.FulfillmentState != NativeFulfillmentPending {
			return ErrNativeRefundReview
		}
		refund = NativePaymentRefund{RefundNo: refundNo, TradeNo: tradeNo, AmountCents: order.AmountCents, Status: NativeRefundPending, AdminID: adminID, CreatedAt: common.GetTimestamp()}
		if err := tx.Create(&refund).Error; err != nil {
			return err
		}
		return tx.Model(&order).Update("refund_state", NativeRefundPending).Error
	})
	return &refund, err
}

func CompleteNativePaymentRefund(refundNo, providerRefundNo string, amountCents int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var lookup NativePaymentRefund
		if err := tx.Where("refund_no = ?", refundNo).First(&lookup).Error; err != nil {
			return err
		}
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", lookup.TradeNo).First(&order).Error; err != nil {
			return err
		}
		var refund NativePaymentRefund
		if err := lockForUpdate(tx).Where("id = ?", lookup.ID).First(&refund).Error; err != nil {
			return err
		}
		if amountCents != refund.AmountCents || amountCents != order.AmountCents || providerRefundNo == "" {
			return ErrNativePaymentMismatch
		}
		if refund.ProviderRefundNo != "" && refund.ProviderRefundNo != providerRefundNo {
			return ErrNativePaymentMismatch
		}
		if refund.Status == NativeRefundSucceeded {
			return nil
		}
		if order.FulfillmentState != NativeFulfillmentPending {
			return ErrNativeRefundReview
		}
		if err := tx.Model(&refund).Updates(map[string]any{"status": NativeRefundSucceeded, "provider_refund_no": providerRefundNo, "completed_at": common.GetTimestamp(), "last_error": ""}).Error; err != nil {
			return err
		}
		var businessOrder any = &TopUp{}
		if order.Kind == "subscription" {
			businessOrder = &SubscriptionOrder{}
		}
		if err := tx.Model(businessOrder).Where("trade_no = ? AND payment_provider = ?", order.TradeNo, "native_"+order.Provider).Updates(map[string]any{"status": "refunded", "complete_time": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Model(&order).Updates(map[string]any{"refund_state": NativeRefundSucceeded, "fulfillment_state": NativeFulfillmentRefunded}).Error
	})
}

func ListPendingNativePaymentRefunds(limit int) ([]NativePaymentRefund, error) {
	var refunds []NativePaymentRefund
	err := DB.Where("status = ? AND next_check_at <= ?", NativeRefundPending, common.GetTimestamp()).Order("next_check_at, id").Limit(min(max(limit, 1), 100)).Find(&refunds).Error
	return refunds, err
}

// Scheduling every attempted refund lets newer due requests progress even when
// older refunds need long-running bank processing or merchant intervention.
func RescheduleNativePaymentRefund(refundNo string, nextCheckAt int64, errorCode string) error {
	if nextCheckAt < 0 || (errorCode != "" && errorCode != "refund_recovery_pending" && errorCode != "refund_manual_review") {
		return ErrNativePaymentInvalid
	}
	return DB.Model(&NativePaymentRefund{}).Where("refund_no = ? AND status = ?", refundNo, NativeRefundPending).Updates(map[string]any{"next_check_at": nextCheckAt, "last_error": errorCode}).Error
}

func GetNativePaymentRefund(tradeNo string) (*NativePaymentRefund, error) {
	var refund NativePaymentRefund
	err := DB.Where("trade_no = ?", tradeNo).First(&refund).Error
	return &refund, err
}

// Only call after an authoritative terminal failure. Timeouts and not-found
// responses are ambiguous and must keep the refund reservation pending.
func FailNativePaymentRefund(refundNo string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var refund NativePaymentRefund
		if err := tx.Where("refund_no = ?", refundNo).First(&refund).Error; err != nil {
			return err
		}
		var order NativePaymentOrder
		if err := lockForUpdate(tx).Where("trade_no = ?", refund.TradeNo).First(&order).Error; err != nil {
			return err
		}
		if err := lockForUpdate(tx).Where("id = ?", refund.ID).First(&refund).Error; err != nil {
			return err
		}
		if refund.Status != NativeRefundPending {
			return nil
		}
		if err := tx.Model(&refund).Update("status", NativeRefundFailed).Error; err != nil {
			return err
		}
		return tx.Model(&order).Updates(map[string]any{"refund_state": NativeRefundFailed, "next_check_at": common.GetTimestamp()}).Error
	})
}
