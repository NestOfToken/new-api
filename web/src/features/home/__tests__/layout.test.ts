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
afterEach(() => style.remove())

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
