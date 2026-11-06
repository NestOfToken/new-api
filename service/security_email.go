package service

import (
	"bytes"
	_ "embed"
	"errors"
	"html/template"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

//go:embed templates/security_email.html
var securityEmailHTML string

var securityEmailTemplate = template.Must(template.New("security-email").Parse(securityEmailHTML))

// SecurityEmail contains plain text and, for password recovery, the existing
// action URL. html/template escapes every value; callers must not pre-escape it.
type SecurityEmail struct {
	Title       string
	Intro       string
	Instruction string
	Code        string
	ActionURL   string
	ActionLabel string
	Validity    string
	Warning     string
}

// RenderSecurityEmail applies the shared brand presentation without issuing,
// consuming or logging credentials, codes, reset tokens or sessions.
func RenderSecurityEmail(lang string, message SecurityEmail) (string, error) {
	if message.ActionURL != "" {
		action, err := url.Parse(message.ActionURL)
		if err != nil || action.Host == "" || action.User != nil || (action.Scheme != "http" && action.Scheme != "https") {
			return "", errors.New("invalid security email action URL")
		}
	}
	if lang == "" {
		lang = common.DefaultLanguage
	}
	lang = i18n.ParseAcceptLanguage(lang)
	if lang == "" {
		lang = i18n.DefaultLang
	}
	brand := common.ResolveSystemName(common.SystemName)
	caption := ""
	if brand == common.DefaultSystemName || brand == "睿元雲" || brand == "nerioncloud" {
		caption = "nerioncloud"
	}
	logo := strings.TrimSpace(common.Logo)
	if logo == "" || logo == "/logo.png" || logo == "/images/lftech/brand-mark.svg" {
		logo = "/images/lftech/brand-mark.png"
	}
	logoURL := ""
	base, baseErr := url.Parse(system_setting.ServerAddress)
	image, imageErr := url.Parse(logo)
	if baseErr == nil && imageErr == nil && base.IsAbs() {
		logoURL = base.ResolveReference(image).String()
	}
	if message.Warning == "" {
		message.Warning = i18n.Translate(lang, i18n.MsgEmailTemplateIgnoreRequest)
	}
	data := struct {
		SecurityEmail
		Language, Brand, Caption, LogoURL, CodeLabel, SecretWarning, Footer, LinkFallback string
	}{
		SecurityEmail: message,
		Language:      lang, Brand: brand, Caption: caption, LogoURL: logoURL,
		CodeLabel:     i18n.Translate(lang, i18n.MsgEmailTemplateCodeLabel),
		SecretWarning: i18n.Translate(lang, i18n.MsgEmailTemplateKeepSecret),
		Footer:        i18n.Translate(lang, i18n.MsgEmailTemplateAutomated),
		LinkFallback:  i18n.Translate(lang, i18n.MsgEmailTemplateLinkFallback),
	}
	if message.ActionURL != "" {
		data.SecretWarning = i18n.Translate(lang, i18n.MsgEmailTemplateKeepLinkSecret)
	}
	var result bytes.Buffer
	if err := securityEmailTemplate.Execute(&result, data); err != nil {
		return "", err
	}
	return result.String(), nil
}
