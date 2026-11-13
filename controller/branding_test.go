package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOptionsResolveStoredBrandWithoutChangingStoredValuesOrPasskeyDomains(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{
		"SystemName":              "\u9e9f\u98de\u79d1\u6280",
		"passkey.rp_display_name": "Linfei Technology",
		"passkey.rp_id":           "api.example.com",
		"passkey.origins":         "https://api.example.com",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previous
		common.OptionMapRWMutex.Unlock()
	})

	response := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(response)
	context.Request = httptest.NewRequest(http.MethodGet, "/api/option/", nil)
	GetOptions(context)
	require.Equal(t, http.StatusOK, response.Code)
	var result struct {
		Success bool           `json:"success"`
		Data    []model.Option `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.True(t, result.Success)
	values := make(map[string]string)
	for _, option := range result.Data {
		values[option.Key] = option.Value
	}
	assert.Equal(t, "睿元云", values["SystemName"])
	assert.Equal(t, "nerioncloud", values["passkey.rp_display_name"])
	assert.Equal(t, "api.example.com", values["passkey.rp_id"])
	assert.Equal(t, "https://api.example.com", values["passkey.origins"])
	assert.Equal(t, "\u9e9f\u98de\u79d1\u6280", common.OptionMap["SystemName"])
	assert.Equal(t, "Linfei Technology", common.OptionMap["passkey.rp_display_name"])
}
