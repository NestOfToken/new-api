package native_payment_setting

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// Config is read from a server-owned file, never from the public option store.
// Retain disabled profiles while their orders or refunds can still be processed.
type Config struct {
	Profiles []Profile `json:"profiles"`
}

type Profile struct {
	ID                  string   `json:"id"`
	Provider            string   `json:"provider"`
	Enabled             bool     `json:"enabled"`
	AppID               string   `json:"app_id"`
	MerchantID          string   `json:"merchant_id"`
	Scenes              []string `json:"scenes"`
	Sandbox             bool     `json:"sandbox"`
	PrivateKeyFile      string   `json:"private_key_file"`
	WechatSerialNo      string   `json:"wechat_serial_no"`
	WechatPublicKeyID   string   `json:"wechat_public_key_id"`
	WechatPublicKeyFile string   `json:"wechat_public_key_file"`
	WechatAPIv3KeyFile  string   `json:"wechat_api_v3_key_file"`
	AlipayPublicKeyFile string   `json:"alipay_public_key_file"`
	AlipayAppCertFile   string   `json:"alipay_app_cert_file"`
	AlipayRootCertFile  string   `json:"alipay_root_cert_file"`
	AlipayCertFile      string   `json:"alipay_cert_file"`
}

var profileIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

func Load() (*Config, error) {
	path := strings.TrimSpace(os.Getenv("NATIVE_PAYMENT_CONFIG_FILE"))
	if path == "" {
		return &Config{}, nil
	}
	return LoadFile(path)
}

func LoadFile(path string) (*Config, error) {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 1024*1024 {
		return nil, errors.New("cannot read native payment configuration")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, errors.New("cannot read native payment configuration")
	}
	var config Config
	if err := common.Unmarshal(data, &config); err != nil {
		return nil, errors.New("invalid native payment configuration JSON")
	}
	base, err := filepath.Abs(filepath.Dir(path))
	if err != nil {
		return nil, errors.New("invalid native payment configuration path")
	}
	for i := range config.Profiles {
		p := &config.Profiles[i]
		for _, field := range []*string{&p.PrivateKeyFile, &p.WechatPublicKeyFile, &p.WechatAPIv3KeyFile, &p.AlipayPublicKeyFile, &p.AlipayAppCertFile, &p.AlipayRootCertFile, &p.AlipayCertFile} {
			if *field != "" && !filepath.IsAbs(*field) {
				*field = filepath.Join(base, *field)
			}
		}
	}
	if err := config.Validate(); err != nil {
		return nil, err
	}
	return &config, nil
}

func (c *Config) Validate() error {
	ids := make(map[string]bool)
	active := make(map[string]bool)
	for i := range c.Profiles {
		p := &c.Profiles[i]
		if !profileIDPattern.MatchString(p.ID) || ids[p.ID] {
			return errors.New("invalid or duplicate native payment profile ID")
		}
		ids[p.ID] = true
		if p.Provider != "wechat" && p.Provider != "alipay" {
			return fmt.Errorf("unsupported provider in payment profile %s", p.ID)
		}
		if p.AppID == "" || p.MerchantID == "" || p.PrivateKeyFile == "" {
			return fmt.Errorf("incomplete payment profile %s", p.ID)
		}
		if p.Enabled && active[p.Provider] {
			return fmt.Errorf("multiple active %s payment profiles", p.Provider)
		}
		if p.Enabled {
			active[p.Provider] = true
		}
		if len(p.Scenes) == 0 {
			if p.Provider == "wechat" {
				p.Scenes = []string{"native"}
			} else {
				p.Scenes = []string{"page"}
			}
		}
		for _, scene := range p.Scenes {
			if (p.Provider == "wechat" && scene != "native" && scene != "h5") || (p.Provider == "alipay" && scene != "page" && scene != "wap") {
				return fmt.Errorf("unsupported scene in payment profile %s", p.ID)
			}
		}
		if p.Provider == "wechat" {
			if p.Sandbox || p.WechatSerialNo == "" || p.WechatPublicKeyID == "" || p.WechatPublicKeyFile == "" || p.WechatAPIv3KeyFile == "" {
				return fmt.Errorf("incomplete WeChat payment profile %s", p.ID)
			}
		} else {
			certMode := p.AlipayAppCertFile != "" || p.AlipayRootCertFile != "" || p.AlipayCertFile != ""
			if (certMode && (p.AlipayPublicKeyFile != "" || p.AlipayAppCertFile == "" || p.AlipayRootCertFile == "" || p.AlipayCertFile == "")) || (!certMode && p.AlipayPublicKeyFile == "") {
				return fmt.Errorf("invalid Alipay verification configuration in profile %s", p.ID)
			}
		}
	}
	return nil
}
