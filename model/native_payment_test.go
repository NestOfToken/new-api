package model

import (
	"fmt"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

func nativePaymentTestOrder(userID int, reference string) *NativePaymentOrder {
	return &NativePaymentOrder{
		TradeNo: reference, UserID: userID, IdempotencyKey: reference, RequestHash: strings.Repeat("a", 64),
		Provider: "wechat", ConfigVersion: "test-v1", MerchantID: "merchant", AppID: "app", Kind: "topup", Scene: "native",
		AmountCents: 1990, Currency: "CNY", CreditQuota: 12345, ExpiresAt: common.GetTimestamp() + 600,
	}
}

func nativePaymentTestEvidence(order *NativePaymentOrder) NativePaymentEvidence {
	return NativePaymentEvidence{TradeNo: order.TradeNo, Provider: order.Provider, MerchantID: order.MerchantID, AppID: order.AppID, ProviderTradeNo: "official-" + order.TradeNo, Currency: order.Currency, AmountCents: order.AmountCents}
}

// This is the v1.0.0-rc.47 SubscriptionPlan schema: git diff between that
// release and the pre-change HEAD contains no changes to subscription.go.
func nativePaymentLegacyPlan() reflect.Value {
	planType := reflect.TypeFor[SubscriptionPlan]()
	var fields []reflect.StructField
	for i := range planType.NumField() {
		field := planType.Field(i)
		if field.Name != "CNYPriceCents" {
			fields = append(fields, field)
		}
	}
	legacy := reflect.New(reflect.StructOf(fields))
	legacy.Elem().FieldByName("Id").SetInt(91)
	legacy.Elem().FieldByName("Title").SetString("Existing USD plan")
	legacy.Elem().FieldByName("PriceAmount").SetFloat(12.5)
	legacy.Elem().FieldByName("Currency").SetString("USD")
	return legacy
}

func TestNativePaymentSQLitePlanMigration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB, previousType := DB, common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { DB = previousDB; common.SetMainDatabaseType(previousType); require.NoError(t, sqlDB.Close()) })
	for range 2 {
		require.NoError(t, ensureSubscriptionPlanTableSQLite())
	}
	assert.True(t, db.Migrator().HasColumn(&SubscriptionPlan{}, "cny_price_cents"))
	require.NoError(t, db.Migrator().DropTable(&SubscriptionPlan{}))
	legacy := nativePaymentLegacyPlan()
	require.NoError(t, db.Table("subscription_plans").AutoMigrate(legacy.Interface()))
	require.NoError(t, db.Table("subscription_plans").Create(legacy.Interface()).Error)
	for range 2 {
		require.NoError(t, ensureSubscriptionPlanTableSQLite())
	}
	var plan SubscriptionPlan
	require.NoError(t, db.First(&plan, 91).Error)
	assert.Equal(t, "USD", plan.Currency)
	assert.Equal(t, 12.5, plan.PriceAmount)
	assert.Zero(t, plan.CNYPriceCents)
}

func TestNativePaymentDatabaseMatrix(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var dialector gorm.Dialector
			switch dialect {
			case "sqlite":
				dialector = sqlite.Open(":memory:")
			case "mysql":
				dsn := os.Getenv("TEST_MYSQL_DSN")
				if dsn == "" {
					t.Skip("TEST_MYSQL_DSN is not configured")
				}
				dialector = mysql.Open(dsn)
			case "postgres":
				dsn := os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN is not configured")
				}
				dialector = postgres.Open(dsn)
			}
			db, err := gorm.Open(dialector, &gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "nativepay_test_"}, Logger: logger.Default.LogMode(logger.Silent)})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			sqlDB.SetMaxOpenConns(4)
			if dialect == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			previousDB, previousType := DB, common.MainDatabaseType()
			previousMode, previousRedis, previousBatch := NativePaymentWalletMode(), common.RedisEnabled, common.BatchUpdateEnabled
			DB = db
			common.SetMainDatabaseType(common.DatabaseType(dialect))
			SetNativePaymentWalletMode(true)
			common.RedisEnabled, common.BatchUpdateEnabled = false, false
			models := []any{&NativePaymentBill{}, &NativePaymentRefund{}, &NativePaymentOrder{}, &TopUp{}, &SubscriptionOrder{}, &UserSubscription{}, &SubscriptionPlan{}, &User{}}
			t.Cleanup(func() {
				for _, model := range models {
					require.NoError(t, db.Migrator().DropTable(model))
				}
				DB = previousDB
				common.SetMainDatabaseType(previousType)
				SetNativePaymentWalletMode(previousMode)
				common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
				require.NoError(t, sqlDB.Close())
			})
			for _, model := range models {
				require.NoError(t, db.Migrator().DropTable(model))
			}
			versionSQL := "SELECT version()"
			if dialect == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
			t.Logf("database version: %s", version)

			// Reconstruct the existing plan schema without the one new column.
			// All original fields/tags are retained; existing data must survive two
			// subsequent migrations with the new explicit CNY price defaulting off.
			legacy := nativePaymentLegacyPlan()
			planTable := db.NamingStrategy.TableName("SubscriptionPlan")
			require.NoError(t, db.Table(planTable).AutoMigrate(legacy.Interface()))
			require.NoError(t, db.Table(planTable).Create(legacy.Interface()).Error)
			// Preserve existing subscriptions while adding nullable snapshot fields.
			subscriptionType := reflect.TypeFor[UserSubscription]()
			var subscriptionFields []reflect.StructField
			for i := range subscriptionType.NumField() {
				field := subscriptionType.Field(i)
				if field.Name != "NativeResetSnapshot" && field.Name != "ResetPeriod" && field.Name != "ResetCustomSeconds" {
					subscriptionFields = append(subscriptionFields, field)
				}
			}
			legacySubscription := reflect.New(reflect.StructOf(subscriptionFields))
			legacySubscription.Elem().FieldByName("Id").SetInt(91)
			legacySubscription.Elem().FieldByName("UserId").SetInt(91)
			legacySubscription.Elem().FieldByName("PlanId").SetInt(91)
			legacySubscription.Elem().FieldByName("AmountTotal").SetInt(700)
			subscriptionTable := db.NamingStrategy.TableName("UserSubscription")
			require.NoError(t, db.Table(subscriptionTable).AutoMigrate(legacySubscription.Interface()))
			require.NoError(t, db.Table(subscriptionTable).Create(legacySubscription.Interface()).Error)
			for range 2 {
				require.NoError(t, db.AutoMigrate(models...))
			}
			var existing SubscriptionPlan
			require.NoError(t, db.First(&existing, 91).Error)
			assert.Equal(t, "USD", existing.Currency)
			assert.Equal(t, 12.5, existing.PriceAmount)
			assert.Zero(t, existing.CNYPriceCents)
			var existingSubscription UserSubscription
			require.NoError(t, db.First(&existingSubscription, 91).Error)
			assert.EqualValues(t, 700, existingSubscription.AmountTotal)
			assert.False(t, existingSubscription.NativeResetSnapshot)
			assert.Empty(t, existingSubscription.ResetPeriod)

			user := User{Username: "native-pay-test", Status: common.UserStatusEnabled, Quota: 0}
			require.NoError(t, db.Create(&user).Error)
			order, created, err := CreateNativePaymentOrder(nativePaymentTestOrder(user.Id, "native-topup"))
			require.NoError(t, err)
			require.True(t, created)
			same, created, err := CreateNativePaymentOrder(nativePaymentTestOrder(user.Id, "native-topup"))
			require.NoError(t, err)
			assert.False(t, created)
			assert.Equal(t, order.ID, same.ID)
			conflict := nativePaymentTestOrder(user.Id, "native-topup")
			conflict.RequestHash = strings.Repeat("b", 64)
			_, _, err = CreateNativePaymentOrder(conflict)
			assert.ErrorIs(t, err, ErrNativePaymentConflict)
			_, err = GetNativePaymentOrder(order.TradeNo, user.Id+1)
			assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
			assert.ErrorIs(t, ManualCompleteTopUp(order.TradeNo, ""), ErrNativePaymentMismatch)
			assert.ErrorIs(t, FulfillNativePayment(order.TradeNo), ErrNativePaymentInvalid)

			for _, field := range []string{"merchant", "app", "provider", "amount", "currency"} {
				evidence := nativePaymentTestEvidence(order)
				switch field {
				case "merchant":
					evidence.MerchantID = "wrong"
				case "app":
					evidence.AppID = "wrong"
				case "provider":
					evidence.Provider = "alipay"
				case "amount":
					evidence.AmountCents--
				case "currency":
					evidence.Currency = "USD"
				}
				assert.ErrorIs(t, MarkNativePaymentPaid(evidence), ErrNativePaymentMismatch, field)
			}
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(order)))
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(order)))
			require.NoError(t, MarkNativePaymentClosed(order.TradeNo))
			paid, err := GetNativePaymentOrder(order.TradeNo, user.Id)
			require.NoError(t, err)
			assert.Equal(t, NativePaymentPaid, paid.PaymentState)
			assert.Equal(t, NativeFulfillmentPending, paid.FulfillmentState)

			var wg sync.WaitGroup
			errors := make(chan error, 2)
			for range 2 {
				wg.Go(func() { errors <- FulfillNativePayment(order.TradeNo) })
			}
			wg.Wait()
			close(errors)
			for err := range errors {
				require.NoError(t, err)
			}
			quota, err := GetUserQuota(user.Id, true)
			require.NoError(t, err)
			assert.Equal(t, order.CreditQuota, quota)
			topup := GetTopUpByTradeNo(order.TradeNo)
			require.NotNil(t, topup)
			assert.Equal(t, common.TopUpStatusSuccess, topup.Status)
			assert.Equal(t, "native_wechat", topup.PaymentProvider)
			_, err = PrepareNativePaymentRefund(order.TradeNo, "unsafe-refund", 1)
			assert.ErrorIs(t, err, ErrNativeRefundReview)

			// One official transaction cannot fund a different order.
			other, _, err := CreateNativePaymentOrder(nativePaymentTestOrder(user.Id, "native-other"))
			require.NoError(t, err)
			reused := nativePaymentTestEvidence(other)
			reused.ProviderTradeNo = nativePaymentTestEvidence(order).ProviderTradeNo
			require.Error(t, MarkNativePaymentPaid(reused))
			other, err = GetNativePaymentOrder(other.TradeNo, user.Id)
			require.NoError(t, err)
			assert.Equal(t, NativePaymentPending, other.PaymentState)

			// Delivery failure preserves payment, rolls back quota and can recover.
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(other)))
			require.NoError(t, db.Model(&user).Update("quota", common.MaxWalletQuota).Error)
			assert.ErrorIs(t, FulfillNativePayment(other.TradeNo), ErrTopUpQuotaLimitExceeded)
			other, err = GetNativePaymentOrder(other.TradeNo, user.Id)
			require.NoError(t, err)
			assert.Equal(t, NativePaymentPaid, other.PaymentState)
			assert.Equal(t, NativeFulfillmentPending, other.FulfillmentState)
			require.NoError(t, db.Model(&user).Updates(map[string]any{"quota": 0, "status": common.UserStatusDisabled}).Error)
			assert.ErrorIs(t, FulfillNativePayment(other.TradeNo), ErrNativePaymentInvalid)
			require.NoError(t, db.Model(&user).Update("status", common.UserStatusEnabled).Error)
			require.NoError(t, FulfillNativePayment(other.TradeNo))

			plan := SubscriptionPlan{Title: "Snapshot plan", PriceAmount: 12, Currency: "USD", CNYPriceCents: 8800, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, Enabled: true, TotalAmount: 500, MaxPurchasePerUser: 1, QuotaResetPeriod: SubscriptionResetCustom, QuotaResetCustomSeconds: 60}
			require.NoError(t, db.Create(&plan).Error)
			subOrder := nativePaymentTestOrder(user.Id, "native-subscription")
			subOrder.Kind, subOrder.PlanID, subOrder.AmountCents = "subscription", plan.Id, plan.CNYPriceCents
			subOrder, _, err = CreateNativePaymentOrder(subOrder)
			require.NoError(t, err)
			second := *subOrder
			second.TradeNo, second.IdempotencyKey = "native-subscription-second", "native-subscription-second"
			_, _, err = CreateNativePaymentOrder(&second)
			require.Error(t, err, "pending payment reserves the limited purchase slot")
			require.NoError(t, db.Model(&plan).Updates(map[string]any{"total_amount": 999, "cny_price_cents": 9900}).Error)
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(subOrder)))
			require.NoError(t, FulfillNativePayment(subOrder.TradeNo))
			require.NoError(t, FulfillNativePayment(subOrder.TradeNo))
			var subscriptions []UserSubscription
			require.NoError(t, db.Where("user_id = ?", user.Id).Find(&subscriptions).Error)
			require.Len(t, subscriptions, 1)
			assert.EqualValues(t, 500, subscriptions[0].AmountTotal)
			assert.True(t, subscriptions[0].NativeResetSnapshot)
			assert.EqualValues(t, 60, subscriptions[0].ResetCustomSeconds)
			plan.QuotaResetPeriod = SubscriptionResetNever
			subscriptions[0].AmountUsed = 100
			require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
				return maybeResetUserSubscriptionWithPlanTx(tx, &subscriptions[0], &plan, subscriptions[0].NextResetTime)
			}))
			assert.Zero(t, subscriptions[0].AmountUsed, "subsequent reset uses the purchased schedule")
			assert.Equal(t, SubscriptionResetNever, plan.QuotaResetPeriod, "cached plan must not be mutated")

			refundOrder, _, err := CreateNativePaymentOrder(nativePaymentTestOrder(user.Id, "native-refundable"))
			require.NoError(t, err)
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(refundOrder)))
			refund, err := PrepareNativePaymentRefund(refundOrder.TradeNo, "native-refund", 1)
			require.NoError(t, err)
			assert.ErrorIs(t, FulfillNativePayment(refundOrder.TradeNo), ErrNativePaymentInvalid)
			retried, err := PrepareNativePaymentRefund(refundOrder.TradeNo, "different-refund-number", 1)
			require.NoError(t, err)
			assert.Equal(t, refund.RefundNo, retried.RefundNo)
			assert.Equal(t, NativeRefundPending, retried.Status)
			assert.ErrorIs(t, CompleteNativePaymentRefund(refund.RefundNo, "official-refund", refund.AmountCents-1), ErrNativePaymentMismatch)
			require.NoError(t, CompleteNativePaymentRefund(refund.RefundNo, "official-refund", refund.AmountCents))
			require.NoError(t, CompleteNativePaymentRefund(refund.RefundNo, "official-refund", refund.AmountCents))
			assert.ErrorIs(t, FulfillNativePayment(refundOrder.TradeNo), ErrNativePaymentInvalid)
			refunded, err := GetNativePaymentOrder(refundOrder.TradeNo, user.Id)
			require.NoError(t, err)
			assert.Equal(t, NativeFulfillmentRefunded, refunded.FulfillmentState)
			failedOrder, _, err := CreateNativePaymentOrder(nativePaymentTestOrder(user.Id, "native-failed-refund"))
			require.NoError(t, err)
			require.NoError(t, MarkNativePaymentPaid(nativePaymentTestEvidence(failedOrder)))
			failedRefund, err := PrepareNativePaymentRefund(failedOrder.TradeNo, "failed-refund", 1)
			require.NoError(t, err)
			require.NoError(t, FailNativePaymentRefund(failedRefund.RefundNo))
			_, err = PrepareNativePaymentRefund(failedOrder.TradeNo, "new-refund", 1)
			assert.ErrorIs(t, err, ErrNativeRefundReview, "terminal refunds cannot reuse their official request number")
			require.NoError(t, FulfillNativePayment(failedOrder.TradeNo), "authoritative failed refund releases delivery")

			// Native wallet mode must bypass Redis and the delayed database queue.
			common.RedisEnabled, common.BatchUpdateEnabled = true, true
			require.NoError(t, db.Model(&user).Update("quota", 100).Error)
			require.NoError(t, IncreaseUserQuota(user.Id, 50, false))
			reserved, err := TryReserveUserQuota(user.Id, 120)
			require.NoError(t, err)
			assert.True(t, reserved)
			require.NoError(t, DecreaseUserQuota(user.Id, 10, false))
			quota, err = GetUserQuota(user.Id, false)
			require.NoError(t, err)
			assert.Equal(t, 20, quota)
			reserved, err = TryReserveUserQuota(user.Id, 21)
			require.NoError(t, err)
			assert.False(t, reserved)
			batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
			queued := batchUpdateStores[BatchUpdateTypeUserQuota][user.Id]
			batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
			assert.Zero(t, queued)
			common.RedisEnabled, common.BatchUpdateEnabled = false, false
			queuedRefunds := []NativePaymentRefund{
				{TradeNo: "fair-first", RefundNo: "fair-first", Status: NativeRefundPending},
				{TradeNo: "fair-second", RefundNo: "fair-second", Status: NativeRefundPending},
			}
			require.NoError(t, db.Create(&queuedRefunds).Error)
			dueRefunds, err := ListPendingNativePaymentRefunds(1)
			require.NoError(t, err)
			require.Len(t, dueRefunds, 1)
			assert.Equal(t, "fair-first", dueRefunds[0].RefundNo)
			require.NoError(t, RescheduleNativePaymentRefund("fair-first", common.GetTimestamp()+120, "refund_recovery_pending"))
			dueRefunds, err = ListPendingNativePaymentRefunds(1)
			require.NoError(t, err)
			require.Len(t, dueRefunds, 1)
			assert.Equal(t, "fair-second", dueRefunds[0].RefundNo, "an uncertain refund cannot starve later refunds")

			bill, claimed, err := ClaimNativePaymentBill("test-v1", "2026-11-05")
			require.NoError(t, err)
			assert.True(t, claimed)
			sameBill, claimed, err := ClaimNativePaymentBill("test-v1", "2026-11-05")
			require.NoError(t, err)
			assert.False(t, claimed)
			assert.Equal(t, bill.ID, sameBill.ID)
			bill.Status, bill.Findings, bill.EntryCount, bill.PaymentCents = "matched", "[]", 1, 1990
			require.NoError(t, FinishNativePaymentBill(bill))
			assert.ErrorIs(t, FinishNativePaymentBill(bill), ErrNativePaymentConflict, "a consumed lease cannot overwrite another result")
			_, claimed, err = ClaimNativePaymentBill("test-v1", "2026-11-05")
			require.NoError(t, err)
			assert.False(t, claimed)
			bills, billCount, err := ListNativePaymentBills(0, 10)
			require.NoError(t, err)
			require.Len(t, bills, 1)
			assert.EqualValues(t, 1, billCount)
			assert.EqualValues(t, 1990, bills[0].PaymentCents)

			// Re-running migration after real payments preserves their constraints.
			for range 2 {
				require.NoError(t, db.AutoMigrate(&NativePaymentOrder{}, &NativePaymentRefund{}, &NativePaymentBill{}))
			}
			duplicate := *order
			duplicate.ID, duplicate.IdempotencyKey = 0, "duplicate-trade"
			require.Error(t, db.Create(&duplicate).Error)
			t.Logf("%s: legacy plan upgrade, repeated migration, payment replay, recovery, subscription snapshot, refund and wallet mode passed", fmt.Sprint(dialect))
		})
	}
}
