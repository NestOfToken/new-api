package nativepay

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/native_payment_setting"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/verifiers"
	"github.com/wechatpay-apiv3/wechatpay-go/core/notify"
	"github.com/wechatpay-apiv3/wechatpay-go/core/option"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/h5"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/native"
	"github.com/wechatpay-apiv3/wechatpay-go/services/refunddomestic"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type wechatProvider struct {
	providerIdentity
	client *core.Client
	notify *notify.Handler
}

func newWechat(profile native_payment_setting.Profile) (Provider, error) {
	privatePEM, err := readKeyFile(profile.PrivateKeyFile)
	if err != nil {
		return nil, err
	}
	privateKey, err := utils.LoadPrivateKey(privatePEM)
	if err != nil || privateKey.N.BitLen() < 2048 {
		return nil, errors.New("invalid WeChat merchant private key")
	}
	publicPEM, err := readKeyFile(profile.WechatPublicKeyFile)
	if err != nil {
		return nil, err
	}
	publicKey, err := utils.LoadPublicKey(publicPEM)
	if err != nil || publicKey.N.BitLen() < 2048 {
		return nil, errors.New("invalid WeChat verification public key")
	}
	apiKey, err := readKeyFile(profile.WechatAPIv3KeyFile)
	if err != nil {
		return nil, err
	}
	if len(apiKey) != 32 {
		return nil, errors.New("invalid WeChat API v3 key length")
	}
	client, err := core.NewClient(context.Background(),
		option.WithWechatPayPublicKeyAuthCipher(profile.MerchantID, profile.WechatSerialNo, privateKey, profile.WechatPublicKeyID, publicKey),
		option.WithHTTPClient(&http.Client{Timeout: 15 * time.Second, CheckRedirect: rejectRedirect}),
	)
	if err != nil {
		return nil, errors.New("cannot initialize WeChat client")
	}
	handler, err := notify.NewRSANotifyHandler(apiKey, verifiers.NewSHA256WithRSAPubkeyVerifier(profile.WechatPublicKeyID, *publicKey))
	if err != nil {
		return nil, errors.New("cannot initialize WeChat notification verifier")
	}
	return &wechatProvider{providerIdentity: providerIdentity{profile: profile}, client: client, notify: handler}, nil
}

func (p *wechatProvider) Create(ctx context.Context, req CreateRequest) (*Checkout, error) {
	if err := p.validateCreate(req); err != nil {
		return nil, err
	}
	notifyURL, _ := url.Parse(req.NotifyURL)
	if notifyURL.RawQuery != "" {
		return nil, ErrInvalidRequest
	}
	if req.Scene == "h5" {
		if net.ParseIP(req.ClientIP) == nil {
			return nil, ErrInvalidRequest
		}
		svc := h5.H5ApiService{Client: p.client}
		response, _, err := svc.Prepay(ctx, h5.PrepayRequest{
			Appid: core.String(p.AppID()), Mchid: core.String(p.MerchantID()), Description: core.String(req.Description), OutTradeNo: core.String(req.TradeNo),
			NotifyUrl: core.String(req.NotifyURL), TimeExpire: &req.ExpiresAt, Amount: &h5.Amount{Total: &req.AmountCents, Currency: core.String("CNY")},
			SceneInfo: &h5.SceneInfo{PayerClientIp: core.String(req.ClientIP), H5Info: &h5.H5Info{Type: core.String("Wap")}},
		})
		if err != nil {
			return nil, wechatError(err)
		}
		if response == nil || response.H5Url == nil {
			return nil, ErrProviderUnavailable
		}
		u, err := url.Parse(*response.H5Url)
		if err != nil || u.Scheme != "https" || u.Hostname() != "wx.tenpay.com" {
			return nil, ErrProviderUnavailable
		}
		if req.ReturnURL != "" {
			q := u.Query()
			q.Set("redirect_url", req.ReturnURL)
			u.RawQuery = q.Encode()
		}
		return &Checkout{Kind: "redirect", URL: u.String()}, nil
	}
	svc := native.NativeApiService{Client: p.client}
	response, _, err := svc.Prepay(ctx, native.PrepayRequest{
		Appid: core.String(p.AppID()), Mchid: core.String(p.MerchantID()), Description: core.String(req.Description), OutTradeNo: core.String(req.TradeNo),
		NotifyUrl: core.String(req.NotifyURL), TimeExpire: &req.ExpiresAt, Amount: &native.Amount{Total: &req.AmountCents, Currency: core.String("CNY")},
	})
	if err != nil {
		return nil, wechatError(err)
	}
	if response == nil || response.CodeUrl == nil || *response.CodeUrl == "" {
		return nil, ErrProviderUnavailable
	}
	return &Checkout{Kind: "qr", URL: *response.CodeUrl}, nil
}

func (p *wechatProvider) Query(ctx context.Context, tradeNo string) (*Payment, error) {
	if !tradeNoPattern.MatchString(tradeNo) {
		return nil, ErrInvalidRequest
	}
	svc := native.NativeApiService{Client: p.client}
	response, _, err := svc.QueryOrderByOutTradeNo(ctx, native.QueryOrderByOutTradeNoRequest{Mchid: core.String(p.MerchantID()), OutTradeNo: core.String(tradeNo)})
	if err != nil {
		return nil, wechatError(err)
	}
	result, err := p.payment(response)
	if err != nil {
		return nil, err
	}
	if result.TradeNo != tradeNo {
		return nil, ErrIdentityMismatch
	}
	return result, nil
}

func (p *wechatProvider) Close(ctx context.Context, tradeNo string) error {
	if !tradeNoPattern.MatchString(tradeNo) {
		return ErrInvalidRequest
	}
	svc := native.NativeApiService{Client: p.client}
	_, err := svc.CloseOrder(ctx, native.CloseOrderRequest{Mchid: core.String(p.MerchantID()), OutTradeNo: core.String(tradeNo)})
	if err != nil {
		return wechatError(err)
	}
	return nil
}

func (p *wechatProvider) VerifyNotify(request *http.Request) (*Payment, error) {
	if request.Method != http.MethodPost {
		return nil, ErrInvalidNotification
	}
	// Limit SDK buffering and validate nonce length before AES-GCM can panic.
	body, err := io.ReadAll(io.LimitReader(request.Body, 1024*1024+1))
	if err != nil || len(body) > 1024*1024 {
		return nil, ErrInvalidNotification
	}
	var envelope struct {
		EventType string `json:"event_type"`
		Resource  struct {
			Nonce string `json:"nonce"`
		} `json:"resource"`
	}
	if common.Unmarshal(body, &envelope) != nil || len(envelope.Resource.Nonce) != 12 || envelope.EventType != "TRANSACTION.SUCCESS" {
		return nil, ErrInvalidNotification
	}
	request.Body = io.NopCloser(bytes.NewReader(body))
	transaction := new(payments.Transaction)
	_, err = p.notify.ParseNotifyRequest(request.Context(), request, transaction)
	if err != nil {
		return nil, ErrInvalidNotification
	}
	result, err := p.payment(transaction)
	if err != nil {
		return nil, err
	}
	if result.Status != StatusPaid {
		return nil, ErrInvalidNotification
	}
	return result, nil
}

func (p *wechatProvider) payment(t *payments.Transaction) (*Payment, error) {
	if t == nil || t.Mchid == nil || t.Appid == nil || *t.Mchid != p.MerchantID() || *t.Appid != p.AppID() {
		return nil, ErrIdentityMismatch
	}
	if t.OutTradeNo == nil || !tradeNoPattern.MatchString(*t.OutTradeNo) || t.TradeState == nil || t.Amount == nil || t.Amount.Total == nil || *t.Amount.Total < 1 || *t.Amount.Total > MaxAmountCents || t.Amount.Currency == nil || *t.Amount.Currency != "CNY" {
		return nil, ErrInvalidNotification
	}
	result := &Payment{TradeNo: *t.OutTradeNo, MerchantID: p.MerchantID(), AppID: p.AppID(), Currency: "CNY", AmountCents: *t.Amount.Total, Status: StatusUnknown}
	if t.TransactionId != nil {
		result.TransactionID = *t.TransactionId
	}
	switch *t.TradeState {
	case "SUCCESS":
		result.Status = StatusPaid
		if result.TransactionID == "" || t.SuccessTime == nil {
			return nil, ErrInvalidNotification
		}
		paidAt, err := time.Parse(time.RFC3339, *t.SuccessTime)
		if err != nil {
			return nil, ErrInvalidNotification
		}
		result.PaidAt = paidAt
	case "NOTPAY", "USERPAYING":
		result.Status = StatusPending
	case "CLOSED", "REVOKED", "PAYERROR":
		result.Status = StatusClosed
	case "REFUND":
		result.Status = StatusRefunded
	}
	return result, nil
}

func (p *wechatProvider) Refund(ctx context.Context, req RefundRequest) (*RefundResult, error) {
	if err := validateRefund(req); err != nil {
		return nil, err
	}
	svc := refunddomestic.RefundsApiService{Client: p.client}
	response, _, err := svc.Create(ctx, refunddomestic.CreateRequest{OutTradeNo: core.String(req.TradeNo), OutRefundNo: core.String(req.RefundNo), Reason: core.String(req.Reason), Amount: &refunddomestic.AmountReq{Total: &req.TotalCents, Refund: &req.AmountCents, Currency: core.String("CNY")}})
	if err != nil {
		return nil, wechatError(err)
	}
	result, err := wechatRefund(response, RefundQuery{TradeNo: req.TradeNo, RefundNo: req.RefundNo})
	if err != nil {
		return nil, err
	}
	if result.AmountCents != req.AmountCents {
		return nil, ErrInvalidNotification
	}
	return result, nil
}

func (p *wechatProvider) QueryRefund(ctx context.Context, req RefundQuery) (*RefundResult, error) {
	if !tradeNoPattern.MatchString(req.TradeNo) || !tradeNoPattern.MatchString(req.RefundNo) {
		return nil, ErrInvalidRequest
	}
	svc := refunddomestic.RefundsApiService{Client: p.client}
	response, _, err := svc.QueryByOutRefundNo(ctx, refunddomestic.QueryByOutRefundNoRequest{OutRefundNo: core.String(req.RefundNo)})
	if err != nil {
		var apiError *core.APIError
		if errors.As(err, &apiError) && apiError.Code == "RESOURCE_NOT_EXISTS" {
			return nil, ErrRefundNotFound
		}
		return nil, wechatError(err)
	}
	return wechatRefund(response, req)
}

func wechatRefund(r *refunddomestic.Refund, req RefundQuery) (*RefundResult, error) {
	if r == nil || r.OutTradeNo == nil || *r.OutTradeNo != req.TradeNo || r.OutRefundNo == nil || *r.OutRefundNo != req.RefundNo || r.RefundId == nil || *r.RefundId == "" || r.Status == nil || r.Amount == nil || r.Amount.Refund == nil || *r.Amount.Refund < 1 || *r.Amount.Refund > MaxAmountCents || r.Amount.Currency == nil || *r.Amount.Currency != "CNY" {
		return nil, ErrInvalidNotification
	}
	result := &RefundResult{TradeNo: req.TradeNo, RefundNo: req.RefundNo, RefundID: *r.RefundId, AmountCents: *r.Amount.Refund, Status: RefundProcessing}
	switch string(*r.Status) {
	case "SUCCESS":
		result.Status = RefundSuccess
	case "CLOSED":
		result.Status = RefundFailed
	case "ABNORMAL":
		// Funds can remain in the refund intermediate account. Keep the local
		// reservation pending while the merchant resolves the official refund.
		result.Status = RefundManualReview
	}
	return result, nil
}

func wechatError(err error) error {
	var apiError *core.APIError
	if errors.As(err, &apiError) && apiError.Code == "ORDER_NOT_EXIST" {
		return ErrOrderNotFound
	}
	return ErrProviderUnavailable
}

func rejectRedirect(*http.Request, []*http.Request) error {
	return errors.New("payment API redirects are disabled")
}
