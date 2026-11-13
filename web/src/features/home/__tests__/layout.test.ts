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
import { readFileSync } from 'node:fs'

import { afterEach, expect, it } from 'vitest'

const style = document.createElement('style')
afterEach(() => {
  style.remove()
  document.body.replaceChildren()
})

it('keeps the expanded background blend behind the catalog and transparent to input', () => {
  style.textContent = readFileSync('src/styles/ruiyuan-home-hero.css', 'utf8')
  document.head.appendChild(style)
  const horizon = document.createElement('div')
  horizon.className = 'lf-ruiyuan-horizon'
  const hero = document.createElement('section')
  hero.className = 'lf-ruiyuan-hero'
  hero.appendChild(horizon)
  const catalog = document.createElement('section')
  catalog.className = 'lf-capabilities'
  document.body.append(hero, catalog)

  const appearance = getComputedStyle(horizon)
  expect(appearance.position).toBe('absolute')
  expect(appearance.pointerEvents).toBe('none')
  expect(Number.parseFloat(appearance.bottom)).toBeLessThan(0)
  expect(appearance.backgroundImage).toBe('none')
  expect(appearance.boxShadow).toContain('px')
  expect(Number(getComputedStyle(catalog).zIndex)).toBeGreaterThan(
    Number(appearance.zIndex)
  )
})

it('adds reading clearance below the hero on short desktop screens while preserving the diffuse tail', () => {
  style.textContent = readFileSync('src/styles/ruiyuan-home-hero.css', 'utf8')
  document.head.appendChild(style)
  const home = document.createElement('main')
  home.className = 'lf-home'
  const hero = document.createElement('section')
  hero.className = 'lf-ruiyuan-hero'
  const horizon = document.createElement('div')
  horizon.className = 'lf-ruiyuan-horizon'
  hero.appendChild(horizon)
  home.appendChild(hero)
  document.body.appendChild(home)
  const padding = Number.parseFloat(getComputedStyle(hero).paddingBottom)
  const offset = Number.parseFloat(getComputedStyle(horizon).bottom)
  const compact = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText ===
        '(min-width: 1024px) and (max-height: 800px)'
  )
  expect(compact).toBeDefined()
  style.textContent += [...(compact?.cssRules ?? [])]
    .map((rule) => rule.cssText)
    .join('\n')

  const compactPadding = Number.parseFloat(getComputedStyle(hero).paddingBottom)
  const compactOffset = Number.parseFloat(getComputedStyle(horizon).bottom)
  expect(compactPadding).toBeGreaterThan(padding)
  expect(compactPadding + compactOffset).toBe(padding + offset)
})

it.each(['', 'dark'])(
  'keeps cosmic hero copy legible and provider marks dark without recoloring the catalog in %s theme',
  (theme) => {
    style.textContent =
      readFileSync('src/styles/ruiyuan-home-hero.css', 'utf8') +
      readFileSync('src/styles/lftech-home.css', 'utf8')
    document.head.appendChild(style)
    const surface = document.createElement('div')
    surface.className = theme
    const home = document.createElement('main')
    home.className = 'lf-home'
    home.style.setProperty('--lf-ink', '#15243b')
    const hero = document.createElement('section')
    hero.className = 'lf-ruiyuan-hero'
    const provider = document.createElement('span')
    provider.className = 'or-favicon'
    hero.appendChild(provider)
    const actions = document.createElement('div')
    actions.dataset.heroActions = ''
    const primary = document.createElement('a')
    primary.className = 'lf-primary'
    actions.appendChild(primary)
    hero.appendChild(actions)
    const catalog = document.createElement('section')
    home.append(hero, catalog)
    surface.appendChild(home)
    document.body.appendChild(surface)

    // The DOM environment exposes custom properties without resolving var().
    expect(getComputedStyle(hero).getPropertyValue('--lf-ink')).toBe('#f1f6ff')
    expect(getComputedStyle(provider).color).toBe('rgb(16, 44, 84)')
    expect(getComputedStyle(provider).backgroundColor).toBe(
      'rgb(247, 251, 255)'
    )
    const primaryChannels =
      getComputedStyle(primary).color.match(/\d+/g)?.map(Number) ?? []
    expect(primaryChannels).toHaveLength(3)
    expect(Math.max(...primaryChannels)).toBeLessThan(90)
    expect(getComputedStyle(home).getPropertyValue('--lf-ink')).toBe('#15243b')
    expect(getComputedStyle(catalog).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  }
)

it('keeps monochrome provider marks dark on their light discs in either theme', () => {
  style.textContent = readFileSync(
    'src/styles/lftech-home-platform.css',
    'utf8'
  )
  document.head.appendChild(style)
  const dark = document.createElement('div')
  dark.className = 'dark'
  const logo = document.createElement('span')
  logo.className = 'lf-field-logo'
  dark.appendChild(logo)
  document.body.appendChild(dark)
  expect(getComputedStyle(logo).color).toBe('rgb(16, 44, 84)')
  expect(getComputedStyle(logo).backgroundColor).toBe('rgb(247, 251, 255)')
})

it('keeps the transparent homepage navigation stable and removes the separate page gutter', () => {
  style.textContent = readFileSync('src/styles/lftech-home.css', 'utf8')
  document.head.appendChild(style)
  const header = document.createElement('header')
  header.className = 'lf-home-header'
  const surface = document.createElement('div')
  const navigation = document.createElement('nav')
  surface.appendChild(navigation)
  header.appendChild(surface)
  document.body.appendChild(header)
  const home = document.createElement('div')
  home.className = 'lf-home'
  const main = document.createElement('main')
  home.appendChild(main)
  document.body.appendChild(home)
  expect(getComputedStyle(main).paddingTop).toBe('0px')
  expect(getComputedStyle(surface).backgroundColor).toBe('rgba(0, 0, 0, 0)')
  expect(getComputedStyle(navigation).backdropFilter).toBe('none')
  expect(getComputedStyle(navigation).height).toBe('72px')
  surface.className = 'pt-3'
  expect(getComputedStyle(navigation).height).toBe('72px')
})

it('replaces the desktop sticky journey with an explicit mobile scene selector', () => {
  style.textContent =
    readFileSync('src/styles/lftech-home-platform.css', 'utf8') +
    readFileSync('src/styles/ruiyuan-home-atmosphere.css', 'utf8')
  document.head.appendChild(style)
  const mobile = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText === '(max-width: 900px)'
  )
  expect(mobile).toBeDefined()
  style.textContent += [...(mobile?.cssRules ?? [])]
    .map((rule) => rule.cssText)
    .join('\n')
  const visual = document.createElement('div')
  visual.className = 'lf-journey-visual'
  document.body.appendChild(visual)
  expect(getComputedStyle(visual).position).toBe('static')
  const story = document.createElement('div')
  story.className = 'lf-journey-stories'
  const inactive = document.createElement('article')
  const active = document.createElement('article')
  active.dataset.current = 'true'
  story.append(inactive, active)
  document.body.appendChild(story)
  expect(getComputedStyle(inactive).display).toBe('none')
  expect(getComputedStyle(active).display).toBe('flex')
})

it('makes model cards a readable single column on narrow screens', () => {
  style.textContent = readFileSync(
    'src/styles/lftech-home-capabilities.css',
    'utf8'
  )
  document.head.appendChild(style)
  const mobile = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText === '(max-width: 700px)'
  )
  expect(mobile).toBeDefined()
  style.textContent += [...(mobile?.cssRules ?? [])]
    .map((rule) => rule.cssText)
    .join('\n')
  const grid = document.createElement('ul')
  grid.className = 'lf-model-card-grid'
  document.body.appendChild(grid)
  expect(getComputedStyle(grid).gridTemplateColumns).toBe('minmax(0, 1fr)')
})

it('removes continuous demo movement for reduced motion', () => {
  style.textContent = readFileSync(
    'src/styles/lftech-home-platform.css',
    'utf8'
  )
  document.head.appendChild(style)
  const reduced = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText ===
        '(prefers-reduced-motion: reduce)'
  )
  expect(reduced).toBeDefined()
  style.textContent += [...(reduced?.cssRules ?? [])]
    .map((rule) => rule.cssText)
    .join('\n')
  const demo = document.createElement('div')
  demo.className = 'lf-demo-content'
  document.body.appendChild(demo)
  expect(getComputedStyle(demo).animation).toBe('none')
})
it('freezes the relay history in place instead of zeroing its duration for reduced motion', () => {
  style.textContent =
    readFileSync('src/styles/lftech-home.css', 'utf8') +
    readFileSync('src/styles/ruiyuan-stability.css', 'utf8')
  document.head.appendChild(style)
  const reduced = [...(style.sheet?.cssRules ?? [])].filter(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText ===
        '(prefers-reduced-motion: reduce)'
  )
  style.textContent += reduced
    .flatMap((rule) => [...rule.cssRules].map((child) => child.cssText))
    .join('\n')
  const home = document.createElement('div')
  home.className = 'lf-home'
  const demo = document.createElement('div')
  demo.className = 'lf-stability-demo'
  const history = document.createElement('div')
  history.className = 'lf-relay-scroll'
  const flow = document.createElement('div')
  flow.className = 'lf-relay-service-flow'
  demo.append(history, flow)
  home.append(demo)
  document.body.append(home)
  expect(getComputedStyle(history).animationPlayState).toBe('paused')
  expect(getComputedStyle(history).animationDuration).toBe('27s')
  expect(getComputedStyle(flow).animationPlayState).toBe('paused')
  expect(getComputedStyle(flow).animationDuration).toBe('1.4s')
})
it('keeps the mobile header action compact despite larger marketing actions', () => {
  style.textContent = readFileSync('src/styles/lftech-home.css', 'utf8')
  document.head.appendChild(style)
  const narrow = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText === '(max-width: 500px)'
  )
  style.textContent += [...(narrow?.cssRules ?? [])]
    .map((rule) => rule.cssText)
    .join('\n')
  const home = document.createElement('div')
  home.className = 'lf-home'
  const header = document.createElement('header')
  header.className = 'lf-home-header'
  const entry = document.createElement('button')
  entry.className = 'lf-primary lf-header-cta'
  header.appendChild(entry)
  home.appendChild(header)
  document.body.appendChild(home)
  expect(getComputedStyle(entry).minHeight).toBe('40px')
  expect(getComputedStyle(entry).paddingLeft).toBe('14px')
  expect(getComputedStyle(entry).fontSize).toBe('13px')
})
