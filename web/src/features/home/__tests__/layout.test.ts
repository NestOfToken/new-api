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

it('keeps the homepage navigation height stable when its scrolled surface activates', () => {
  style.textContent = readFileSync('src/styles/lftech-home.css', 'utf8')
  document.head.appendChild(style)
  const header = document.createElement('header')
  header.className = 'lf-home-header'
  const surface = document.createElement('div')
  const navigation = document.createElement('nav')
  surface.appendChild(navigation)
  header.appendChild(surface)
  document.body.appendChild(header)

  expect(getComputedStyle(navigation).height).toBe('72px')
  surface.className = 'pt-3'
  expect(getComputedStyle(navigation).height).toBe('72px')
})

it('wraps complete model choices instead of clipping long translated labels', () => {
  style.textContent = readFileSync('src/styles/lftech-home.css', 'utf8')
  document.head.appendChild(style)
  const choices = document.createElement('div')
  choices.className = 'lf-model-tabs'
  const choice = document.createElement('button')
  choice.dataset.slot = 'tabs-trigger'
  choice.textContent = 'Understanding and analysis'
  choices.appendChild(choice)
  document.body.appendChild(choices)

  expect(getComputedStyle(choices).flexWrap).toBe('wrap')
  expect(getComputedStyle(choices).overflow).toBe('visible')
  expect(getComputedStyle(choice).maxWidth).toBe('100%')
  expect(getComputedStyle(choice).whiteSpace).toBe('normal')
})

it('keeps mobile hero artwork behind the copy instead of allocating a separate image row', () => {
  style.textContent = readFileSync('src/styles/lftech-home.css', 'utf8')
  document.head.appendChild(style)
  const mobile = [...(style.sheet?.cssRules ?? [])].find(
    (rule): rule is CSSMediaRule =>
      'media' in rule &&
      (rule as CSSMediaRule).media.mediaText === '(max-width: 800px)'
  )
  expect(mobile).toBeDefined()
  const artwork = [...(mobile?.cssRules ?? [])].find(
    (rule): rule is CSSStyleRule =>
      'selectorText' in rule && rule.selectorText === '.lf-hero-art'
  )
  expect(artwork?.style.getPropertyValue('position')).toBe('absolute')
  expect(artwork?.style.getPropertyValue('z-index')).toBe('-2')
  expect(
    Number.parseFloat(artwork?.style.getPropertyValue('margin-top') ?? '')
  ).toBe(0)
})
