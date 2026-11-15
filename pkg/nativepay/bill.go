package nativepay

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha1" // WeChat's authenticated bill metadata specifies SHA1.
	"encoding/csv"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	alipay "github.com/smartwalle/alipay/v3"
	"github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/core/auth/validators"
	"golang.org/x/text/encoding/simplifiedchinese"
)

const maxBillBytes = 32 * 1024 * 1024

var ErrBillUnavailable = errors.New("native payment bill is unavailable")
var ErrBillFormat = errors.New("unsupported or invalid native payment bill format")

// BillProvider retrieves transaction bills, not bank settlement statements.
// Bill rows are reconciliation evidence; verify current status through Query or
// QueryRefund before changing orders, especially for historical refund rows.
type BillProvider interface {
	DownloadBill(context.Context, string) (*Bill, error)
}

type Bill struct {
	Date       string      `json:"date"`
	Provider   string      `json:"provider"`
	MerchantID string      `json:"merchant_id"`
	Entries    []BillEntry `json:"entries"`
}

type BillEntry struct {
	TradeNo       string `json:"trade_no"`
	TransactionID string `json:"transaction_id"`
	RefundNo      string `json:"refund_no,omitempty"`
	Kind          string `json:"kind"`
	Status        string `json:"status"`
	AmountCents   int64  `json:"amount_cents"`
	FeeCents      int64  `json:"fee_cents"`
}

func validateBillDate(date string) error {
	d, err := time.ParseInLocation("2006-01-02", date, chinaTime)
	if err != nil || d.Format("2006-01-02") != date || date >= time.Now().In(chinaTime).Format("2006-01-02") {
		return ErrInvalidRequest
	}
	return nil
}

func (p *wechatProvider) DownloadBill(ctx context.Context, date string) (*Bill, error) {
	if err := validateBillDate(date); err != nil {
		return nil, err
	}
	result, err := p.client.Request(ctx, http.MethodGet, "https://api.mch.weixin.qq.com/v3/bill/tradebill", nil, url.Values{"bill_date": {date}, "bill_type": {"ALL"}}, nil, "")
	if err != nil {
		return nil, ErrBillUnavailable
	}
	defer result.Response.Body.Close()
	var metadata struct {
		DownloadURL string `json:"download_url"`
		HashType    string `json:"hash_type"`
		HashValue   string `json:"hash_value"`
	}
	if err := common.DecodeJson(io.LimitReader(result.Response.Body, 64*1024), &metadata); err != nil || metadata.HashType != "SHA1" {
		return nil, ErrBillFormat
	}
	expected, err := hex.DecodeString(metadata.HashValue)
	if err != nil || len(expected) != sha1.Size {
		return nil, ErrBillFormat
	}
	u, err := url.Parse(metadata.DownloadURL)
	if err != nil || u.Scheme != "https" || (u.Host != "api.mch.weixin.qq.com" && u.Host != "api2.mch.weixin.qq.com") || u.Path != "/v3/billdownload/file" || u.User != nil || u.Fragment != "" {
		return nil, ErrBillFormat
	}
	// File responses have no API response signature. Only this copy skips that
	// check; the complete file is checked against the signed metadata's digest.
	downloadClient := core.NewClientWithValidator(p.client, &validators.NullValidator{})
	file, err := downloadClient.Get(ctx, u.String())
	if err != nil {
		return nil, ErrBillUnavailable
	}
	defer file.Response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(file.Response.Body, maxBillBytes+1))
	if err != nil || len(body) > maxBillBytes {
		return nil, ErrBillFormat
	}
	digest := sha1.Sum(body)
	if !bytes.Equal(digest[:], expected) {
		return nil, ErrBillFormat
	}
	entries, err := parseWechatBill(body, p.MerchantID(), p.AppID())
	if err != nil {
		return nil, err
	}
	return &Bill{Date: date, Provider: p.Name(), MerchantID: p.MerchantID(), Entries: entries}, nil
}

func (p *alipayProvider) DownloadBill(ctx context.Context, date string) (*Bill, error) {
	if err := validateBillDate(date); err != nil {
		return nil, err
	}
	response, err := p.client.BillDownloadURLQuery(ctx, alipay.BillDownloadURLQuery{BillType: "trade", BillDate: date})
	if err != nil || response == nil || !response.IsSuccess() {
		return nil, ErrBillUnavailable
	}
	u, err := url.Parse(response.BillDownloadURL)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host != "dwbillcenter.alipay.com" || u.User != nil || u.Fragment != "" {
		return nil, ErrBillFormat
	}
	// Older API responses use HTTP URLs. Never send the download token over HTTP.
	u.Scheme = "https"
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, ErrBillUnavailable
	}
	client := &http.Client{Timeout: 30 * time.Second, CheckRedirect: rejectRedirect}
	file, err := client.Do(request)
	if err != nil {
		return nil, ErrBillUnavailable
	}
	defer file.Body.Close()
	if file.StatusCode != http.StatusOK {
		return nil, ErrBillUnavailable
	}
	body, err := io.ReadAll(io.LimitReader(file.Body, maxBillBytes+1))
	if err != nil || len(body) > maxBillBytes {
		return nil, ErrBillFormat
	}
	entries, err := parseAlipayBillArchive(body)
	if err != nil {
		return nil, err
	}
	return &Bill{Date: date, Provider: p.Name(), MerchantID: p.MerchantID(), Entries: entries}, nil
}

func cleanBillField(field string) string {
	return strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(field), "`"))
}

func billMoney(value string) (int64, error) {
	negative := strings.HasPrefix(value, "-")
	value = strings.TrimPrefix(value, "-")
	if value == "0" || value == "0.0" || value == "0.00" {
		return 0, nil
	}
	amount, err := ParseCNY(value)
	if err != nil {
		return 0, ErrBillFormat
	}
	if negative {
		amount = -amount
	}
	return amount, nil
}

func parseWechatBill(body []byte, merchantID, appID string) ([]BillEntry, error) {
	reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(body, []byte{0xef, 0xbb, 0xbf})))
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err != nil {
		return nil, ErrBillFormat
	}
	columns := make(map[string]int, len(header))
	for i, name := range header {
		name = cleanBillField(name)
		if _, ok := columns[name]; ok {
			return nil, ErrBillFormat
		}
		columns[name] = i
	}
	for _, name := range []string{"公众账号ID", "商户号", "微信订单号", "商户订单号", "交易状态", "货币种类", "订单金额", "申请退款金额", "商户退款单号", "退款状态", "手续费"} {
		if _, ok := columns[name]; !ok {
			return nil, ErrBillFormat
		}
	}
	entries := make([]BillEntry, 0)
	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil || len(row) == 0 {
			return nil, ErrBillFormat
		}
		if cleanBillField(row[0]) == "总交易单数" {
			break
		}
		if len(row) != len(header) {
			return nil, ErrBillFormat
		}
		for i := range row {
			row[i] = cleanBillField(row[i])
		}
		if row[columns["商户号"]] != merchantID {
			return nil, ErrIdentityMismatch
		}
		if row[columns["公众账号ID"]] != appID {
			continue
		}
		if row[columns["货币种类"]] != "CNY" {
			return nil, ErrBillFormat
		}
		entry := BillEntry{TradeNo: row[columns["商户订单号"]], TransactionID: row[columns["微信订单号"]]}
		if entry.TradeNo == "" || entry.TransactionID == "" {
			return nil, ErrBillFormat
		}
		switch row[columns["交易状态"]] {
		case "SUCCESS":
			entry.Kind = "payment"
			entry.Status = StatusPaid
			entry.AmountCents, err = billMoney(row[columns["订单金额"]])
		case "REFUND", "REVOKED":
			entry.Kind = "refund"
			entry.RefundNo = row[columns["商户退款单号"]]
			entry.Status = RefundProcessing
			entry.AmountCents, err = billMoney(row[columns["申请退款金额"]])
			if row[columns["退款状态"]] == "SUCCESS" {
				entry.Status = RefundSuccess
			}
			if row[columns["退款状态"]] == "FAIL" {
				entry.Status = RefundFailed
			}
		default:
			return nil, ErrBillFormat
		}
		if err != nil || entry.AmountCents <= 0 {
			return nil, ErrBillFormat
		}
		entry.FeeCents, err = billMoney(row[columns["手续费"]])
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, nil
}

func parseAlipayBillArchive(data []byte) ([]BillEntry, error) {
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil || len(archive.File) > 100 {
		return nil, ErrBillFormat
	}
	entries := make([]BillEntry, 0)
	remaining := int64(2 * maxBillBytes)
	detailFiles := 0
	for _, file := range archive.File {
		name := file.Name
		if !utf8.ValidString(name) {
			decoded, err := simplifiedchinese.GBK.NewDecoder().Bytes([]byte(name))
			if err != nil {
				return nil, ErrBillFormat
			}
			name = string(decoded)
		}
		if file.FileInfo().IsDir() || !strings.HasSuffix(strings.ToLower(name), ".csv") || strings.Contains(name, "汇总") {
			continue
		}
		if file.UncompressedSize64 > uint64(remaining) {
			return nil, ErrBillFormat
		}
		reader, err := file.Open()
		if err != nil {
			return nil, ErrBillFormat
		}
		body, readErr := io.ReadAll(io.LimitReader(reader, remaining+1))
		closeErr := reader.Close()
		if readErr != nil || closeErr != nil || int64(len(body)) > remaining {
			return nil, ErrBillFormat
		}
		remaining -= int64(len(body))
		if !utf8.Valid(body) {
			body, err = simplifiedchinese.GBK.NewDecoder().Bytes(body)
			if err != nil {
				return nil, ErrBillFormat
			}
		}
		rows, err := parseAlipayBill(body)
		if err != nil {
			return nil, err
		}
		entries = append(entries, rows...)
		detailFiles++
	}
	if detailFiles == 0 {
		return nil, ErrBillFormat
	}
	return entries, nil
}

func parseAlipayBill(body []byte) ([]BillEntry, error) {
	reader := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(body, []byte{0xef, 0xbb, 0xbf})))
	reader.FieldsPerRecord = -1
	reader.Comment = '#'
	columns := make(map[string]int)
	var header []string
	for {
		row, err := reader.Read()
		if err != nil {
			return nil, ErrBillFormat
		}
		if len(row) > 0 && cleanBillField(row[0]) == "支付宝交易号" {
			header = row
			break
		}
	}
	for i, name := range header {
		name = cleanBillField(name)
		if _, ok := columns[name]; ok {
			return nil, ErrBillFormat
		}
		columns[name] = i
	}
	for _, name := range []string{"支付宝交易号", "商户订单号", "业务类型", "订单金额（元）", "服务费（元）"} {
		if _, ok := columns[name]; !ok {
			return nil, ErrBillFormat
		}
	}
	refundColumn, hasRefundColumn := columns["退款批次号/请求号"]
	if !hasRefundColumn {
		refundColumn, hasRefundColumn = columns["退款批次号"]
	}
	entries := make([]BillEntry, 0)
	for {
		row, err := reader.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil || len(row) != len(header) {
			return nil, ErrBillFormat
		}
		for i := range row {
			row[i] = cleanBillField(row[i])
		}
		entry := BillEntry{TradeNo: row[columns["商户订单号"]], TransactionID: row[columns["支付宝交易号"]]}
		if entry.TradeNo == "" || entry.TransactionID == "" {
			return nil, ErrBillFormat
		}
		entry.AmountCents, err = billMoney(row[columns["订单金额（元）"]])
		if err != nil {
			return nil, err
		}
		switch row[columns["业务类型"]] {
		case "交易":
			entry.Kind = "payment"
			entry.Status = StatusPaid
		case "退款":
			if !hasRefundColumn {
				return nil, ErrBillFormat
			}
			entry.Kind = "refund"
			entry.Status = StatusUnknown
			entry.RefundNo = row[refundColumn]
			if entry.AmountCents < 0 {
				entry.AmountCents = -entry.AmountCents
			}
		default:
			return nil, ErrBillFormat
		}
		if entry.AmountCents <= 0 {
			return nil, ErrBillFormat
		}
		entry.FeeCents, err = billMoney(row[columns["服务费（元）"]])
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, nil
}
