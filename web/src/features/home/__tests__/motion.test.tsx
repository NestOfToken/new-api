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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { PublicGalaxyTransfer } from '@/features/auth/lib/public-galaxy-transfer'

import { LandingModelField } from '../components/landing-model-field'
import { LandingStabilityTimeline } from '../components/landing-stability-timeline'
import { LandingUpstreamContinuity } from '../components/landing-upstream-continuity'
import { LandingUsageActivity } from '../components/landing-usage-activity'
import { ModelGalaxy } from '../components/model-galaxy'
import { useLandingAtmosphere } from '../hooks/use-landing-atmosphere'
import { projectModelOrbit } from '../lib/model-orbit'
import {
  createGalaxyField,
  galaxyViewport,
  GALAXY_DARK,
  type GalaxyCatalog,
} from '../lib/reference-galaxy/layout'
import {
  GalaxyPainter,
  type GalaxyPaintFrame,
} from '../lib/reference-galaxy/painter'
import type { ReferenceGalaxyScene } from '../lib/reference-galaxy/scene'

let intersect: (visible: boolean) => void
let reduced: boolean
let hidden: boolean
let media: EventTarget
const disconnect = vi.fn()
const cancelFrame = vi.fn()
const drawFrame = vi.fn()

beforeEach(() => {
  reduced = false
  hidden = false
  media = new EventTarget()
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      Object.defineProperty(media, 'matches', {
        get: () => reduced,
        configurable: true,
      }) as MediaQueryList
  )
  vi.stubGlobal('CanvasRenderingContext2D', class {})
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    new Proxy(
      {
        clearRect: drawFrame,
        beginPath() {},
        ellipse() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        arc() {},
        fill() {},
        setTransform() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        createLinearGradient: () => ({ addColorStop() {} }),
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        measureText: () => ({ width: 10 }),
      },
      {
        get(target, key) {
          return Reflect.get(target, key) ?? (() => {})
        },
      }
    ) as unknown as CanvasRenderingContext2D
  )
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1)
  )
  vi.stubGlobal('cancelAnimationFrame', cancelFrame)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = (visible) => callback([{ isIntersecting: visible }])
      }
      observe() {}
      disconnect = disconnect
    }
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect = disconnect
    }
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

it('updates catalog nodes without replacing the running galaxy or its canvas', () => {
  const scene: { current: ReferenceGalaxyScene | null } = { current: null }
  const catalog: GalaxyCatalog = {
    labs: [
      { key: 'lab', author: 'lab', name: 'Provider', image: '' },
      { key: 'removed', author: 'removed', name: 'Removed', image: '' },
    ],
    models: [
      {
        slug: 'first',
        name: 'First',
        description: '',
        lab: 'lab',
        variant: null,
        created: 0,
        weeklyTokens: 0,
        outputModalities: [],
      },
      {
        slug: 'removed',
        name: 'Removed',
        description: '',
        lab: 'removed',
        variant: null,
        created: 0,
        weeklyTokens: 0,
        outputModalities: [],
      },
    ],
    isUsageAvailable: false,
    layout: 'catalog',
  }
  const view = render(
    <ModelGalaxy catalog={catalog} paused={false} scene={scene} />
  )
  const running = scene.current
  if (!running) throw new Error('Missing running galaxy')
  const canvas = document.querySelector('.or-galaxy-back')
  const dispose = vi.spyOn(running, 'dispose')
  running.focusLab(1)
  running.inspectLab(1)
  view.rerender(
    <ModelGalaxy
      catalog={{
        ...catalog,
        labs: [catalog.labs[0]],
        models: [
          catalog.models[0],
          { ...catalog.models[0], slug: 'second', name: 'Second' },
        ],
      }}
      paused={false}
      scene={scene}
    />
  )
  expect(scene.current).toBe(running)
  expect(document.querySelector('.or-galaxy-back')).toBe(canvas)
  expect(running.field.points).toHaveLength(2)
  const wrap = document.querySelector('.or-galaxy')
  if (!wrap) throw new Error('Missing galaxy')
  expect(wrap).toHaveAttribute('data-focused', '')
  fireEvent.keyDown(wrap, { key: 'ArrowRight' })
  expect(wrap).toHaveAttribute('data-focused', '')
  running.focusLab(0)
  fireEvent.keyDown(wrap, { key: 'ArrowRight' })
  expect(wrap).toHaveAttribute('data-focused', 'lab')
  expect(dispose).not.toHaveBeenCalled()
})

it('continues painting when a provider disappears during a model pulse', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.99)
  const catalog: GalaxyCatalog = {
    labs: [
      { key: 'first', author: 'first', name: 'First', image: '' },
      { key: 'last', author: 'last', name: 'Last', image: '' },
    ],
    models: ['first', 'last'].map((lab) => ({
      slug: lab,
      name: lab,
      description: '',
      lab,
      variant: null,
      created: 0,
      weeklyTokens: 0,
      outputModalities: [],
    })),
    isUsageAvailable: false,
    layout: 'catalog',
  }
  const painter = new GalaxyPainter(
    document.createElement('canvas'),
    document.createElement('canvas'),
    createGalaxyField(catalog, 0),
    [],
    null,
    document.createElement('div'),
    document.createElement('span')
  )
  const frame: GalaxyPaintFrame = {
    width: 1000,
    height: 700,
    ratio: 1,
    dt: 0.1,
    time: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    turn: 0,
    speed: 1,
    pointTime: 1,
    pointer: null,
    parallaxX: 0,
    parallaxY: 0,
    tiltX: 0,
    tiltY: 0,
    faceX: 0,
    faceY: 0,
    spinX: 0,
    spinY: 0,
    active: null,
    inspectedLab: null,
    nearest: null,
    reduced: false,
    paused: true,
    dragging: false,
    palette: GALAXY_DARK,
    popoverPoint: null,
  }
  painter.paint(frame, null)
  painter.paint({ ...frame, time: 1.1, paused: false }, null)
  painter.setField(
    createGalaxyField(
      { ...catalog, labs: [catalog.labs[0]], models: [catalog.models[0]] },
      0
    ),
    []
  )
  drawFrame.mockClear()
  expect(() =>
    painter.paint({ ...frame, time: 1.2, paused: false }, null)
  ).not.toThrow()
  expect(drawFrame).toHaveBeenCalled()
})

it('keeps simulation and camera travel on one running clock across route slots', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver
        )
      }
      unobserve() {}
      disconnect() {}
    }
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700)
  const scene: { current: ReferenceGalaxyScene | null } = { current: null }
  render(
    <ModelGalaxy
      catalog={{
        labs: [{ key: 'lab', author: 'lab', name: 'Provider', image: '' }],
        models: [
          {
            slug: 'model',
            name: 'Model',
            lab: 'lab',
            variant: null,
            created: 0,
            weeklyTokens: 0,
            outputModalities: ['text'],
          },
        ],
        isUsageAvailable: false,
        layout: 'catalog',
      }}
      paused={false}
      scene={scene}
    />
  )
  const running = scene.current
  if (!running) throw new Error('Missing scene')
  const home = document.createElement('div')
  const auth = document.createElement('div')
  document.body.append(home, auth)
  vi.spyOn(home, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 700)
  )
  vi.spyOn(auth, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 580, 700)
  )
  const transfer = new PublicGalaxyTransfer()
  const renderFrame = vi.spyOn(GalaxyPainter.prototype, 'paint')
  try {
    transfer.setScene(running)
    const release = transfer.attach({ element: home, mode: 'home' })
    const frame = vi.mocked(requestAnimationFrame).mock.lastCall?.[0]
    if (!frame) throw new Error('Missing scene frame')
    frame(116)
    const before = renderFrame.mock.lastCall?.[0]
    if (!before) throw new Error('Missing before frame')
    const theta = running.field.clusters[0].theta
    release()
    renderFrame.mockClear()
    frame(132) // The outgoing slot is gone; the destination has not mounted yet.
    expect(renderFrame).toHaveBeenCalledTimes(1)
    expect(renderFrame.mock.lastCall?.[0].time).toBeGreaterThan(before.time)
    vi.mocked(requestAnimationFrame).mockClear()
    transfer.attach({ element: auth, mode: 'sign-in' })
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    renderFrame.mockClear()
    frame(148)
    const traveling = renderFrame.mock.lastCall?.[0]
    if (!traveling) throw new Error('Missing traveling frame')
    expect(renderFrame).toHaveBeenCalledTimes(1)
    expect(traveling.time).toBeGreaterThan(before.time)
    expect(traveling.pointTime).toBeGreaterThan(before.pointTime)
    expect(running.field.clusters[0].theta).toBeGreaterThan(theta)
    expect(traveling.geometry?.x).toBeLessThan(galaxyViewport(1000, 700).x)

    running.setPaused(true)
    frame(164)
    const paused = renderFrame.mock.lastCall?.[0]
    if (!paused?.geometry) throw new Error('Missing paused frame geometry')
    frame(180)
    expect(renderFrame.mock.lastCall?.[0].time).toBe(paused.time)
    expect(renderFrame.mock.lastCall?.[0].pointTime).toBe(paused.pointTime)
    expect(renderFrame.mock.lastCall?.[0].geometry?.x).toBeLessThan(
      paused.geometry.x
    )
    running.setPaused(false)
    reduced = true
    media.dispatchEvent(new Event('change'))
    frame(196)
    expect(renderFrame.mock.lastCall?.[0].time).toBe(paused.time)
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    renderFrame.mockClear()
    frame(212)
    expect(renderFrame).not.toHaveBeenCalled()
    hidden = false
    reduced = false
    document.dispatchEvent(new Event('visibilitychange'))
    frame(228)
    expect(renderFrame.mock.lastCall?.[0].time).toBeGreaterThan(paused.time)
    renderFrame.mockClear()
    vi.mocked(requestAnimationFrame).mockClear()
    frame(720)
    expect(renderFrame).toHaveBeenCalledTimes(1)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    const landed = renderFrame.mock.lastCall?.[0]
    if (!landed) throw new Error('Missing landed frame')
    frame(736)
    expect(renderFrame.mock.lastCall?.[0].time).toBeGreaterThan(landed.time)
    expect(auth.contains(transfer.host)).toBe(true)
  } finally {
    transfer.stop()
    home.remove()
    auth.remove()
  }
})

it('keeps the first transfer frame at its origin when the frame timestamp predates navigation', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const home = document.createElement('div')
  const auth = document.createElement('div')
  document.body.append(home, auth)
  vi.spyOn(home, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1200, 700)
  )
  vi.spyOn(auth, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 700, 700)
  )
  const transfer = new PublicGalaxyTransfer()
  let draw: ((now: number) => void) | undefined
  transfer.setScene({
    setPresentation: (_active: boolean, frame?: (now: number) => void) => {
      draw = frame
    },
    setViewport() {},
    setVisibilityTarget() {},
    setInteractive() {},
    setCopy() {},
  } as unknown as ReferenceGalaxyScene)
  try {
    const release = transfer.attach({ element: home, mode: 'home' })
    release()
    transfer.attach({ element: auth, mode: 'sign-in' })
    if (!draw) throw new Error('Missing transfer frame')
    const origin = Number.parseFloat(
      transfer.host.style.getPropertyValue('--lf-core-x')
    )
    draw(80)
    expect(
      Number.parseFloat(transfer.host.style.getPropertyValue('--lf-core-x'))
    ).toBe(origin)
    draw(200)
    const moving = Number.parseFloat(
      transfer.host.style.getPropertyValue('--lf-core-x')
    )
    expect(moving).toBeLessThan(origin)
    expect(moving).toBeGreaterThanOrEqual(galaxyViewport(700, 700).x)
  } finally {
    transfer.stop()
    home.remove()
    auth.remove()
  }
})

function AtmosphereFixture() {
  const surface = useRef<HTMLDivElement>(null)
  useLandingAtmosphere(surface)
  return (
    <div ref={surface}>
      <section className='lf-capabilities' aria-label='Models' />
      <section className='lf-integration' aria-label='Integration' />
    </div>
  )
}

it.each(['offscreen', 'background', 'reduced motion'])(
  'pauses ambient orbital drift for %s and resumes only visible sections',
  (condition) => {
    let onIntersection: IntersectionObserverCallback
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          onIntersection = callback
        }
        observe() {}
        disconnect = disconnect
      }
    )
    const view = render(<AtmosphereFixture />)
    const models = screen.getByRole('region', { name: 'Models' })
    const integration = screen.getByRole('region', { name: 'Integration' })
    const report = (visible: boolean) =>
      act(() =>
        onIntersection(
          [
            {
              target: models,
              isIntersecting: visible,
              intersectionRatio: visible ? 1 : 0,
              boundingClientRect: models.getBoundingClientRect(),
              intersectionRect: models.getBoundingClientRect(),
              rootBounds: null,
              time: 0,
            },
          ],
          {} as IntersectionObserver
        )
      )
    expect(models).toHaveAttribute('data-atmosphere-playing', 'false')
    report(true)
    expect(models).toHaveAttribute('data-atmosphere-playing', 'true')
    expect(integration).toHaveAttribute('data-atmosphere-playing', 'false')
    if (condition === 'offscreen') {
      report(false)
    } else {
      act(() => {
        hidden = condition === 'background'
        reduced = condition === 'reduced motion'
        document.dispatchEvent(new Event('visibilitychange'))
        media.dispatchEvent(new Event('change'))
      })
    }
    expect(models).toHaveAttribute('data-atmosphere-playing', 'false')
    hidden = false
    reduced = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      media.dispatchEvent(new Event('change'))
    })
    report(true)
    expect(models).toHaveAttribute('data-atmosphere-playing', 'true')
    expect(integration).toHaveAttribute('data-atmosphere-playing', 'false')
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(models).not.toHaveAttribute('data-atmosphere-playing')
  }
)

it('keeps ambient backgrounds static when visibility observation is unavailable', () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  render(<AtmosphereFixture />)
  expect(screen.getByRole('region', { name: 'Models' })).not.toHaveAttribute(
    'data-atmosphere-playing'
  )
})

it('keeps traffic flowing through repeated failover and recovery cycles without controls', () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        intersect = (visible) =>
          this.callback(
            [
              {
                target,
                isIntersecting: visible,
                intersectionRatio: visible ? 0.5 : 0,
              } as IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver
          )
      }
      disconnect() {}
    }
  )
  const { container } = render(
    <LandingUpstreamContinuity
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  const figure = container.querySelector('.lf-failover')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByText('Illustrative allocation')).not.toBeInTheDocument()
  expect(container.querySelector('.lf-route-share')).toBeNull()
  act(() => vi.advanceTimersByTime(9000))
  expect(figure).toHaveAttribute('data-phase', 'idle')
  act(() => intersect(true))
  expect(figure).toHaveAttribute('data-phase', 'normal')
  expect(figure).toHaveAttribute('data-playing', 'true')
  expect(screen.getByText('Tencent Cloud')).toBeVisible()
  expect(screen.getByText('Alibaba Cloud')).toBeVisible()
  expect(screen.getByText('DeepSeek')).toBeVisible()
  expect(screen.getByText('Other')).toBeVisible()
  act(() => vi.advanceTimersByTime(3600))
  expect(container.querySelector('[data-upstream="tencent"]')).toHaveAttribute(
    'data-failed',
    'true'
  )
  expect(figure).toHaveAttribute('data-phase', 'failure')
  expect(container.querySelector('.lf-route-dot')).not.toBeNull()
  act(() => vi.advanceTimersByTime(900))
  expect(container.querySelector('[data-upstream="alibaba"]')).toHaveAttribute(
    'data-active',
    'true'
  )
  expect(figure).toHaveAttribute('data-phase', 'switching')
  act(() => vi.advanceTimersByTime(1600))
  expect(figure).toHaveAttribute('data-phase', 'restored')
  expect(container.querySelector('[data-upstream="tencent"]')).toHaveAttribute(
    'data-failed',
    'true'
  )
  expect(container.querySelector('[data-upstream="alibaba"]')).toHaveAttribute(
    'data-active',
    'true'
  )
  expect(container.querySelector('.lf-route-dot')).not.toBeNull()
  act(() => vi.advanceTimersByTime(4200))
  expect(figure).toHaveAttribute('data-phase', 'recovering')
  expect(container.querySelector('[data-upstream="tencent"]')).toHaveAttribute(
    'data-failed',
    'false'
  )
  act(() => vi.advanceTimersByTime(1500))
  expect(figure).toHaveAttribute('data-phase', 'normal')
  act(() => vi.advanceTimersByTime(3600))
  expect(figure).toHaveAttribute('data-phase', 'failure')
  expect(figure).toHaveAttribute('data-playing', 'true')
  expect(vi.getTimerCount()).toBe(1)
})

it('cancels the failover demonstration offscreen, in the background and on unmount', () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        intersect = (visible) =>
          this.callback(
            [
              {
                target,
                isIntersecting: visible,
                intersectionRatio: visible ? 0.5 : 0,
              } as IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver
          )
      }
      disconnect() {}
    }
  )
  const { container, unmount } = render(
    <LandingUpstreamContinuity
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  act(() => intersect(true))
  act(() => intersect(false))
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-playing',
    'false'
  )
  expect(container.querySelector('.lf-route-dot')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
  act(() => vi.advanceTimersByTime(5000))
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-phase',
    'idle'
  )
  act(() => intersect(true))
  act(() => {
    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(vi.getTimerCount()).toBe(0)
  act(() => {
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-phase',
    'normal'
  )
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('shows a static completed route for reduced motion without scheduling the sequence', () => {
  vi.useFakeTimers()
  reduced = true
  const { container } = render(
    <LandingUpstreamContinuity
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-phase',
    'restored'
  )
  expect(container.querySelector('[data-upstream="alibaba"]')).toHaveAttribute(
    'data-active',
    'true'
  )
  expect(container.querySelector('.lf-route-dot')).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it('runs and cleans up the routing loop when visibility observation is unavailable', () => {
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', undefined)
  const { container, unmount } = render(
    <LandingUpstreamContinuity
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-playing',
    'true'
  )
  act(() => vi.advanceTimersByTime(11800))
  expect(container.querySelector('.lf-failover')).toHaveAttribute(
    'data-phase',
    'normal'
  )
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('automatically increases and decreases usage to match business demand without controls', () => {
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', undefined)
  const { container, unmount } = render(<LandingUsageActivity />)
  expect(screen.getByText('Business demand')).toBeVisible()
  expect(screen.getByText('Actual usage')).toBeVisible()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  for (const units of [3, 7, 11, 5, 3]) {
    for (const track of ['demand', 'usage']) {
      expect(
        container.querySelectorAll(
          `[data-usage-track="${track}"] [data-active="true"]`
        )
      ).toHaveLength(units)
    }
    act(() => vi.advanceTimersByTime(4500))
  }
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('preserves the usage demonstration when offscreen, backgrounded or reduced motion is requested', () => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        intersect = (visible) =>
          this.callback(
            [
              {
                target,
                isIntersecting: visible,
                intersectionRatio: visible ? 1 : 0,
              } as IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver
          )
      }
      disconnect() {}
    }
  )
  const { container, unmount } = render(<LandingUsageActivity />)
  const root = container.firstElementChild
  act(() => intersect(true))
  act(() => vi.advanceTimersByTime(3000))
  for (const condition of ['offscreen', 'background', 'reduced']) {
    const frame = container.querySelector('.lf-usage-comparison')?.innerHTML
    act(() => {
      if (condition === 'offscreen') intersect(false)
      if (condition === 'background') {
        hidden = true
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (condition === 'reduced') {
        reduced = true
        media.dispatchEvent(new Event('change'))
      }
    })
    expect(root).toHaveAttribute('data-playing', 'false')
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(6000))
    expect(container.querySelector('.lf-usage-comparison')?.innerHTML).toEqual(
      frame
    )
    act(() => {
      hidden = false
      reduced = false
      intersect(true)
      document.dispatchEvent(new Event('visibilitychange'))
      media.dispatchEvent(new Event('change'))
    })
    expect(root).toHaveAttribute('data-playing', 'true')
    expect(vi.getTimerCount()).toBe(1)
  }
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps the usage demonstration meaningful and static with reduced motion initially enabled', () => {
  vi.useFakeTimers()
  reduced = true
  const { container } = render(<LandingUsageActivity />)
  expect(container.firstElementChild).toHaveAttribute('data-playing', 'false')
  expect(
    screen.getByRole('img', {
      name: 'Illustrative comparison: platform usage increases and decreases with business demand. Not actual usage data.',
    })
  ).toBeVisible()
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps healthy upstreams available in parallel while individual outages recur and platform flow continues', () => {
  vi.useFakeTimers()
  vi.stubGlobal('IntersectionObserver', undefined)
  const { container, unmount } = render(
    <LandingStabilityTimeline
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  const service = container.querySelector('.lf-stability-service')
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(container.querySelector('[data-provider="tencent"]')).toHaveAttribute(
    'data-active',
    'true'
  )
  expect(
    container.querySelectorAll('[data-provider][data-active="true"]')
  ).toHaveLength(2)
  expect(service?.querySelector('.lf-relay-service-flow')).not.toBeNull()
  expect(
    [...container.querySelectorAll('.lf-relay-chart path')].some((path) =>
      /[CQST]/.test(path.getAttribute('d') || '')
    )
  ).toBe(false)
  expect(service?.querySelector('.lf-relay-service-line')).not.toBeNull()
  expect(container.querySelector('.lf-stability-track')).toBeNull()
  expect(
    container.querySelector('[data-interruption="tencent"]')
  ).not.toBeNull()
  expect(
    container.querySelector('[data-interruption="alibaba"]')
  ).not.toBeNull()
  expect(
    container.querySelector('[data-interruption="deepseek"]')
  ).not.toBeNull()
  for (const [elapsed, interrupted] of [
    [750, null],
    [7500, 'tencent'],
    [8250, 'alibaba'],
    [8250, 'deepseek'],
    [3000, null],
  ] as const) {
    act(() => vi.advanceTimersByTime(elapsed))
    expect(
      container.querySelectorAll('[data-provider][data-active="true"]')
    ).toHaveLength(interrupted ? 2 : 3)
    if (interrupted) {
      expect(
        container.querySelector(`[data-provider="${interrupted}"]`)
      ).toHaveAttribute('data-interrupted', 'true')
      expect(
        container.querySelector(`[data-provider="${interrupted}"]`)
      ).toHaveAttribute('data-active', 'false')
    }
    expect(service?.querySelector('[data-interruption]')).toBeNull()
    expect(service?.querySelector('.lf-relay-service-line')).not.toBeNull()
    expect(vi.getTimerCount()).toBe(1)
  }
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['offscreen', 'background', 'reduced motion'])(
  'suspends the availability timeline when %s and resumes without losing its place',
  (condition) => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private callback: IntersectionObserverCallback) {}
        observe(target: Element) {
          intersect = (visible) =>
            this.callback(
              [
                {
                  target,
                  isIntersecting: visible,
                  intersectionRatio: visible ? 1 : 0,
                } as IntersectionObserverEntry,
              ],
              this as unknown as IntersectionObserver
            )
        }
        disconnect() {}
      }
    )
    const { container, unmount } = render(
      <LandingStabilityTimeline
        name='Ruiyuan'
        logo='/images/ruiyuan/key-mark.svg'
      />
    )
    const timeline = container.querySelector('.lf-stability-demo')
    act(() => intersect(true))
    act(() => vi.advanceTimersByTime(750))
    const readHistory = () =>
      Array.from(container.querySelectorAll('[data-provider]'), (row) => [
        row.getAttribute('data-active'),
        row.getAttribute('data-interrupted'),
      ])
    const states = readHistory()
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
    expect(timeline).toHaveAttribute('data-playing', 'false')
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(4000))
    expect(readHistory()).toEqual(states)
    act(() => {
      if (condition === 'offscreen') intersect(true)
      if (condition === 'background') {
        hidden = false
        document.dispatchEvent(new Event('visibilitychange'))
      }
      if (condition === 'reduced motion') {
        reduced = false
        media.dispatchEvent(new Event('change'))
      }
    })
    expect(timeline).toHaveAttribute('data-playing', 'true')
    expect(readHistory()).toEqual(states)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  }
)

it('keeps a meaningful static availability history when reduced motion is enabled initially', () => {
  vi.useFakeTimers()
  reduced = true
  const { container } = render(
    <LandingStabilityTimeline
      name='Ruiyuan'
      logo='/images/ruiyuan/key-mark.svg'
    />
  )
  expect(container.querySelector('.lf-stability-demo')).toHaveAttribute(
    'data-playing',
    'false'
  )
  expect(container.querySelector('[data-interruption]')).not.toBeNull()
  expect(
    container.querySelector('.lf-stability-service [data-interruption]')
  ).toBeNull()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['offscreen', 'background', 'reduced motion'])(
  'stops the model-field animation when %s',
  (condition) => {
    const { container } = render(
      <LandingModelField
        providers={[]}
        locale='en'
        paused={false}
        selected={null}
        onSelect={() => {}}
      />
    )
    const field = container.querySelector('.lf-model-field')
    act(() => intersect(true))
    expect(field).toHaveAttribute('data-playing', 'true')
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
    expect(field).toHaveAttribute('data-playing', 'false')
    expect(cancelFrame).toHaveBeenCalled()
  }
)

it('honors explicit pause and disconnects animation observers on unmount', () => {
  const props = {
    providers: [],
    locale: 'en',
    selected: null,
    onSelect: () => {},
  }
  const { container, rerender, unmount } = render(
    <LandingModelField {...props} paused={false} />
  )
  act(() => intersect(true))
  expect(container.querySelector('.lf-model-field')).toHaveAttribute(
    'data-playing',
    'true'
  )
  rerender(<LandingModelField {...props} paused />)
  expect(disconnect).not.toHaveBeenCalled()
  act(() => intersect(true))
  expect(container.querySelector('.lf-model-field')).toHaveAttribute(
    'data-playing',
    'false'
  )
  unmount()
  expect(disconnect).toHaveBeenCalled()
})

it('projects the front and back of an orbit with depth while sharing a stable center', () => {
  const camera = { x: 0, y: 0 }
  const front = projectModelOrbit(1200, 570, 300, Math.PI / 2, camera)
  const back = projectModelOrbit(1200, 570, 300, -Math.PI / 2, camera)
  const center = projectModelOrbit(1200, 570, 0, 0, camera)
  expect(front.scale).toBeGreaterThan(1)
  expect(back.scale).toBeLessThan(1)
  expect(front.y).toBeGreaterThan(center.y)
  expect(back.y).toBeLessThan(center.y)
  expect(projectModelOrbit(390, 320, 0, 0, camera).x).toBe(195)
  expect(projectModelOrbit(390, 320, 230, 1, camera).scale).toBeLessThan(2)
})

it('keeps provider positions continuous through a long explicit pause and resume', () => {
  let clock = 100
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(570)
  const props = {
    providers: [{ id: 'other', name: 'Other', models: [] }],
    locale: 'en',
    selected: null,
    onSelect: () => {},
  }
  const { container, rerender } = render(
    <LandingModelField {...props} paused={false} />
  )
  act(() => intersect(true))
  const control = container.querySelector<HTMLElement>('.lf-field-provider')
  if (!control) throw new Error('Provider missing')
  const initial = control.style.transform
  clock += 40
  act(() => vi.mocked(requestAnimationFrame).mock.lastCall?.[0](clock))
  const moving = control.style.transform
  expect(moving).not.toBe(initial)
  rerender(<LandingModelField {...props} paused />)
  expect(control.style.transform).toBe(moving)
  clock += 60_000
  rerender(<LandingModelField {...props} paused={false} />)
  expect(control.style.transform).toBe(moving)
  expect(disconnect).not.toHaveBeenCalled()
})

it.each(['paused', 'reduced'])(
  'draws hover and focus feedback immediately while %s',
  (condition) => {
    reduced = condition === 'reduced'
    const { container } = render(
      <LandingModelField
        providers={[{ id: 'other', name: 'Other', models: [] }]}
        locale='en'
        selected={null}
        paused={condition === 'paused'}
        onSelect={() => {}}
      />
    )
    act(() => intersect(true))
    const field = container.querySelector<HTMLElement>('.lf-model-field')
    const control = container.querySelector<HTMLElement>('.lf-field-provider')
    if (!field || !control) throw new Error('Field or provider missing')
    expect(field.dataset.playing).toBe('false')
    fireEvent.pointerEnter(control)
    expect(field.dataset.focused).toBe('other')
    fireEvent.pointerLeave(control)
    expect(field.dataset.focused).toBe('')
    fireEvent.focus(control)
    expect(field.dataset.focused).toBe('other')
    fireEvent.blur(control)
    expect(field.dataset.focused).toBe('')
    expect(field.dataset.playing).toBe('false')
  }
)
