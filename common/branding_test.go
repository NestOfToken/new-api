package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolveSystemName(t *testing.T) {
	for _, tc := range []struct {
		name string
		want string
	}{
		{"", "睿元云"},
		{"New API", "睿元云"},
		{" new-api ", "睿元云"},
		{"NewAPI", "睿元云"},
		{"\u9e9f\u98de\u79d1\u6280", "睿元云"},
		{"麟飛科技", "睿元雲"},
		{"Linfei Technology", "nerioncloud"},
		{"\u9e9f\u98de\u79d1\u6280 · 企业服务", "睿元云 · 企业服务"},
		{"睿元云 · 企业服务", "睿元云 · 企业服务"},
		{"Example Company", "Example Company"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ResolveSystemName(tc.name))
		})
	}
}
