package nativepay

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/setting/native_payment_setting"
)

const (
	StatusPending            = "pending"
	StatusPaid               = "paid"
	StatusClosed             = "closed"
	StatusUnknown            = "unknown"
	StatusRefunded           = "refunded"
	RefundProcessing         = "processing"
	RefundManualReview       = "manual_review"
	RefundSuccess            = "success"
	RefundFailed             = "failed"
	MaxAmountCents     int64 = 100_000_000 // Conservative application ceiling: CNY 1 million.
)

var (
	ErrInvalidRequest      = errors.New("invalid native payment request")
	ErrInvalidNotification = errors.New("invalid native payment notification")
	ErrIdentityMismatch    = errors.New("native payment merchant identity mismatch")
	ErrProviderUnavailable = errors.New("native payment provider unavailable")
	ErrOrderNotFound       = errors.New("native payment order not found")
	ErrRefundNotFound      = errors.New("native payment refund not found")
	ErrRefundManualReview  = errors.New("native payment refund requires manual review")
	tradeNoPattern         = regexp.MustCompile(`^[A-Za-z0-9_-]{1,32}$`)
)

type CreateRequest struct {
	TradeNo, Description, NotifyURL, ReturnURL, ClientIP, Scene string
	AmountCents                                                 int64
	ExpiresAt                                                   time.Time
}

type Checkout struct {
	Kind string `json:"kind"`
	URL  string `json:"url"`
}

type Payment struct {
	TradeNo, TransactionID, MerchantID, AppID, Currency, Status string
	AmountCents                                                 int64
	PaidAt                                                      time.Time
}

type RefundRequest struct {
	TradeNo, RefundNo, Reason string
	TotalCents, AmountCents   int64
}

type RefundQuery struct{ TradeNo, RefundNo string }

type RefundResult struct {
	TradeNo, RefundNo, RefundID, Status string
	AmountCents                         int64
}

type Provider interface {
	Name() string
	ConfigID() string
	MerchantID() string
	AppID() string
	Create(context.Context, CreateRequest) (*Checkout, error)
	Query(context.Context, string) (*Payment, error)
	Close(context.Context, string) error
	Refund(context.Context, RefundRequest) (*RefundResult, error)
	QueryRefund(context.Context, RefundQuery) (*RefundResult, error)
	VerifyNotify(*http.Request) (*Payment, error)
}

// ProfileInfo contains no key material or filesystem paths.
type ProfileInfo struct {
	ID         string   `json:"id"`
	Provider   string   `json:"provider"`
	Enabled    bool     `json:"enabled"`
	AppID      string   `json:"app_id"`
	MerchantID string   `json:"merchant_id"`
	Scenes     []string `json:"scenes"`
	Sandbox    bool     `json:"sandbox"`
}

type Registry struct {
	providers map[string]Provider
	active    map[string]Provider
	profiles  []ProfileInfo
}

func NewRegistry(config *native_payment_setting.Config) (*Registry, error) {
	if config == nil {
		return nil, ErrInvalidRequest
	}
	if err := config.Validate(); err != nil {
		return nil, err
	}
	r := &Registry{providers: make(map[string]Provider), active: make(map[string]Provider)}
	for _, p := range config.Profiles {
		var provider Provider
		var err error
		if p.Provider == "wechat" {
			provider, err = newWechat(p)
		} else {
			provider, err = newAlipay(p)
		}
		if err != nil {
			return nil, fmt.Errorf("cannot initialize payment profile %s: %w", p.ID, err)
		}
		r.providers[p.ID] = provider
		if p.Enabled {
			r.active[p.Provider] = provider
		}
		r.profiles = append(r.profiles, ProfileInfo{ID: p.ID, Provider: p.Provider, Enabled: p.Enabled, AppID: p.AppID, MerchantID: p.MerchantID, Scenes: slices.Clone(p.Scenes), Sandbox: p.Sandbox})
	}
	return r, nil
}

func (r *Registry) Get(id string) (Provider, bool) {
	if r == nil {
		return nil, false
	}
	p, ok := r.providers[id]
	return p, ok
}
func (r *Registry) Active(name string) (Provider, bool) {
	if r == nil {
		return nil, false
	}
	p, ok := r.active[name]
	return p, ok
}
func (r *Registry) Profiles() []ProfileInfo {
	if r == nil {
		return nil
	}
	result := slices.Clone(r.profiles)
	for i := range result {
		result[i].Scenes = slices.Clone(result[i].Scenes)
	}
	return result
}

type providerIdentity struct {
	profile native_payment_setting.Profile
}

func (p *providerIdentity) Name() string       { return p.profile.Provider }
func (p *providerIdentity) ConfigID() string   { return p.profile.ID }
func (p *providerIdentity) MerchantID() string { return p.profile.MerchantID }
func (p *providerIdentity) AppID() string      { return p.profile.AppID }

func (p *providerIdentity) validateCreate(req CreateRequest) error {
	if !tradeNoPattern.MatchString(req.TradeNo) || req.AmountCents < 1 || req.AmountCents > MaxAmountCents || req.Description == "" || len(req.Description) > 127 || !slices.Contains(p.profile.Scenes, req.Scene) || !req.ExpiresAt.After(time.Now()) || req.NotifyURL == "" {
		return ErrInvalidRequest
	}
	for _, raw := range []string{req.NotifyURL, req.ReturnURL} {
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" {
			return ErrInvalidRequest
		}
	}
	return nil
}

func validateRefund(req RefundRequest) error {
	if !tradeNoPattern.MatchString(req.TradeNo) || !tradeNoPattern.MatchString(req.RefundNo) || req.AmountCents < 1 || req.TotalCents < req.AmountCents || req.TotalCents > MaxAmountCents || len(req.Reason) > 80 {
		return ErrInvalidRequest
	}
	return nil
}

func readKeyFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", errors.New("cannot read payment key file")
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > 64*1024 {
		return "", errors.New("invalid payment key file")
	}
	data, err := io.ReadAll(io.LimitReader(f, 64*1024+1))
	if err != nil || len(data) > 64*1024 {
		return "", errors.New("cannot read payment key file")
	}
	return strings.TrimSpace(string(data)), nil
}

// ParseCNY accepts only exact positive decimal currency, never floats or exponents.
func ParseCNY(value string) (int64, error) {
	whole, frac, hasDot := strings.Cut(value, ".")
	if whole == "" || len(whole) > 10 || (hasDot && (frac == "" || len(frac) > 2)) {
		return 0, ErrInvalidRequest
	}
	for _, c := range whole + frac {
		if c < '0' || c > '9' {
			return 0, ErrInvalidRequest
		}
	}
	major, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, ErrInvalidRequest
	}
	minor := int64(0)
	if frac != "" {
		if len(frac) == 1 {
			frac += "0"
		}
		minor, err = strconv.ParseInt(frac, 10, 64)
		if err != nil {
			return 0, ErrInvalidRequest
		}
	}
	cents := major*100 + minor
	if cents < 1 || cents > MaxAmountCents {
		return 0, ErrInvalidRequest
	}
	return cents, nil
}

func FormatCNY(cents int64) string { return fmt.Sprintf("%d.%02d", cents/100, cents%100) }
