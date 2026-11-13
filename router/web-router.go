package router

import (
	"bytes"
	"embed"
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   fs.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	if assets.BuildFS == nil {
		assets.BuildFS = embed.FS{}
	}
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	compress := gzip.Gzip(gzip.DefaultCompression)
	if index, err := fs.ReadFile(assets.BuildFS, "web/dist/docs/index.html"); err == nil {
		// Register the directory explicitly: Gin's relay routes can redirect
		// /docs/ before NoRoute runs, conflicting with FileServer's redirect.
		docs := router.Group("/docs", middleware.RouteTag("web"))
		serveDocs := func(c *gin.Context) {
			c.Header("Cache-Control", "no-cache")
			http.ServeContent(c.Writer, c.Request, "index.html", time.Time{}, bytes.NewReader(index))
		}
		docs.GET("/", serveDocs)
		docs.HEAD("/", serveDocs)
	}

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			c.Header("Cache-Control", "no-cache")
			c.Data(http.StatusOK, "text/html; charset=utf-8", assets.IndexPage)
		},
	)
}
