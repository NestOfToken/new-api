package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/nativepay"
	"github.com/QuantumNous/new-api/setting/native_payment_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNativePaymentStagedCredentialsPreserveWalletAuthority(t *testing.T) {
	for _, tc := range []struct {
		name                        string
		enabled, history, sqlWallet bool
	}{
		{"disabled before first order", false, false, false},
		{"first activation", true, false, true},
		{"disabled after an order", false, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			user := setupAuthSessionTestDB(t)
			require.NoError(t, model.DB.AutoMigrate(&model.NativePaymentOrder{}))
			previousMode, previousRegistry := model.NativePaymentWalletMode(), nativePaymentRegistry.Load()
			t.Cleanup(func() { model.SetNativePaymentWalletMode(previousMode); nativePaymentRegistry.Store(previousRegistry) })
			directory := t.TempDir()
			key, err := rsa.GenerateKey(rand.Reader, 2048)
			require.NoError(t, err)
			privateDER, err := x509.MarshalPKCS8PrivateKey(key)
			require.NoError(t, err)
			publicDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
			require.NoError(t, err)
			privatePath, publicPath := filepath.Join(directory, "private.pem"), filepath.Join(directory, "public.pem")
			require.NoError(t, os.WriteFile(privatePath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER}), 0600))
			require.NoError(t, os.WriteFile(publicPath, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}), 0600))
			config := native_payment_setting.Config{Profiles: []native_payment_setting.Profile{{ID: "staged", Provider: "alipay", Enabled: tc.enabled, AppID: "app", MerchantID: "merchant", Scenes: []string{"page"}, PrivateKeyFile: privatePath, AlipayPublicKeyFile: publicPath}}}
			data, err := common.Marshal(config)
			require.NoError(t, err)
			configPath := filepath.Join(directory, "config.json")
			require.NoError(t, os.WriteFile(configPath, data, 0600))
			t.Setenv("NATIVE_PAYMENT_CONFIG_FILE", configPath)
			if tc.history {
				require.NoError(t, model.DB.Create(&model.NativePaymentOrder{TradeNo: "NPstaged", UserID: user.Id, IdempotencyKey: "staged", RequestHash: strings.Repeat("a", 64), PaymentState: model.NativePaymentClosed}).Error)
			}
			require.NoError(t, InitNativePayments())
			assert.Equal(t, tc.sqlWallet, model.NativePaymentWalletMode())
			_, active := ActiveNativePaymentProvider("alipay", "page")
			assert.Equal(t, tc.enabled, active)
			_, configured := NativePaymentProvider("staged")
			assert.True(t, configured, "disabled credentials remain available to verify historical notifications")
		})
	}
}

type nativePaymentTestProvider struct {
	nativepay.Provider
	queryError error
}

func (nativePaymentTestProvider) Name() string       { return "wechat" }
func (nativePaymentTestProvider) ConfigID() string   { return "test" }
func (nativePaymentTestProvider) MerchantID() string { return "merchant" }
func (nativePaymentTestProvider) AppID() string      { return "app" }
func (p nativePaymentTestProvider) Query(context.Context, string) (*nativepay.Payment, error) {
	return nil, p.queryError
}

func TestNativePaymentReceiptBeforeDelivery(t *testing.T) {
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.NativePaymentOrder{}, &model.TopUp{}))
	previous := model.NativePaymentWalletMode()
	model.SetNativePaymentWalletMode(true)
	t.Cleanup(func() { model.SetNativePaymentWalletMode(previous) })
	order := &model.NativePaymentOrder{TradeNo: "NP" + strings.Repeat("a", 30), UserID: user.Id, IdempotencyKey: strings.Repeat("k", 20), RequestHash: strings.Repeat("a", 64), Provider: "wechat", ConfigVersion: "test", MerchantID: "merchant", AppID: "app", Kind: "topup", Scene: "native", AmountCents: 1990, Currency: "CNY", CreditQuota: 200, ExpiresAt: common.GetTimestamp() + 600}
	_, created, err := model.CreateNativePaymentOrder(order)
	require.NoError(t, err)
	require.True(t, created)
	payment := &nativepay.Payment{TradeNo: order.TradeNo, TransactionID: "official-1", MerchantID: "merchant", AppID: "app", Currency: "CNY", Status: nativepay.StatusPaid, AmountCents: 1990}
	provider := nativePaymentTestProvider{}
	wrong := *payment
	wrong.AmountCents = 1
	require.Error(t, AcceptNativePayment(provider, &wrong))
	wrong = *payment
	wrong.MerchantID = "other"
	require.ErrorIs(t, AcceptNativePayment(provider, &wrong), nativepay.ErrIdentityMismatch)
	require.NoError(t, AcceptNativePayment(provider, payment))
	require.NoError(t, AcceptNativePayment(provider, payment))
	stored, err := model.GetNativePaymentOrder(order.TradeNo, user.Id)
	require.NoError(t, err)
	assert.Equal(t, model.NativePaymentPaid, stored.PaymentState)
	assert.Equal(t, model.NativeFulfillmentPending, stored.FulfillmentState)
	before, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	require.NoError(t, ReconcileNativePayment(t.Context(), stored))
	require.NoError(t, ReconcileNativePayment(t.Context(), stored))
	after, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, before+200, after)
}

func TestNativePaymentRefundProofBindsOrderAndAmount(t *testing.T) {
	operation := VerificationOperation{Scope: VerificationScopeNativePaymentRefund, Context: []byte(`{"order_no":"NPaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","amount_cents":1990}`)}
	binding, err := BindVerificationOperation(operation)
	require.NoError(t, err)
	for _, context := range []string{
		`{"order_no":"NPbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","amount_cents":1990}`,
		`{"order_no":"NPaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","amount_cents":1991}`,
	} {
		changed, err := BindVerificationOperation(VerificationOperation{Scope: operation.Scope, Context: []byte(context)})
		require.NoError(t, err)
		assert.NotEqual(t, binding.ContextHash, changed.ContextHash)
	}
	_, err = BindVerificationOperation(VerificationOperation{Scope: operation.Scope, Context: []byte(`{"order_no":"bad","amount_cents":-1}`)})
	require.ErrorIs(t, err, ErrVerificationContextInvalid)
	methods, err := securityVerificationPolicy(operation.Scope, model.UserVerificationState{HasPassword: true})
	require.NoError(t, err)
	assert.Empty(t, methods, "money refunds require an enrolled strong factor")
	methods, err = securityVerificationPolicy(operation.Scope, model.UserVerificationState{HasTwoFA: true})
	require.NoError(t, err)
	require.Len(t, methods, 1)
	assert.Equal(t, VerificationMethodTwoFA, methods[0].Method)
}

func TestNativePaymentExpiredAbsentOrder(t *testing.T) {
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.NativePaymentOrder{}))
	order := model.NativePaymentOrder{TradeNo: "NPexpired", UserID: user.Id, IdempotencyKey: "expired", RequestHash: strings.Repeat("a", 64), PaymentState: model.NativePaymentPending, ExpiresAt: common.GetTimestamp() - 301}
	require.NoError(t, model.DB.Create(&order).Error)
	provider := nativePaymentTestProvider{queryError: errors.New("connection lost")}
	require.Error(t, reconcileNativePayment(t.Context(), &order, provider))
	stored, err := model.GetNativePaymentOrder(order.TradeNo, user.Id)
	require.NoError(t, err)
	assert.Equal(t, model.NativePaymentPending, stored.PaymentState)
	provider.queryError = nativepay.ErrOrderNotFound
	require.NoError(t, reconcileNativePayment(t.Context(), &order, provider))
	stored, err = model.GetNativePaymentOrder(order.TradeNo, user.Id)
	require.NoError(t, err)
	assert.Equal(t, model.NativePaymentClosed, stored.PaymentState)
}

func TestNativePaymentBillDetectsDifferencesWithoutGrantingCredit(t *testing.T) {
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.NativePaymentOrder{}, &model.NativePaymentRefund{}))
	paidAt, err := time.Parse(time.RFC3339, "2026-11-05T12:00:00+08:00")
	require.NoError(t, err)
	order := model.NativePaymentOrder{TradeNo: "NPbill", UserID: user.Id, IdempotencyKey: "bill", RequestHash: strings.Repeat("a", 64), ConfigVersion: "test", Provider: "wechat", MerchantID: "merchant", AmountCents: 1990, PaymentState: model.NativePaymentPaid, FulfillmentState: model.NativeFulfillmentPending, ProviderTradeNo: "official", PaidAt: paidAt.Unix()}
	require.NoError(t, model.DB.Create(&order).Error)
	before, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	bill := nativepay.Bill{Date: "2026-11-05", Provider: "wechat", MerchantID: "merchant", Entries: []nativepay.BillEntry{
		{TradeNo: order.TradeNo, TransactionID: "official", Kind: "payment", AmountCents: 1991, FeeCents: 5},
		{TradeNo: "NPunknown", Kind: "payment", AmountCents: 100},
		{TradeNo: "other-application", Kind: "payment", AmountCents: 900},
	}}
	run := model.NativePaymentBill{}
	require.NoError(t, compareNativePaymentBill(&run, &bill, "test"))
	assert.Equal(t, "differences", run.Status)
	assert.EqualValues(t, 1991, run.PaymentCents)
	assert.EqualValues(t, 5, run.FeeCents)
	require.NoError(t, compareNativePaymentBill(&run, &bill, "test"))
	assert.EqualValues(t, 1991, run.PaymentCents, "retrying a comparison replaces earlier totals")
	var findings []nativeBillFinding
	require.NoError(t, common.UnmarshalJsonStr(run.Findings, &findings))
	assert.ElementsMatch(t, []nativeBillFinding{{order.TradeNo, "amount_mismatch"}, {order.TradeNo, "paid_unfulfilled"}, {"NPunknown", "official_payment_without_local_order"}}, findings)
	after, err := model.GetUserQuota(user.Id, true)
	require.NoError(t, err)
	assert.Equal(t, before, after)
	// A refund row alone must not conceal a missing original payment row.
	bill.Entries = []nativepay.BillEntry{{TradeNo: order.TradeNo, TransactionID: "official", Kind: "refund", Status: nativepay.RefundSuccess, AmountCents: 1990}}
	run = model.NativePaymentBill{}
	require.NoError(t, compareNativePaymentBill(&run, &bill, "test"))
	require.NoError(t, common.UnmarshalJsonStr(run.Findings, &findings))
	assert.Contains(t, findings, nativeBillFinding{order.TradeNo, "local_payment_missing_from_bill"})
	bill.Entries[0].Status = nativepay.StatusUnknown
	run = model.NativePaymentBill{}
	require.NoError(t, compareNativePaymentBill(&run, &bill, "test"))
	require.NoError(t, common.UnmarshalJsonStr(run.Findings, &findings))
	assert.Contains(t, findings, nativeBillFinding{order.TradeNo, "refund_requires_query"})
	assert.Contains(t, findings, nativeBillFinding{order.TradeNo, "official_refund_without_local_refund"})
}
