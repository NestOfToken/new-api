if (window.Scalar?.createApiReference) {
  document.getElementById('app').replaceChildren()
  window.Scalar.createApiReference('#app', {
    url: './openapi.json?v=20261113-ruiyuan',
    layout: 'modern',
    theme: 'default',
    darkMode: false,
    showSidebar: true,
    hideClientButton: true,
    hideTestRequestButton: true,
    showDeveloperTools: 'never',
    agent: { disabled: true },
    persistAuth: false,
    withDefaultFonts: false,
    proxyUrl: '',
    metadata: {
      title: '睿元云 API 文档',
      description: '现有模型目录、接入示例与接口参考。',
    },
  })
} else {
  const fallback = document.createElement('p')
  fallback.className = 'docs-fallback'
  fallback.append('接口参考暂时无法加载。你可以先')
  const guide = document.createElement('a')
  guide.href = './guide.md?v=20261113-ruiyuan'
  guide.textContent = '阅读完整接入指南'
  const spec = document.createElement('a')
  spec.href = './openapi.json?v=20261113-ruiyuan'
  spec.textContent = '下载 OpenAPI 定义'
  fallback.append(guide, '，或', spec, '。刷新页面后可重试。')
  document.getElementById('app').replaceChildren(fallback)
}
