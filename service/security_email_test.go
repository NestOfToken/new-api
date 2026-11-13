package service

import (
	"html"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSecurityEmailRendersLocalizedCodeAndConfiguredValidity(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousName, previousLogo, previousAddress := common.SystemName, common.Logo, system_setting.ServerAddress
	common.SystemName, common.Logo, system_setting.ServerAddress = "\u9e9f\u98de\u79d1\u6280", "/images/lftech/brand-mark.svg", "https://api.example.com"
	t.Cleanup(func() {
		common.SystemName, common.Logo, system_setting.ServerAddress = previousName, previousLogo, previousAddress
	})
	for _, test := range []struct {
		lang, title, validity string
		minutes               int
	}{
		{"zh-CN", "验证你的邮箱", "10 分钟内有效", 10},
		{"zh-TW", "驗證您的電子郵件", "8 分鐘內有效", 8},
		{"en", "Verify your email", "Valid for 3 minutes", 3},
		{"fr", "Verify your email", "Valid for 7 minutes", 7},
	} {
		t.Run(test.lang, func(t *testing.T) {
			content, err := RenderSecurityEmail(test.lang, SecurityEmail{
				Title:       i18n.Translate(test.lang, i18n.MsgEmailVerificationTitle),
				Intro:       i18n.Translate(test.lang, i18n.MsgEmailVerificationGreeting, map[string]any{"SystemName": common.ResolveSystemName(common.SystemName)}),
				Instruction: i18n.Translate(test.lang, i18n.MsgEmailVerificationInstruction),
				Code:        "028391",
				Validity:    i18n.Translate(test.lang, i18n.MsgEmailTemplateCodeValidity, map[string]any{"Minutes": test.minutes}),
			})
			require.NoError(t, err)
			assert.Contains(t, content, test.title)
			assert.Contains(t, content, test.validity)
			assert.Contains(t, content, "睿元云")
			assert.Contains(t, content, "nerioncloud")
			assert.Contains(t, content, "https://api.example.com/images/lftech/brand-mark.png")
			assert.Contains(t, content, "<strong>028391</strong>")
			assert.Equal(t, 1, strings.Count(content, "028391"), "the code appears once as readable body text")
			assert.NotContains(t, content, "email.template.")
			assert.NotContains(t, content, "email.verification.")
			for _, line := range strings.Split(content, "\n") {
				assert.LessOrEqual(t, len(line), 998, "default email lines must fit the SMTP message line limit")
			}
		})
	}
}

func TestSecurityEmailEscapesDynamicContentAndPreservesResetLink(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousName := common.SystemName
	common.SystemName = `Company <script>alert(1)</script>`
	t.Cleanup(func() { common.SystemName = previousName })
	link := "https://api.example.com/user/reset?email=user%2Btest%40example.com&token=original-reset-token"
	content, err := RenderSecurityEmail("en", SecurityEmail{
		Title: "Reset your password", Intro: `<img src=x onerror=alert(2)>`,
		ActionURL: link, ActionLabel: "Reset password", Validity: "Valid for 10 minutes",
	})
	require.NoError(t, err)
	assert.NotContains(t, content, "<script>")
	assert.NotContains(t, content, "<img src=x")
	assert.Contains(t, content, "&lt;script&gt;")
	assert.Contains(t, content, "&lt;img")
	assert.Contains(t, html.UnescapeString(content), link)
	assert.Equal(t, 2, strings.Count(html.UnescapeString(content), `href="`+link+`"`), "the action and fallback retain the exact same reset token")
	assert.Contains(t, content, "Do not share this password reset link")
	assert.NotContains(t, content, "Verification code")
	for _, invalid := range []string{"javascript:alert(1)", "//untrusted.example/reset", "https://user:password@example.com/reset", "not a URL"} {
		body, err := RenderSecurityEmail("en", SecurityEmail{ActionURL: invalid})
		require.Error(t, err)
		assert.Empty(t, body)
		assert.NotContains(t, err.Error(), invalid, "errors must not expose action tokens or credentials")
	}
}

func TestSecurityEmailRetainsCustomIdentityAndBindingWarnings(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousName, previousLogo, previousLanguage := common.SystemName, common.Logo, common.DefaultLanguage
	common.SystemName, common.Logo, common.DefaultLanguage = "Example Company", "https://assets.example.com/mail.png", "zh-TW"
	t.Cleanup(func() {
		common.SystemName, common.Logo, common.DefaultLanguage = previousName, previousLogo, previousLanguage
	})
	content, err := RenderSecurityEmail("", SecurityEmail{
		Title: i18n.Translate("", i18n.MsgEmailBindingOldTitle), Code: "845907",
		Warning: i18n.Translate("", i18n.MsgEmailBindingUnexpectedChange),
	})
	require.NoError(t, err)
	assert.Contains(t, content, `lang="zh-TW"`)
	assert.Contains(t, content, "Example Company")
	assert.Contains(t, content, "https://assets.example.com/mail.png")
	assert.NotContains(t, content, "nerioncloud")
	assert.Contains(t, content, "聯絡管理員")
}
