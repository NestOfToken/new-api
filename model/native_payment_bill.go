package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// NativePaymentBill records each official daily comparison independently of
// payment delivery. Findings contain order references and reason codes only.
type NativePaymentBill struct {
	ID            int    `json:"id"`
	RunKey        string `json:"-" gorm:"type:varchar(64);not null;uniqueIndex"`
	ConfigVersion string `json:"profile" gorm:"type:varchar(64);not null"`
	BillDate      string `json:"bill_date" gorm:"type:varchar(10);not null"`
	Status        string `json:"status" gorm:"type:varchar(16);not null"`
	LeaseUntil    int64  `json:"-"`
	NextCheckAt   int64  `json:"-"`
	CheckedAt     int64  `json:"checked_at"`
	EntryCount    int    `json:"entry_count"`
	PaymentCents  int64  `json:"payment_cents"`
	RefundCents   int64  `json:"refund_cents"`
	FeeCents      int64  `json:"fee_cents"`
	Findings      string `json:"findings" gorm:"type:text"`
	ErrorCode     string `json:"error_code,omitempty" gorm:"type:varchar(64)"`
}

func ClaimNativePaymentBill(profile, date string) (*NativePaymentBill, bool, error) {
	digest := sha256.Sum256([]byte(profile + "\x00" + date))
	key := hex.EncodeToString(digest[:])
	var bill NativePaymentBill
	err := DB.Where("run_key = ?", key).First(&bill).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		bill = NativePaymentBill{RunKey: key, ConfigVersion: profile, BillDate: date, Status: "pending"}
		if err = DB.Create(&bill).Error; err != nil {
			return nil, false, err
		}
	} else if err != nil {
		return nil, false, err
	}
	now := common.GetTimestamp()
	result := DB.Model(&bill).Where("lease_until <= ? AND next_check_at <= ? AND status NOT IN ?", now, now, []string{"matched", "differences"}).Updates(map[string]any{"lease_until": now + 300, "status": "running"})
	if result.RowsAffected == 1 {
		bill.LeaseUntil = now + 300
	}
	return &bill, result.RowsAffected == 1, result.Error
}

func FinishNativePaymentBill(bill *NativePaymentBill) error {
	result := DB.Model(&NativePaymentBill{}).Where("id = ? AND lease_until = ? AND status = ?", bill.ID, bill.LeaseUntil, "running").Updates(map[string]any{
		"status": bill.Status, "lease_until": int64(0), "next_check_at": common.GetTimestamp() + 3600, "checked_at": common.GetTimestamp(),
		"entry_count": bill.EntryCount, "payment_cents": bill.PaymentCents, "refund_cents": bill.RefundCents, "fee_cents": bill.FeeCents, "findings": bill.Findings, "error_code": bill.ErrorCode,
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrNativePaymentConflict
	}
	return nil
}

func ListNativePaymentBills(offset, limit int) ([]NativePaymentBill, int64, error) {
	var bills []NativePaymentBill
	var total int64
	query := DB.Model(&NativePaymentBill{})
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("bill_date desc, id desc").Offset(max(0, offset)).Limit(min(max(limit, 1), 100)).Find(&bills).Error
	return bills, total, err
}
