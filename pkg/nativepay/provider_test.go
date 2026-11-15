package nativepay

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/native_payment_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"golang.org/x/text/encoding/simplifiedchinese"
)

type paymentKeyFixture struct {
	key                              *rsa.PrivateKey
	privatePath, publicPath, apiPath string
}

type paymentRoundTripper func(*http.Request) (*http.Response, error)

func (f paymentRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestWechatBillAuthenticity(t *testing.T) {
	f := newPaymentKeyFixture(t)
	profile := native_payment_setting.Profile{ID: "wx-v1", Provider: "wechat", AppID: "app-1", MerchantID: "merchant-1", PrivateKeyFile: f.privatePath, WechatSerialNo: "serial", WechatPublicKeyID: "PUB_KEY_ID_TEST", WechatPublicKeyFile: f.publicPath, WechatAPIv3KeyFile: f.apiPath}
	provider, err := newWechat(profile)
	require.NoError(t, err)
	p := provider.(*wechatProvider)
	csvData := []byte("交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,货币种类,订单金额,申请退款金额,商户退款单号,退款状态,手续费\n2026-11-05 12:00:00,app-1,merchant-1,wx1,ORDER1,SUCCESS,CNY,12.34,0.00,0,,0.07\n")
	for _, tc := range []struct {
		name, url string
		tamper    bool
		expected  error
	}{
		{"verified", "https://api.mch.weixin.qq.com/v3/billdownload/file?token=test", false, nil},
		{"corrupt download", "https://api.mch.weixin.qq.com/v3/billdownload/file?token=test", true, ErrBillFormat},
		{"unsafe URL", "https://127.0.0.1/private", false, ErrBillFormat},
	} {
		t.Run(tc.name, func(t *testing.T) {
			downloaded := false
			transport := paymentRoundTripper(func(request *http.Request) (*http.Response, error) {
				var body []byte
				if request.URL.Path == "/v3/bill/tradebill" {
					digest := sha1.Sum(csvData)
					body, err = common.Marshal(map[string]string{"download_url": tc.url, "hash_type": "SHA1", "hash_value": hex.EncodeToString(digest[:])})
					require.NoError(t, err)
				} else {
					downloaded = true
					body = csvData
					if tc.tamper {
						body = append(bytes.Clone(body), []byte("tampered")...)
					}
				}
				ts := strconv.FormatInt(time.Now().Unix(), 10)
				header := http.Header{}
				header.Set("Wechatpay-Serial", "PUB_KEY_ID_TEST")
				header.Set("Wechatpay-Timestamp", ts)
				header.Set("Wechatpay-Nonce", "nonce")
				header.Set("Wechatpay-Signature", signPaymentMessage(t, f.key, ts+"\nnonce\n"+string(body)+"\n"))
				return &http.Response{StatusCode: 200, Header: header, Body: io.NopCloser(bytes.NewReader(body)), Request: request}, nil
			})
			p.client, err = core.NewClient(context.Background(), option.WithWechatPayPublicKeyAuthCipher(profile.MerchantID, profile.WechatSerialNo, f.key, profile.WechatPublicKeyID, &f.key.PublicKey), option.WithHTTPClient(&http.Client{Transport: transport}))
			require.NoError(t, err)
			bill, err := p.DownloadBill(context.Background(), time.Now().In(chinaTime).AddDate(0, 0, -1).Format("2006-01-02"))
			if tc.expected != nil {
				assert.ErrorIs(t, err, tc.expected)
			} else {
				require.NoError(t, err)
				require.Len(t, bill.Entries, 1)
				assert.Equal(t, int64(1234), bill.Entries[0].AmountCents)
			}
			if tc.name == "unsafe URL" {
				assert.False(t, downloaded)
			}
		})
	}
}

func TestOfficialBillParsing(t *testing.T) {
	wechatCSV := "交易时间,公众账号ID,商户号,微信订单号,商户订单号,交易状态,货币种类,订单金额,申请退款金额,商户退款单号,退款状态,手续费\n" +
		"`2026-11-05 12:00:00,`app-1,`merchant-1,`wx1,`ORDER1,`SUCCESS,`CNY,`12.34,`0.00,`0,`,`0.07\n" +
		"`2026-11-05 12:00:00,`app-1,`merchant-1,`wx1,`ORDER1,`REFUND,`CNY,`0.00,`12.34,`REFUND1,`PROCESSING,`-0.07\n" +
		"总交易单数,应结订单总金额\n`2,`12.34\n"
	entries, err := parseWechatBill([]byte(wechatCSV), "merchant-1", "app-1")
	require.NoError(t, err)
	require.Len(t, entries, 2)
	assert.Equal(t, BillEntry{TradeNo: "ORDER1", TransactionID: "wx1", Kind: "payment", Status: StatusPaid, AmountCents: 1234, FeeCents: 7}, entries[0])
	assert.Equal(t, BillEntry{TradeNo: "ORDER1", TransactionID: "wx1", RefundNo: "REFUND1", Kind: "refund", Status: RefundProcessing, AmountCents: 1234, FeeCents: -7}, entries[1])
	_, err = parseWechatBill([]byte(wechatCSV), "different-merchant", "app-1")
	assert.ErrorIs(t, err, ErrIdentityMismatch)
	_, err = parseWechatBill([]byte(strings.Replace(wechatCSV, "订单金额,申请退款金额", "应结订单金额,申请退款金额", 1)), "merchant-1", "app-1")
	assert.ErrorIs(t, err, ErrBillFormat, "must not reconcile settlement amount as order total")

	alipayCSV := "#支付宝交易账单\n支付宝交易号,商户订单号,业务类型,订单金额（元）,退款批次号/请求号,服务费（元）\n" +
		"ali1\t,ORDER1\t,交易,12.34,,0.07\nali1\t,ORDER1\t,退款,-12.34,REFUND1,-0.07\n#结束\n"
	encoded, err := simplifiedchinese.GBK.NewEncoder().Bytes([]byte(alipayCSV))
	require.NoError(t, err)
	var buffer bytes.Buffer
	archive := zip.NewWriter(&buffer)
	file, err := archive.Create("业务明细.csv")
	require.NoError(t, err)
	_, err = file.Write(encoded)
	require.NoError(t, err)
	require.NoError(t, archive.Close())
	entries, err = parseAlipayBillArchive(buffer.Bytes())
	require.NoError(t, err)
	require.Len(t, entries, 2)
	assert.Equal(t, int64(1234), entries[0].AmountCents)
	assert.Equal(t, "ORDER1", entries[0].TradeNo)
	assert.Equal(t, "refund", entries[1].Kind)
	assert.Equal(t, int64(1234), entries[1].AmountCents)
	assert.Equal(t, "REFUND1", entries[1].RefundNo)
	_, err = parseAlipayBill([]byte(strings.Replace(alipayCSV, "订单金额（元）", "商家实收（元）", 1)))
	assert.ErrorIs(t, err, ErrBillFormat)
	_, err = parseAlipayBillArchive([]byte("not a zip"))
	assert.ErrorIs(t, err, ErrBillFormat)
}

func newPaymentKeyFixture(t *testing.T) paymentKeyFixture {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privateDER, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	dir := t.TempDir()
	f := paymentKeyFixture{key: key, privatePath: filepath.Join(dir, "private.pem"), publicPath: filepath.Join(dir, "public.pem"), apiPath: filepath.Join(dir, "api-key")}
	require.NoError(t, os.WriteFile(f.privatePath, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateDER}), 0600))
	require.NoError(t, os.WriteFile(f.publicPath, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicDER}), 0600))
	require.NoError(t, os.WriteFile(f.apiPath, []byte("01234567890123456789012345678901"), 0600))
	return f
}

func signPaymentMessage(t *testing.T, key *rsa.PrivateKey, message string) string {
	t.Helper()
	hash := sha256.Sum256([]byte(message))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, hash[:])
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(signature)
}

func alipayNotification(t *testing.T, key *rsa.PrivateKey, values url.Values) *http.Request {
	t.Helper()
	keys := make([]string, 0, len(values))
	for key := range values {
		if key != "sign" && key != "sign_type" && key != "alipay_cert_sn" && values.Get(key) != "" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values.Get(key))
	}
	values.Set("sign", signPaymentMessage(t, key, strings.Join(parts, "&")))
	request := httptest.NewRequest(http.MethodPost, "https://merchant.example/notify?total_amount=999.00", strings.NewReader(values.Encode()))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded; charset=utf-8")
	return request
}

func TestAlipayNotificationContract(t *testing.T) {
	f := newPaymentKeyFixture(t)
	provider, err := newAlipay(native_payment_setting.Profile{ID: "ali-v1", Provider: "alipay", AppID: "app-1", MerchantID: "seller-1", PrivateKeyFile: f.privatePath, AlipayPublicKeyFile: f.publicPath, Scenes: []string{"page"}})
	require.NoError(t, err)
	for _, tc := range []struct {
		name, app, seller, amount, status string
		expected                          error
	}{
		{"paid", "app-1", "seller-1", "12.34", "TRADE_SUCCESS", nil},
		{"finished", "app-1", "seller-1", "12.34", "TRADE_FINISHED", nil},
		{"wrong application", "other", "seller-1", "12.34", "TRADE_SUCCESS", ErrIdentityMismatch},
		{"wrong seller", "app-1", "other", "12.34", "TRADE_SUCCESS", ErrIdentityMismatch},
		{"fractional cent", "app-1", "seller-1", "12.345", "TRADE_SUCCESS", ErrInvalidNotification},
		{"negative amount", "app-1", "seller-1", "-1.00", "TRADE_SUCCESS", ErrInvalidNotification},
	} {
		t.Run(tc.name, func(t *testing.T) {
			values := url.Values{"app_id": {tc.app}, "seller_id": {tc.seller}, "out_trade_no": {"ORDER1"}, "trade_no": {"ALI_TRANSACTION1"}, "total_amount": {tc.amount}, "trade_status": {tc.status}, "gmt_payment": {"2026-11-06 12:00:00"}, "sign_type": {"RSA2"}, "alipay_cert_sn": {"untrusted-certificate-selector"}}
			payment, err := provider.VerifyNotify(alipayNotification(t, f.key, values))
			if tc.expected != nil {
				require.ErrorIs(t, err, tc.expected)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, int64(1234), payment.AmountCents)
			assert.Equal(t, StatusPaid, payment.Status)
			assert.Equal(t, "ORDER1", payment.TradeNo)
			// Signatures are verified on each replay; business idempotency lives in the ledger.
			_, err = provider.VerifyNotify(alipayNotification(t, f.key, values))
			require.NoError(t, err)
			values.Set("total_amount", "999.00")
			request := httptest.NewRequest(http.MethodPost, "https://merchant.example/notify", strings.NewReader(values.Encode()))
			request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
			_, err = provider.VerifyNotify(request)
			assert.ErrorIs(t, err, ErrInvalidNotification)
		})
	}
	t.Run("duplicate form parameter", func(t *testing.T) {
		request := httptest.NewRequest(http.MethodPost, "https://merchant.example/notify", strings.NewReader("app_id=one&app_id=two&sign_type=RSA2"))
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		_, err := provider.VerifyNotify(request)
		assert.ErrorIs(t, err, ErrInvalidNotification)
	})
	checkout, err := provider.Create(context.Background(), CreateRequest{TradeNo: "ORDER1", AmountCents: 1234, Description: "API service credit", NotifyURL: "https://merchant.example/notify", ReturnURL: "https://merchant.example/wallet", Scene: "page", ExpiresAt: time.Now().Add(10 * time.Minute)})
	require.NoError(t, err)
	assert.Equal(t, "redirect", checkout.Kind)
	u, err := url.Parse(checkout.URL)
	require.NoError(t, err)
	assert.Equal(t, "openapi.alipay.com", u.Host)
	assert.Equal(t, "alipay.trade.page.pay", u.Query().Get("method"))
	var business map[string]any
	require.NoError(t, common.UnmarshalJsonStr(u.Query().Get("biz_content"), &business))
	assert.Equal(t, "12.34", business["total_amount"])
	assert.Equal(t, "seller-1", business["seller_id"])
}

func wechatNotification(t *testing.T, key *rsa.PrivateKey, transaction map[string]any, timestamp time.Time) *http.Request {
	t.Helper()
	plaintext, err := common.Marshal(transaction)
	require.NoError(t, err)
	block, err := aes.NewCipher([]byte("01234567890123456789012345678901"))
	require.NoError(t, err)
	aead, err := cipher.NewGCM(block)
	require.NoError(t, err)
	nonce := "012345678901"
	ciphertext := aead.Seal(nil, []byte(nonce), plaintext, []byte("transaction"))
	body, err := common.Marshal(map[string]any{"id": "EVENT1", "event_type": "TRANSACTION.SUCCESS", "resource_type": "encrypt-resource", "resource": map[string]string{"algorithm": "AEAD_AES_256_GCM", "nonce": nonce, "associated_data": "transaction", "ciphertext": base64.StdEncoding.EncodeToString(ciphertext)}})
	require.NoError(t, err)
	request := httptest.NewRequest(http.MethodPost, "https://merchant.example/notify", strings.NewReader(string(body)))
	ts := strconv.FormatInt(timestamp.Unix(), 10)
	request.Header.Set("Wechatpay-Serial", "PUB_KEY_ID_TEST")
	request.Header.Set("Wechatpay-Timestamp", ts)
	request.Header.Set("Wechatpay-Nonce", "header-nonce")
	request.Header.Set("Wechatpay-Signature", signPaymentMessage(t, key, ts+"\nheader-nonce\n"+string(body)+"\n"))
	return request
}

func TestWechatNotificationContract(t *testing.T) {
	f := newPaymentKeyFixture(t)
	provider, err := newWechat(native_payment_setting.Profile{ID: "wx-v1", Provider: "wechat", AppID: "app-1", MerchantID: "merchant-1", PrivateKeyFile: f.privatePath, WechatSerialNo: "serial", WechatPublicKeyID: "PUB_KEY_ID_TEST", WechatPublicKeyFile: f.publicPath, WechatAPIv3KeyFile: f.apiPath})
	require.NoError(t, err)
	for _, tc := range []struct {
		name, app, merchant, currency string
		age                           time.Duration
		expected                      error
	}{
		{"paid", "app-1", "merchant-1", "CNY", 0, nil},
		{"wrong app", "other", "merchant-1", "CNY", 0, ErrIdentityMismatch},
		{"wrong merchant", "app-1", "other", "CNY", 0, ErrIdentityMismatch},
		{"wrong currency", "app-1", "merchant-1", "USD", 0, ErrInvalidNotification},
		{"expired signature", "app-1", "merchant-1", "CNY", -10 * time.Minute, ErrInvalidNotification},
	} {
		t.Run(tc.name, func(t *testing.T) {
			transaction := map[string]any{"appid": tc.app, "mchid": tc.merchant, "out_trade_no": "ORDER1", "transaction_id": "WX_TRANSACTION1", "trade_state": "SUCCESS", "success_time": "2026-11-06T12:00:00+08:00", "amount": map[string]any{"total": 1234, "payer_total": 1000, "currency": tc.currency}}
			payment, err := provider.VerifyNotify(wechatNotification(t, f.key, transaction, time.Now().Add(tc.age)))
			if tc.expected != nil {
				require.ErrorIs(t, err, tc.expected)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, int64(1234), payment.AmountCents)
			assert.Equal(t, StatusPaid, payment.Status)
			request := wechatNotification(t, f.key, transaction, time.Now())
			request.Header.Set("Wechatpay-Signature", "invalid")
			_, err = provider.VerifyNotify(request)
			assert.ErrorIs(t, err, ErrInvalidNotification)
		})
	}
}

func TestPaymentAmountAndProfileBoundaries(t *testing.T) {
	for _, tc := range []struct {
		input string
		cents int64
		valid bool
	}{
		{"0.01", 1, true}, {"123.4", 12340, true}, {"1000000.00", MaxAmountCents, true},
		{"0", 0, false}, {"-1", 0, false}, {"1e2", 0, false}, {"1.001", 0, false}, {"1.", 0, false}, {"1.2.3", 0, false}, {"1000000.01", 0, false}, {"99999999999999999999", 0, false},
	} {
		t.Run(tc.input, func(t *testing.T) {
			value, err := ParseCNY(tc.input)
			if !tc.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.cents, value)
		})
	}
	f := newPaymentKeyFixture(t)
	profile := native_payment_setting.Profile{ID: "old-ali", Provider: "alipay", AppID: "app", MerchantID: "seller", PrivateKeyFile: f.privatePath, AlipayPublicKeyFile: f.publicPath}
	config := &native_payment_setting.Config{Profiles: []native_payment_setting.Profile{profile}}
	r, err := NewRegistry(config)
	require.NoError(t, err)
	_, ok := r.Active("alipay")
	assert.False(t, ok)
	_, ok = r.Get("old-ali")
	assert.True(t, ok, "disabled profile must still verify and query existing orders")
	serialized, err := common.Marshal(r.Profiles())
	require.NoError(t, err)
	assert.NotContains(t, string(serialized), f.privatePath)
	assert.NotContains(t, string(serialized), "PRIVATE KEY")
	profile.Enabled = true
	config.Profiles = []native_payment_setting.Profile{profile, profile}
	assert.Error(t, config.Validate())
}
