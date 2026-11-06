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
let holdHomeRefresh = false
let homeRefreshWaiting = false
let releaseHomeRefresh
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
    if (url.pathname === '/api/home_page_content') {
      if (holdHomeRefresh) {
        homeRefreshWaiting = true
        await new Promise((resolve) => {
          releaseHomeRefresh = resolve
        })
      }
      data = ''
    }
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
  const profile = await fs.mkdtemp(path.join(review, 'chrome-'))
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
    await evaluate(`window.scrollTo({top:0,behavior:'instant'})`)
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__ribbonSample=null;
      window.__ribbonBoundaryDifference=null;
      const clear=CanvasRenderingContext2D.prototype.clearRect;
      let draws=0;
      CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.classList.contains('lf-public-ribbon-canvas'))draws++;return clear.apply(this,args)};
      const raf=requestAnimationFrame;
      window.__startReturnProbe=()=>{
        window.__returnFrames=[];window.__watchReturn=true;
        function record(){
          if(!window.__watchReturn)return;
          const surface=document.querySelector('[data-lf-public-surface]'),lane=document.querySelector('.lf-capabilities .lf-optical-lane'),canvas=document.querySelector('.lf-public-ribbon-canvas'),copy=document.querySelector('.lf-hero-copy');
          const art=document.querySelector('[data-lf-public-surface=home] .lf-hero-art'),hero=document.querySelector('[data-lf-public-surface=home] .lf-hero');
          window.__returnFrames.push({blank:!surface,double:!!lane&&!canvas.hidden&&getComputedStyle(lane).visibility==='visible',intro:copy?getComputedStyle(copy).animationName:null,scene:!!document.querySelector('.lf-public-outgoing')?.firstElementChild,layoutMoving:!!document.querySelector('.lf-public-outgoing')?.getAnimations().some(a=>a.playState==='running'&&a.effect.getKeyframes().some(k=>k.clipPath)),artWidth:art?.getBoundingClientRect().width,heroWidth:hero?.getBoundingClientRect().width,clientWidth:document.documentElement.clientWidth,clip:surface?getComputedStyle(surface).clipPath:null});
          raf.call(window,record);
        }
        raf.call(window,record);
      };
      window.requestAnimationFrame=callback=>raf.call(window,time=>{
        const before=draws,start=performance.now(),probe=window.__ribbonBoundaryProbe;
        const stamp=probe&&probe.start!==null?probe.start+.00001:time;
        callback(stamp);
        if(draws>before&&probe&&document.querySelector('.lf-sign-in')){
          const canvas=document.querySelector('.lf-public-ribbon-canvas');
          const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
          if(probe.start===null){probe.start=stamp;probe.pixels=pixels;let top=canvas.height,bottom=0;for(let i=3;i<pixels.length;i+=4){if(pixels[i]>1){const y=Math.floor((i-3)/4/canvas.width);top=Math.min(top,y);bottom=Math.max(bottom,y)}}window.__ribbonOriginRange={top:top*innerHeight/canvas.height,bottom:bottom*innerHeight/canvas.height}}
          else{let difference=0,total=0;for(let i=3;i<pixels.length;i+=4){difference+=Math.abs(pixels[i]-probe.pixels[i]);total+=probe.pixels[i]}window.__ribbonBoundaryDifference=difference/Math.max(1,total);window.__ribbonBoundaryProbe=null}
        }
        if(draws>before&&window.__ribbonSample)window.__ribbonSample.push({at:time,cost:performance.now()-start});
      });`,
  })
  const sampleRibbon = () =>
    evaluate(
      `new Promise(resolve=>{window.__ribbonSample=[];const ticks=[];const end=performance.now()+1200;function tick(time){ticks.push(time);if(time<end){requestAnimationFrame(tick);return}const frames=window.__ribbonSample;window.__ribbonSample=null;const costs=frames.map(f=>f.cost).sort((a,b)=>a-b);resolve({frames:frames.length,refreshes:ticks.length,fps:frames.length*1000/(ticks.at(-1)-ticks[0]),p95DrawMs:costs[Math.floor(costs.length*.95)]??null})}requestAnimationFrame(tick)})`
    )
  await send('Page.navigate', { url: `${origin}/` })
  await until(`!!document.querySelector('.lf-hero')`, 'homepage')
  await settle()
  const cssTimeBefore = await evaluate(
    `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
  )
  const homePerformance = await sampleRibbon()
  assert(
    (await evaluate(
      `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
    )) > cssTimeBefore,
    'the original heading ribbon continues flowing on home'
  )
  const homeRibbonVisible = await evaluate(
    `(()=>{const lane=document.querySelector('.lf-capabilities .lf-optical-lane');return getComputedStyle(lane).visibility==='visible'})()`
  )
  assert.equal(
    await evaluate(`document.querySelector('.lf-public-ribbon-canvas').hidden`),
    true,
    'homepage has no added ribbon in front of the hero background'
  )
  assert.equal(
    await evaluate(
      `document.querySelector('[data-lf-ribbon-anchor]')?.closest('section')?.id`
    ),
    'models',
    'the existing models heading ribbon supplies the transition origin'
  )
  const homepageOpacity = await evaluate(
    `getComputedStyle(document.querySelector('.lf-hero-art')).opacity`
  )
  const ribbonAppearance = await evaluate(
    `(()=>{const hero=getComputedStyle(document.querySelector('.lf-public-ribbon-canvas')),reference=getComputedStyle(document.querySelector('.lf-capabilities .lf-optical-light'));return {duration:hero.getPropertyValue('--flow-duration').trim(),referenceDuration:reference.getPropertyValue('--flow-duration').trim(),colors:['a','b','c','d','e'].map(key=>hero.getPropertyValue('--ribbon-color-'+key).trim()),referenceColors:['a','b','c','d','e'].map(key=>reference.getPropertyValue('--ribbon-color-'+key).trim())}})()`
  )
  assert.equal(
    ribbonAppearance.duration,
    ribbonAppearance.referenceDuration,
    'hero and reference ribbons share the same flow period'
  )
  assert(
    ribbonAppearance.colors.every(Boolean),
    'hero ribbon uses the shared translucent material'
  )
  assert.deepEqual(
    ribbonAppearance.colors,
    ribbonAppearance.referenceColors,
    'hero and lower ribbon use the same colors'
  )
  await screenshot('homepage')
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll('header a[href="/sign-in"], header a[href="/sign-up"]')].filter(link=>link.getClientRects().length>0).length`
    ),
    1,
    'the homepage has one visible unified authentication entry'
  )
  const sourceBounds = await evaluate(
    `document.querySelector('.lf-capabilities [data-lf-ribbon-anchor]').getBoundingClientRect().toJSON()`
  )
  await evaluate(
    `window.__originalHome=document.querySelector('[data-lf-public-surface=home]');true`
  )
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
  await evaluate(`window.__ribbonBoundaryProbe={start:null,pixels:null}`)
  releaseRefresh()
  await until(`!!document.querySelector('.lf-sign-in')`, 'sign-in after guard')
  await until(
    `document.querySelector('.lf-sign-in-art')?.dataset.ribbonReady==='true'`,
    'live ribbon'
  )
  assert(
    await evaluate(
      `document.querySelector('.lf-public-outgoing')?.firstElementChild===window.__originalHome`
    ),
    'the outgoing homepage remains visible while the login layout unfolds'
  )
  assert(
    await evaluate(
      `document.querySelector('[data-lf-public-surface=sign-in]').getAnimations().some(a=>a.effect.getKeyframes().some(k=>k.clipPath))`
    ),
    'the whole login surface transitions rather than switching instantly'
  )
  await until(`window.__ribbonBoundaryDifference!==null`, 'first fold frames')
  const enteringCapture = await send('Page.captureScreenshot', {
    format: 'png',
  })
  await fs.writeFile(
    path.join(review, 'enter-page-mid.png'),
    Buffer.from(enteringCapture.data, 'base64')
  )
  const transitionPerformance = await sampleRibbon()
  const originRange = await evaluate(`window.__ribbonOriginRange`)
  assert(
    originRange.top >= sourceBounds.top - 1 &&
      originRange.bottom <= sourceBounds.bottom + 1,
    'the first transition frame comes from the original heading ribbon position'
  )
  const materialBoundaryDifference = await evaluate(
    `window.__ribbonBoundaryDifference`
  )
  assert(
    materialBoundaryDifference !== null && materialBoundaryDifference < 0.08,
    'the material does not pop when the wave starts folding'
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
  const loginPerformance = await sampleRibbon()
  process.stdout.write(
    `${JSON.stringify({ homeRibbonVisible, homePerformance, loginPerformance })}\n`
  )
  assert(
    homeRibbonVisible,
    'homepage ribbon is visible before the first login click'
  )
  assert.equal(
    homePerformance.frames,
    0,
    'homepage uses its existing CSS ribbon without extra canvas drawing'
  )
  assert(
    loginPerformance.frames >= loginPerformance.refreshes * 0.8,
    'ribbon draws on browser refreshes without a 30fps cap'
  )
  assert(
    transitionPerformance.frames >= transitionPerformance.refreshes * 0.8,
    'the home-to-login morph also draws on browser refreshes'
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
  await evaluate(
    `window.__sharedAuthArt=document.querySelector('.lf-sign-in-art');document.querySelectorAll('.lf-auth-tabs [role=tab]')[1].click()`
  )
  await until(
    `!!document.querySelector('input[name=confirmPassword]')`,
    'registration panel'
  )
  assert.equal(
    await evaluate(`location.pathname`),
    '/sign-in',
    'registration uses the same route'
  )
  assert(
    await evaluate(
      `document.querySelector('.lf-sign-in-art')===window.__sharedAuthArt`
    ),
    'switching modes retains the running artwork'
  )
  assert.equal(
    await evaluate(
      `document.querySelector('input[name=password]').autocomplete`
    ),
    'new-password'
  )
  await screenshot('desktop-register')
  await evaluate(
    `document.querySelectorAll('.lf-auth-tabs [role=tab]')[0].click()`
  )
  await until(
    `!!document.querySelector('input[name=username]')&&!document.querySelector('input[name=confirmPassword]')`,
    'return to login panel'
  )

  holdHomeRefresh = true
  await evaluate(
    `window.__originalSignIn=document.querySelector('[data-lf-public-surface=sign-in]');document.querySelector('input[name=username]').value='local-preview-user';document.querySelector('input[name=password]').value='local-preview-password';true`
  )
  await evaluate(`window.__startReturnProbe()`)
  // Observe the synchronous cleanup as well as painted frames: the outgoing
  // page can otherwise hide a one-frame fallback flash before the RAF probe.
  await evaluate(`(()=>{
    const art=document.querySelector('.lf-sign-in-art');
    const fallback=art.querySelector('.lf-sign-in-fallback');
    window.__fallbackCleanup=[];
    Object.defineProperty(art,'dataset',{value:new Proxy(art.dataset,{
      get:(target,key)=>Reflect.get(target,key,target),
      set:(target,key,value)=>Reflect.set(target,key,value,target),
      deleteProperty(target,key){
        const result=Reflect.deleteProperty(target,key);
        if(key==='ribbonReady') window.__fallbackCleanup.push({
          connected:art.isConnected,
          visibility:getComputedStyle(fallback).visibility
        });
        return result;
      }
    })});
  })()`)
  await evaluate(`document.querySelector('.lf-sign-in-back').click()`)
  for (let i = 0; i < 100 && !homeRefreshWaiting; i++) await delay(20)
  assert(
    homeRefreshWaiting,
    'returning home starts a background content refresh'
  )
  assert(
    await evaluate(`!!document.querySelector('.lf-hero')`),
    'returning home keeps the cached page visible while its refresh is pending'
  )
  assert(
    await evaluate(
      `document.querySelector('.lf-public-outgoing').firstElementChild===window.__originalSignIn`
    ),
    'the actual exiting login layout remains during the reverse reveal'
  )
  assert(
    await evaluate(`document.querySelector('.lf-public-outgoing').inert`),
    'the exiting form is inert'
  )
  assert.deepEqual(
    await evaluate(
      `window.__fallbackCleanup.filter(sample=>sample.connected && sample.visibility==='visible')`
    ),
    [],
    'returning home never reveals the fallback image during live login cleanup'
  )
  assert(
    await evaluate(
      `[...document.querySelectorAll('.lf-public-outgoing input:not([type=checkbox]):not([type=radio])')].every(input=>input.value==='')`
    ),
    'the exiting form retains no entered values'
  )
  const returningCapture = await send('Page.captureScreenshot', {
    format: 'png',
  })
  await fs.writeFile(
    path.join(review, 'return-page-mid.png'),
    Buffer.from(returningCapture.data, 'base64')
  )
  holdHomeRefresh = false
  releaseHomeRefresh()
  await until(`!!document.querySelector('.lf-hero')`, 'reverse transition')
  await settle()
  await until(
    `document.querySelector('.lf-public-ribbon-canvas').hidden && getComputedStyle(document.querySelector('.lf-capabilities .lf-optical-lane')).visibility==='visible'`,
    'reverse animation rejoins the existing CSS ribbon'
  )
  assert.equal(
    await evaluate(
      `document.querySelector('.lf-public-outgoing').childElementCount`
    ),
    0,
    'the exiting page is discarded when the transition completes'
  )
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('[data-lf-public-surface=home]')).clipPath`
    ),
    'none',
    'the restored homepage has no leftover clipping'
  )
  const returnFrames = await evaluate(
    `(()=>{window.__watchReturn=false;return window.__returnFrames})()`
  )
  const backgroundGeometry = returnFrames.filter(
    (frame) => frame.artWidth !== undefined
  )
  await fs.writeFile(
    path.join(review, 'return-background-geometry.json'),
    JSON.stringify(backgroundGeometry, null, 2)
  )
  const finalBackground = await evaluate(
    `(()=>{const art=document.querySelector('.lf-hero-art'),hero=document.querySelector('.lf-hero');return {artWidth:art.getBoundingClientRect().width,heroWidth:hero.getBoundingClientRect().width,clientWidth:document.documentElement.clientWidth}})()`
  )
  process.stdout.write(
    `${JSON.stringify({ finalBackground, widths: [...new Set(backgroundGeometry.map((frame) => frame.artWidth))], heroWidths: [...new Set(backgroundGeometry.map((frame) => frame.heroWidth))], clientWidths: [...new Set(backgroundGeometry.map((frame) => frame.clientWidth))] })}\n`
  )
  assert(
    backgroundGeometry.every(
      (frame) => Math.abs(frame.artWidth - finalBackground.artWidth) < 1
    ),
    'homepage background keeps its final width throughout the reverse transition'
  )
  assert(
    backgroundGeometry.every((frame) => frame.clip === 'none'),
    'the returning homepage background is painted at full width without a temporary clipping context'
  )
  assert(
    returnFrames.filter((frame) => frame.scene && frame.layoutMoving).length >=
      3,
    'the reverse transition contains intermediate whole-page layouts'
  )
  assert(
    returnFrames.every((frame) => !frame.blank),
    'return frames do not pass through a loading or blank surface'
  )
  assert(
    returnFrames.every((frame) => !frame.double),
    'CSS and canvas ribbons do not overlap during return'
  )
  assert(
    returnFrames
      .filter((frame) => frame.intro !== null)
      .every((frame) => frame.intro === 'none'),
    'returning home does not restart its separate entrance animation'
  )
  assert(
    (await evaluate(
      `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
    )) > 1000,
    'returning home preserves the ribbon phase instead of restarting its clock'
  )
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('.lf-hero-art')).opacity`
    ),
    homepageOpacity,
    'homepage opacity remains unchanged'
  )
  const resumedClock = await evaluate(
    `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
  )
  await until(
    `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)>${resumedClock + 120}`,
    'the original CSS ribbon resumes after the handoff'
  )
  const beforeScrollClock = await evaluate(
    `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
  )
  await evaluate('window.scrollTo(0,600)')
  await until('window.scrollY===600', 'home scroll')
  assert(
    (await evaluate(
      `Number(document.querySelector('.lf-capabilities .lf-optical-track').getAnimations()[0].currentTime)`
    )) >= beforeScrollClock,
    'scrolling after handoff does not rewind the original ribbon'
  )
  await evaluate(`document.querySelector('a[href="/sign-in"]').click()`)
  await until(
    `!!document.querySelector('.lf-sign-in')`,
    'sign-in from middle of homepage'
  )
  await settle()
  await evaluate('history.back()')
  await until(
    `!!document.querySelector('.lf-hero')&&window.scrollY===600`,
    'homepage scroll restored'
  )
  await settle()
  await evaluate(`document.querySelector('a[href="/sign-in"]').click()`)
  await until(
    `!!document.querySelector('[data-lf-public-surface=sign-in][data-lf-surface-entering=true]')`,
    'interruptible login entrance'
  )
  await evaluate('history.back()')
  await until(
    `!!document.querySelector('[data-lf-public-surface=home]')`,
    'return during entrance'
  )
  await settle()
  assert.equal(
    await evaluate(
      `document.querySelector('.lf-public-outgoing').childElementCount`
    ),
    0,
    'interrupting the transition leaves no retained page'
  )
  assert.equal(
    await evaluate(
      `getComputedStyle(document.querySelector('[data-lf-public-surface=home]')).clipPath`
    ),
    'none',
    'interrupting the transition leaves the current page fully visible'
  )
  await send('Page.navigate', {
    url: `${origin}/sign-up?redirect=%2Fpricing&aff=browser-invite`,
  })
  await until(
    `location.pathname==='/sign-in'&&new URLSearchParams(location.search).get('mode')==='register'&&!!document.querySelector('input[name=confirmPassword]')`,
    'legacy registration link opens the combined panel'
  )
  assert.equal(
    await evaluate(`new URLSearchParams(location.search).get('redirect')`),
    '/pricing'
  )
  assert.equal(await evaluate(`localStorage.getItem('aff')`), 'browser-invite')
  await evaluate(
    `document.querySelectorAll('.lf-auth-tabs [role=tab]')[0].click()`
  )
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
    const artBottom = await evaluate(
      `(()=>{const canvas=document.querySelector('.lf-public-ribbon-canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let bottom=0;for(let index=3;index<pixels.length;index+=4){if(pixels[index]>1)bottom=Math.floor((index-3)/4/canvas.width)}return bottom*innerHeight/canvas.height})()`
    )
    assert(
      artBottom <= dimensions.art.bottom + 1,
      'resized ribbon stays above the mobile login form'
    )
    await screenshot(width === 390 ? 'mobile' : 'mobile-320')
    await evaluate(
      `document.querySelectorAll('.lf-auth-tabs [role=tab]')[1].click()`
    )
    await until(
      `!!document.querySelector('input[name=confirmPassword]')`,
      'mobile registration'
    )
    await settle()
    const registrationGeometry = await geometry()
    assert.equal(
      registrationGeometry.overflow,
      false,
      `registration has no overflow at ${width}`
    )
    assert(
      registrationGeometry.panel.top >= registrationGeometry.art.bottom - 1,
      'mobile registration stays below the artwork'
    )
    await screenshot(width === 390 ? 'mobile-register' : 'mobile-register-320')
    await evaluate(
      `document.querySelectorAll('.lf-auth-tabs [role=tab]')[0].click()`
    )
    await until(
      `!document.querySelector('input[name=confirmPassword]')`,
      'mobile login'
    )
  }
  await send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await evaluate(`document.querySelector('.lf-ribbon-playback').click()`)
  const throttledMobilePerformance = await sampleRibbon()
  await evaluate(`document.querySelector('.lf-ribbon-playback').click()`)
  await send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await evaluate(`document.querySelector('.lf-sign-in-back').click()`)
  await until(
    `!!document.querySelector('[data-lf-public-surface=home]')`,
    'mobile background return'
  )
  const mobileBackgroundDuring = await evaluate(
    `(()=>{const home=document.querySelector('[data-lf-public-surface=home]');return {width:home.querySelector('.lf-hero-art').getBoundingClientRect().width,clip:getComputedStyle(home).clipPath}})()`
  )
  assert.equal(
    mobileBackgroundDuring.clip,
    'none',
    'mobile homepage background also avoids a temporary clipping context'
  )
  await settle()
  assert.equal(
    await evaluate(
      `[...document.querySelectorAll('header a[href="/sign-in"], header a[href="/sign-up"]')].filter(link=>link.getClientRects().length>0).length`
    ),
    1,
    'the mobile homepage keeps one visible authentication entry'
  )
  await screenshot('mobile-home')
  assert(
    Math.abs(
      (await evaluate(
        `document.querySelector('[data-lf-public-surface=home] .lf-hero-art').getBoundingClientRect().width`
      )) - mobileBackgroundDuring.width
    ) < 1,
    'mobile background keeps the same width after the reveal finishes'
  )
  await send('Page.navigate', { url: `${origin}/sign-in?redirect=%2Fpricing` })
  await until(
    `document.querySelector('.lf-sign-in-art')?.dataset.ribbonReady==='true'`,
    'login after mobile return'
  )
  await settle()
  await evaluate(`document.querySelector('.lf-ribbon-playback').click()`)
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
  await evaluate(`document.querySelector('.lf-sign-in-back').click()`)
  await until(
    `!!document.querySelector('[data-lf-public-surface=home]')`,
    'reduced-motion return'
  )
  assert.equal(
    await evaluate(
      `document.querySelector('.lf-public-outgoing').childElementCount`
    ),
    0,
    'reduced motion retains no exiting layout'
  )
  await send('Page.navigate', { url: `${origin}/sign-in?redirect=%2Fpricing` })
  await until(
    `!!document.querySelector('[data-lf-public-surface=sign-in]')`,
    'reduced-motion direct login'
  )
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('i18nextLng','fr')`,
  })
  await send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: true,
  })
  await send('Page.navigate', { url: origin })
  await until(
    `!!document.querySelector('.lf-home-header')&&[...document.querySelectorAll('header a[href="/sign-in"]')].some(link=>link.textContent.includes('Connexion'))`,
    'translated mobile homepage'
  )
  await settle()
  assert(
    await evaluate(`(()=>{
    const entry=[...document.querySelectorAll('header a[href="/sign-in"]')].find(link=>link.getClientRects().length);
    const controls=entry.parentElement.getBoundingClientRect();
    const brand=document.querySelector('.lf-home-header .public-brand-link').getBoundingClientRect();
    const button=entry.getBoundingClientRect();
    return controls.right<=innerWidth && button.left>=brand.right;
  })()`),
    'the translated mobile authentication entry fits without covering the brand or pushing navigation offscreen'
  )
  await screenshot('mobile-home-fr')
  assert.equal(errors.length, 0, errors.join('\n'))
  const result = {
    result: 'passed',
    homepageOpacity,
    ribbonAppearance,
    materialBoundaryDifference,
    backgroundWidths: {
      during: [...new Set(backgroundGeometry.map((frame) => frame.artWidth))],
      after: finalBackground.artWidth,
      mobile: mobileBackgroundDuring.width,
    },
    sourceBounds,
    originRange,
    returnFrameChecks: {
      pageLayoutFrames: returnFrames.filter(
        (frame) => frame.scene && frame.layoutMoving
      ).length,
      frames: returnFrames.length,
      loading: returnFrames.filter((frame) => frame.blank).length,
      doubledRibbon: returnFrames.filter((frame) => frame.double).length,
      repeatedIntro: returnFrames.filter(
        (frame) => frame.intro !== null && frame.intro !== 'none'
      ).length,
    },
    homePerformance,
    loginPerformance,
    transitionPerformance,
    throttledMobilePerformance,
    transitions,
    checks: [
      'one visible homepage authentication entry on desktop and mobile',
      'login and registration share the same artwork and route',
      'legacy registration preserves redirect and affiliate code',
      'registration fits desktop and 390/320 mobile widths',
      'translated mobile authentication entry stays within the header',
      'real route guard precedes form mount',
      'continuous ribbon and shared public elements',
      'existing models heading ribbon supplies the transition origin',
      'no added hero ribbon or steady homepage canvas drawing',
      'returning home rejoins the CSS ribbon without restarting its clock',
      'steady and morph drawing follow browser refreshes',
      'unchanged homepage opacity',
      'reverse transition and scroll restoration',
      'bidirectional whole-page reveal retains and clears the actual exiting DOM',
      'desktop and mobile homepage backgrounds keep their final width without incoming clipping',
      'browser back during entrance cancels and cleans the old transition',
      'exiting form is inert, sanitized, and never cloned or snapshotted',
      'direct link redirect retained',
      'desktop, mobile 390/320, dark, reduced motion, alternative methods',
      'resized artwork remains inside the mobile art region',
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
})()
  .catch((error) => {
    process.stderr.write(`${error.stack || JSON.stringify(error)}\n`)
    process.exitCode = 1
  })
  .finally(() => {
    releaseRefresh?.()
    releaseHomeRefresh?.()
    socket?.close()
    chrome?.kill()
    server.closeAllConnections()
    server.close()
  })
