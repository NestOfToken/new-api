package nativepay

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/native_payment_setting"
	alipay "github.com/smartwalle/alipay/v3"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

var chinaTime = time.FixedZone("CST", 8*60*60)

type alipayProvider struct {
	providerIdentity
	client *alipay.Client
}

func newAlipay(profile native_payment_setting.Profile) (Provider, error) {
	privatePEM, err := readKeyFile(profile.PrivateKeyFile)
	if err != nil {
		return nil, err
	}
	privateKey, err := utils.LoadPrivateKey(privatePEM)
	if err != nil || privateKey.N.BitLen() < 2048 {
		return nil, errors.New("invalid Alipay application private key")
	}
	client, err := alipay.New(profile.AppID, privatePEM, !profile.Sandbox, alipay.WithHTTPClient(&http.Client{Timeout: 15 * time.Second, CheckRedirect: rejectRedirect}), alipay.WithTimeLocation(chinaTime))
	if err != nil {
		return nil, errors.New("cannot initialize Alipay client")
	}
	if profile.AlipayPublicKeyFile != "" {
		publicPEM, err := readKeyFile(profile.AlipayPublicKeyFile)
		if err != nil {
			return nil, err
		}
		publicKey, err := utils.LoadPublicKey(publicPEM)
		if err != nil || publicKey.N.BitLen() < 2048 {
			return nil, errors.New("invalid Alipay verification public key")
		}
		if err := client.LoadAliPayPublicKey(publicPEM); err != nil {
			return nil, errors.New("cannot load Alipay verification public key")
		}
	} else {
		for _, cert := range []struct {
			path string
			load func(string) error
		}{
			{profile.AlipayAppCertFile, client.LoadAppCertPublicKey},
			{profile.AlipayRootCertFile, client.LoadAliPayRootCert},
			{profile.AlipayCertFile, client.LoadAlipayCertPublicKey},
		} {
			pem, err := readKeyFile(cert.path)
			if err != nil {
				return nil, err
			}
			if err := cert.load(pem); err != nil {
				return nil, errors.New("cannot load Alipay certificate")
			}
		}
	}
	return &alipayProvider{providerIdentity: providerIdentity{profile: profile}, client: client}, nil
}

func (p *alipayProvider) Create(ctx context.Context, req CreateRequest) (*Checkout, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if err := p.validateCreate(req); err != nil {
		return nil, err
	}
	trade := alipay.Trade{NotifyURL: req.NotifyURL, ReturnURL: req.ReturnURL, Subject: req.Description, OutTradeNo: req.TradeNo, TotalAmount: FormatCNY(req.AmountCents), SellerId: p.MerchantID(), GoodsType: "0", TimeExpire: req.ExpiresAt.In(chinaTime).Format("2006-01-02 15:04:05")}
	var target *url.URL
	var err error
	if req.Scene == "wap" {
		trade.ProductCode = "QUICK_WAP_WAY"
		target, err = p.client.TradeWapPay(alipay.TradeWapPay{Trade: trade})
	} else {
		trade.ProductCode = "FAST_INSTANT_TRADE_PAY"
		target, err = p.client.TradePagePay(alipay.TradePagePay{Trade: trade})
	}
	if err != nil || target == nil {
		return nil, ErrProviderUnavailable
	}
	return &Checkout{Kind: "redirect", URL: target.String()}, nil
}

func (p *alipayProvider) Query(ctx context.Context, tradeNo string) (*Payment, error) {
	if !tradeNoPattern.MatchString(tradeNo) {
		return nil, ErrInvalidRequest
	}
	response, err := p.client.TradeQuery(ctx, alipay.TradeQuery{OutTradeNo: tradeNo})
	if err != nil {
		return nil, alipayError(err)
	}
	if response == nil {
		return nil, ErrProviderUnavailable
	}
	if !response.IsSuccess() {
		return nil, alipayError(response.Error)
	}
	if response.OutTradeNo != tradeNo {
		return nil, ErrIdentityMismatch
	}
	if response.TransCurrency != "" && response.TransCurrency != "CNY" {
		return nil, ErrInvalidNotification
	}
	amount, err := ParseCNY(response.TotalAmount)
	if err != nil {
		return nil, ErrInvalidNotification
	}
	result := &Payment{TradeNo: tradeNo, TransactionID: response.TradeNo, MerchantID: p.MerchantID(), AppID: p.AppID(), Currency: "CNY", AmountCents: amount, Status: alipayStatus(response.TradeStatus)}
	if result.Status == StatusPaid {
		if result.TransactionID == "" {
			return nil, ErrInvalidNotification
		}
		paidAt, err := time.ParseInLocation("2006-01-02 15:04:05", response.SendPayDate, chinaTime)
		if err != nil {
			return nil, ErrInvalidNotification
		}
		result.PaidAt = paidAt
	}
	return result, nil
}

func (p *alipayProvider) Close(ctx context.Context, tradeNo string) error {
	if !tradeNoPattern.MatchString(tradeNo) {
		return ErrInvalidRequest
	}
	response, err := p.client.TradeClose(ctx, alipay.TradeClose{OutTradeNo: tradeNo})
	if err != nil {
		return alipayError(err)
	}
	if response == nil {
		return ErrProviderUnavailable
	}
	if !response.IsSuccess() {
		return alipayError(response.Error)
	}
	if response.OutTradeNo != tradeNo {
		return ErrIdentityMismatch
	}
	return nil
}

func (p *alipayProvider) VerifyNotify(request *http.Request) (*Payment, error) {
	mediaType, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if request.Method != http.MethodPost || err != nil || mediaType != "application/x-www-form-urlencoded" {
		return nil, ErrInvalidNotification
	}
	body, err := io.ReadAll(io.LimitReader(request.Body, 1024*1024+1))
	if err != nil || len(body) > 1024*1024 {
		return nil, ErrInvalidNotification
	}
	values, err := url.ParseQuery(string(body))
	if err != nil {
		return nil, ErrInvalidNotification
	}
	for _, v := range values {
		if len(v) != 1 {
			return nil, ErrInvalidNotification
		}
	}
	if values.Get("sign_type") != "RSA2" || (values.Get("charset") != "" && !strings.EqualFold(values.Get("charset"), "utf-8")) {
		return nil, ErrInvalidNotification
	}
	// This routing hint is not signed by Alipay. Pin notification verification to
	// this profile's trusted key instead of fetching attacker-selected certificates.
	values.Del("alipay_cert_sn")
	notification, err := p.client.DecodeNotification(request.Context(), values)
	if err != nil {
		return nil, ErrInvalidNotification
	}
	if notification.AppId != p.AppID() || notification.SellerId != p.MerchantID() {
		return nil, ErrIdentityMismatch
	}
	if !tradeNoPattern.MatchString(notification.OutTradeNo) || notification.TradeNo == "" {
		return nil, ErrInvalidNotification
	}
	amount, err := ParseCNY(notification.TotalAmount)
	if err != nil {
		return nil, ErrInvalidNotification
	}
	result := &Payment{TradeNo: notification.OutTradeNo, TransactionID: notification.TradeNo, MerchantID: p.MerchantID(), AppID: p.AppID(), Currency: "CNY", AmountCents: amount, Status: alipayStatus(notification.TradeStatus)}
	if result.Status == StatusPaid {
		paidAt, err := time.ParseInLocation("2006-01-02 15:04:05", notification.GmtPayment, chinaTime)
		if err != nil {
			return nil, ErrInvalidNotification
		}
		result.PaidAt = paidAt
	}
	return result, nil
}

func (p *alipayProvider) Refund(ctx context.Context, req RefundRequest) (*RefundResult, error) {
	if err := validateRefund(req); err != nil {
		return nil, err
	}
	response, err := p.client.TradeRefund(ctx, alipay.TradeRefund{OutTradeNo: req.TradeNo, OutRequestNo: req.RefundNo, RefundAmount: FormatCNY(req.AmountCents), RefundReason: req.Reason})
	if err != nil {
		return nil, alipayError(err)
	}
	if response == nil {
		return nil, ErrProviderUnavailable
	}
	if !response.IsSuccess() {
		return nil, alipayError(response.Error)
	}
	if response.OutTradeNo != req.TradeNo {
		return nil, ErrIdentityMismatch
	}
	// A successful API call or fund_change=N does not prove this refund completed.
	if response.FundChange != "Y" {
		return p.QueryRefund(ctx, RefundQuery{TradeNo: req.TradeNo, RefundNo: req.RefundNo})
	}
	amount, err := ParseCNY(response.RefundFee)
	if err != nil || amount != req.AmountCents {
		return nil, ErrInvalidNotification
	}
	return &RefundResult{TradeNo: req.TradeNo, RefundNo: req.RefundNo, RefundID: req.RefundNo, Status: RefundSuccess, AmountCents: amount}, nil
}

func (p *alipayProvider) QueryRefund(ctx context.Context, req RefundQuery) (*RefundResult, error) {
	if !tradeNoPattern.MatchString(req.TradeNo) || !tradeNoPattern.MatchString(req.RefundNo) {
		return nil, ErrInvalidRequest
	}
	response, err := p.client.TradeFastPayRefundQuery(ctx, alipay.TradeFastPayRefundQuery{OutTradeNo: req.TradeNo, OutRequestNo: req.RefundNo})
	if err != nil {
		return nil, alipayError(err)
	}
	if response == nil {
		return nil, ErrProviderUnavailable
	}
	if !response.IsSuccess() {
		return nil, alipayError(response.Error)
	}
	result := &RefundResult{TradeNo: req.TradeNo, RefundNo: req.RefundNo, Status: RefundProcessing}
	if response.RefundStatus != "REFUND_SUCCESS" {
		return result, nil
	}
	if response.OutTradeNo != req.TradeNo || response.OutRequestNo != req.RefundNo {
		return nil, ErrIdentityMismatch
	}
	amount, err := ParseCNY(response.RefundAmount)
	if err != nil {
		return nil, ErrInvalidNotification
	}
	result.AmountCents = amount
	result.RefundID = req.RefundNo
	result.Status = RefundSuccess
	return result, nil
}

func alipayStatus(status alipay.TradeStatus) string {
	switch status {
	case alipay.TradeStatusSuccess, alipay.TradeStatusFinished:
		return StatusPaid
	case alipay.TradeStatusWaitBuyerPay:
		return StatusPending
	case alipay.TradeStatusClosed:
		return StatusClosed
	default:
		return StatusUnknown
	}
}

func alipayError(err error) error {
	var providerError *alipay.Error
	if errors.As(err, &providerError) && providerError.SubCode == "ACQ.TRADE_NOT_EXIST" {
		return ErrOrderNotFound
	}
	if providerError, ok := err.(alipay.Error); ok && providerError.SubCode == "ACQ.TRADE_NOT_EXIST" {
		return ErrOrderNotFound
	}
	return ErrProviderUnavailable
}
