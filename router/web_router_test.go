package router

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestEmbeddedDocumentationDirectory(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetRelayRouter(engine)
	SetWebRouter(engine, WebAssets{
		BuildFS: fstest.MapFS{
			"web/dist/docs/index.html":   {Data: []byte("<html>API reference</html>")},
			"web/dist/docs/openapi.json": {Data: []byte(`{"openapi":"3.0.3"}`)},
		},
		IndexPage: []byte("dashboard"),
	}, func(c *gin.Context) { c.Next() })

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		t.Run(method, func(t *testing.T) {
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(method, "/docs/?source=home", nil))
			require.Equal(t, http.StatusOK, response.Code)
			assert.Empty(t, response.Header().Get("Location"))
			assert.Contains(t, response.Header().Get("Content-Type"), "text/html")
			assert.Equal(t, "no-cache", response.Header().Get("Cache-Control"))
			if method == http.MethodHead {
				assert.Empty(t, response.Body.String())
			} else {
				assert.Equal(t, "<html>API reference</html>", response.Body.String())
			}
		})
	}

	redirect := httptest.NewRecorder()
	engine.ServeHTTP(redirect, httptest.NewRequest(http.MethodGet, "/docs?source=home", nil))
	require.Equal(t, http.StatusMovedPermanently, redirect.Code)
	assert.Equal(t, "/docs/?source=home", redirect.Header().Get("Location"))

	spec := httptest.NewRecorder()
	engine.ServeHTTP(spec, httptest.NewRequest(http.MethodGet, "/docs/openapi.json", nil))
	require.Equal(t, http.StatusOK, spec.Code)
	assert.JSONEq(t, `{"openapi":"3.0.3"}`, spec.Body.String())
}
