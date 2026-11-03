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
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { LandingOpticalRibbon } from '../components/landing-optical-ribbon'

let intersect: (visible: boolean) => void
let resize: () => void
let hidden: boolean
let reduced: boolean
let media: EventTarget
const disconnectIntersection = vi.fn()
const disconnectResize = vi.fn()

beforeEach(() => {
  hidden = false
  reduced = false
  media = new EventTarget()
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      Object.defineProperty(media, 'matches', {
        get: () => reduced,
        configurable: true,
      }) as MediaQueryList
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (visible) => callback([{ isIntersecting: visible }])
      }
      observe() {}
      disconnect = disconnectIntersection
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect = disconnectResize
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(['offscreen', 'background', 'reduced motion'])(
  'pauses the ribbon when %s',
  (condition) => {
    const { container } = render(
      <section>
        <h2 id='heading'>API</h2>
        <LandingOpticalRibbon headingId='heading' />
      </section>
    )
    const lane = container.querySelector('.lf-optical-lane')
    expect(lane).toHaveAttribute('data-playing', 'false')
    act(() => intersect(true))
    expect(lane).toHaveAttribute('data-playing', 'true')
    act(() => {
      if (condition === 'offscreen') intersect(false)
      if (condition === 'background') {
        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (condition === 'reduced motion') {
        reduced = true
        media.dispatchEvent(new Event('change'))
      }
    })
    expect(lane).toHaveAttribute('data-playing', 'false')
  }
)

it('follows the heading center after layout changes and disconnects on unmount', () => {
  const { container, unmount } = render(
    <section>
      <h2 id='heading'>API</h2>
      <LandingOpticalRibbon headingId='heading' />
    </section>
  )
  const section = container.querySelector('section')
  const heading = container.querySelector('h2')
  if (!section || !heading) throw new Error('Missing ribbon heading fixture')
  vi.spyOn(section, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 200, 1000, 500)
  )
  vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 260, 400, 80)
  )
  act(() => resize())
  expect(
    container
      .querySelector<HTMLElement>('.lf-optical-lane')
      ?.style.getPropertyValue('--lane-top')
  ).toBe('100px')
  const remove = vi.spyOn(document, 'removeEventListener')
  unmount()
  expect(disconnectIntersection).toHaveBeenCalled()
  expect(disconnectResize).toHaveBeenCalled()
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})
