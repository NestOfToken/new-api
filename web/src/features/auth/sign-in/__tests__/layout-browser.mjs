/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../../../../../..')
const dist = path.join(root, 'web/dist')
const review = path.join(root, '.impeccable/review/auth')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const fixtures = {
  system_name: '麟飞科技',
  register_enabled: true,
  password_login_enabled: true,
  user_agreement_enabled: true,
  privacy_policy_enabled: true,
}
let refreshWaiting = false
let releaseRefresh
let holdRefresh = true
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/api/user/auth/refresh') {
      refreshWaiting = true
      if (holdRefresh) {
        await new Promise((resolve) => {
          releaseRefresh = resolve
        })
      }
      res.statusCode = 401
      return res.end(
        JSON.stringify({
          success: false,
          code: 'AUTH_REFRESH_INVALID',
          message: 'Authentication required',
        })
      )
    }
    let data = {}
    if (url.pathname === '/api/setup') data = { status: true }
    if (url.pathname === '/api/status') data = fixtures
    if (url.pathname === '/api/home_page_content') data = ''
    if (url.pathname === '/api/notice') data = ''
    return res.end(JSON.stringify({ success: true, data }))
  }
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
  }
  let file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`)
  if (!file.startsWith(dist + path.sep)) file = path.join(dist, 'index.html')
  try {
    if (!(await fs.stat(file)).isFile()) file = path.join(dist, 'index.html')
  } catch {
    file = path.join(dist, 'index.html')
  }
  res.setHeader(
    'Content-Type',
    types[path.extname(file)] || 'application/octet-stream'
  )
  res.end(await fs.readFile(file))
})
let chrome, socket
await (async () => {
  await fs.mkdir(review, { recursive: true })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const profile = path.join(review, `chrome-${process.pid}`)
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const browserPath = candidates.find((candidate) => existsSync(candidate))
  assert(
    browserPath,
    'Install Chrome/Chromium or set CHROME_PATH to run browser layout regression tests'
  )
  chrome = spawn(
    browserPath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { windowsHide: true, stdio: 'ignore' }
  )
  let port
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(
        (
          await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
        ).split('\n')[0]
      )
      break
    } catch {
      await delay(100)
    }
  }
  assert(port, 'headless Chrome must start')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  socket = new WebSocket(
    targets.find((target) => target.type === 'page').webSocketDebuggerUrl
  )
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let sequence = 0
  const pending = new Map(),
    errors = []
  socket.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data)
    if (event.id) {
      const request = pending.get(event.id)
      if (request) {
        pending.delete(event.id)
        if (event.error) request.reject(event.error)
        else request.resolve(event.result)
      }
    }
    if (event.method === 'Runtime.exceptionThrown') {
      errors.push(
        event.params.exceptionDetails.exception?.description ||
          event.params.exceptionDetails.text
      )
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails))
    }
    return result.result.value
  }
  const until = async (expression, name) => {
    for (let i = 0; i < 250; i++) {
      try {
        if (await evaluate(expression)) return
      } catch {}
      await delay(40)
    }
    const diagnostic = JSON.stringify({
      errors,
      diagnostic: await evaluate(
        `JSON.stringify({path:location.pathname,anchors:[...document.querySelectorAll('[data-lf-ribbon-anchor]')].map(e=>e.outerHTML.slice(0,240)),canvas:document.querySelector('.lf-public-ribbon-canvas')?.outerHTML})`
      ),
    })
    process.stderr.write(`${diagnostic}\n`)
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    await fs.writeFile(
      path.join(review, 'failed.png'),
      Buffer.from(shot.data, 'base64')
    )
    throw new Error(`Timed out: ${name}`)
  }
  const settle = () =>
    evaluate(
      `Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().iterations)).map(a=>a.finished.catch(()=>{}))).then(()=>document.fonts.ready).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))).then(()=>true)`
    )
  const screenshot = async (name) => {
    await settle()
    const capture = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
    })
    await fs.writeFile(
      path.join(review, `${name}.png`),
      Buffer.from(capture.data, 'base64')
    )
  }
  const geometry = () =>
    evaluate(
      `(()=>{const art=document.querySelector('.lf-sign-in-art'),panel=document.querySelector('.lf-sign-in-panel');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,art:art?.getBoundingClientRect().toJSON(),panel:panel?.getBoundingClientRect().toJSON(),input:document.querySelector('input[name=username]')?.getBoundingClientRect().toJSON(),rootName:getComputedStyle(document.documentElement).viewTransitionName}})()`
    )
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('newapi:default:cache-version','default-v1');localStorage.setItem('i18nextLng','zhCN');window.__authTransitions=[];if(document.startViewTransition){const original=document.startViewTransition.bind(document);document.startViewTransition=(...args)=>{const t=original(...args);const item={ready:false,done:false,error:null};window.__authTransitions.push(item);t.ready.then(()=>item.ready=true,e=>item.error=String(e));t.finished.then(()=>item.done=true);return t}}`,
  })
  await send('Page.navigate', { url: `${origin}/` })
  await until(`!!document.querySelector('.lf-hero')`, 'homepage')
  const homepageOpacity = await evaluate(
    `getComputedStyle(document.querySelector('.lf-hero-art')).opacity`
  )
  await screenshot('homepage')
  await evaluate(`document.querySelector('a[href="/sign-in"]').click()`)
  for (let i = 0; i < 100 && !refreshWaiting; i++) await delay(30)
  assert(
    refreshWaiting,
    'real sign-in guard should request authentication resolution'
  )
  assert.equal(
    await evaluate(`!!document.querySelector('.lf-sign-in')`),
    false,
    'form must not mount before guard resolution'
  )
  holdRefresh = false
  releaseRefresh()
  await until(`!!document.querySelector('.lf-sign-in')`, 'sign-in after guard')
  await until(
    `document.querySelector('.lf-sign-in-art')?.dataset.ribbonReady==='true'`,
    'live ribbon'
  )
  await settle()
  let dimensions = await geometry()
  assert(
    dimensions.panel.left >= dimensions.art.right - 1,
    'desktop has side-by-side art and form'
  )
  assert(
    dimensions.input.height >= 48,
    'form controls preserve approved desktop size'
  )
  assert.equal(
    dimensions.rootName,
    'none',
    'credential form must not be captured in a root snapshot'
  )
  await evaluate(`document.querySelector('.lf-ribbon-playback').click()`)
  await screenshot('desktop')
  const transitions = await evaluate(`window.__authTransitions`)
  assert(transitions.length >= 1, 'shared element transition must run')
  assert.equal(transitions[0].error, null, 'shared names must not collide')
  const firstPixels = await evaluate(
    `document.querySelector('canvas.lf-public-ribbon-canvas').toDataURL()`
  )
  await delay(100)
  assert.equal(
    await evaluate(
      `document.querySelector('canvas.lf-public-ribbon-canvas').toDataURL()`
    ),
    firstPixels,
    'pause stops the rendered artwork'
  )

  await evaluate(`document.querySelector('.lf-sign-in-back').click()`)
  await until(`!!document.querySelector('.lf-hero')`, 'reverse transition')
  await settle()
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.lf-hero-art')).opacity`
    ),
    homepageOpacity,
    'homepage opacity remains unchanged'
  )
  await evaluate('window.scrollTo(0,600)')
  await until('window.scrollY===600', 'home scroll')
  await evaluate(`document.querySelector('a[href="/sign-in"]').click()`)
  await until(
    `!!document.querySelector('.lf-sign-in')`,
    'sign-in from middle of homepage'
  )
  await settle()
  await evaluate(`document.querySelector('.lf-sign-in-back').click()`)
  await until(
    `!!document.querySelector('.lf-hero')&&window.scrollY===600`,
    'homepage scroll restored'
  )
  await settle()
  await send('Page.navigate', { url: `${origin}/sign-in?redirect=%2Fpricing` })
  await until(`!!document.querySelector('.lf-sign-in')`, 'direct login')
  await until(
    `document.querySelector('.lf-sign-in-art')?.dataset.ribbonReady==='true'`,
    'direct login ribbon'
  )
  await settle()
  await evaluate(`document.querySelector('.lf-ribbon-playback').click()`)
  for (const width of [390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: true,
    })
    await settle()
    dimensions = await geometry()
    assert.equal(dimensions.overflow, false, `no overflow at ${width}`)
    assert(
      dimensions.panel.top >= dimensions.art.bottom - 1,
      'mobile stacks artwork above form'
    )
    await screenshot(width === 390 ? 'mobile' : 'mobile-320')
  }
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await evaluate(`document.documentElement.classList.add('dark')`)
  await screenshot('desktop-dark')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await screenshot('mobile-dark')
  await evaluate(`document.documentElement.classList.remove('dark')`)
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.lf-ribbon-playback')).display`
    ),
    'none',
    'reduced motion must not offer a misleading resume action'
  )
  await screenshot('mobile-reduced')
  Object.assign(fixtures, {
    passkey_login: true,
    github_oauth: true,
    discord_oauth: true,
    oidc_enabled: true,
    oidc_display_name: 'Enterprise single sign-on',
    linuxdo_oauth: true,
    telegram_oauth: true,
    custom_oauth_providers: [
      {
        slug: 'enterprise',
        name: 'Enterprise identity provider with a long display name',
        authorization_endpoint: 'https://example.invalid',
      },
    ],
  })
  await send('Page.reload')
  await until(
    `!!document.querySelector('.lf-sign-in')`,
    'alternative login layout'
  )
  await settle()
  assert.equal(
    (await geometry()).overflow,
    false,
    'alternative methods do not overflow mobile'
  )
  await screenshot('mobile-alternatives')
  assert.equal(errors.length, 0, errors.join('\n'))
  const result = {
    result: 'passed',
    homepageOpacity,
    transitions,
    checks: [
      'real route guard precedes form mount',
      'continuous ribbon and shared public elements',
      'unchanged homepage opacity',
      'reverse transition and scroll restoration',
      'direct link redirect retained',
      'desktop, mobile 390/320, dark, reduced motion, alternative methods',
      'pause stops frames',
      'no runtime exceptions',
    ],
    screenshots: review,
  }
  await fs.writeFile(
    path.join(review, 'results.json'),
    JSON.stringify(result, null, 2)
  )
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  await send('Browser.close')
})()
  .catch((error) => {
    process.stderr.write(`${String(error.stack || error)}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    releaseRefresh?.()
    socket?.close()
    chrome?.kill()
    server.closeAllConnections()
    server.close()
  })
