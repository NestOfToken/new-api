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
		{"", "麟飞科技"},
		{"New API", "麟飞科技"},
		{" new-api ", "麟飞科技"},
		{"NewAPI", "麟飞科技"},
		{"麟飞科技 · 企业服务", "麟飞科技 · 企业服务"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, ResolveSystemName(tc.name))
		})
	}
}
