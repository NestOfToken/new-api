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
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { createGalaxyField, type GalaxyCatalog } from '../layout'
import { ReferenceGalaxyScene } from '../scene'

let clock: number
let sequence: number
let reduced: boolean
let intersect: (visible: boolean) => void
let resize: () => void
const pending = new Map<number, FrameRequestCallback>()
const instances: ReferenceGalaxyScene[] = []

beforeEach(() => {
  clock = 2000
  sequence = 0
  reduced = false
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.spyOn(window, 'matchMedia').mockImplementation(
    () =>
      Object.defineProperty(new EventTarget(), 'matches', {
        get: () => reduced,
      }) as MediaQueryList
  )
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++sequence, callback)
    return sequence
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id))
  vi.stubGlobal('WebGLRenderingContext', undefined)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    }
  )
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private target: Element | null = null
      constructor(callback: IntersectionObserverCallback) {
        intersect = (visible) => {
          if (!this.target) return
          callback(
            [
              {
                target: this.target,
                isIntersecting: visible,
              } as IntersectionObserverEntry,
            ],
            this as unknown as IntersectionObserver
          )
        }
      }
      observe(target: Element) {
        this.target = target
      }
      unobserve(target: Element) {
        if (this.target === target) this.target = null
      }
      disconnect() {}
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect() {},
    setTransform() {},
    save() {},
    restore() {},
    translate() {},
    scale() {},
    rotate() {},
    drawImage() {},
    fillRect() {},
    beginPath() {},
    rect() {},
    arc() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    fillText() {},
    measureText: () => ({ width: 60 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData() {},
  } as unknown as CanvasRenderingContext2D)
  vi.stubGlobal(
    'PointerEvent',
    class extends MouseEvent {
      pointerId = 1
      pointerType = 'mouse'
    }
  )
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    value: vi.fn(),
    configurable: true,
  })
})
afterEach(() => {
  instances.splice(0).forEach((instance) => instance.dispose())
  document.body.replaceChildren()
  pending.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function fixture() {
  const catalog: GalaxyCatalog = {
    labs: [
      { key: 'alpha', author: 'alpha', name: 'Alpha', image: '' },
      { key: 'beta', author: 'beta', name: 'Beta', image: '' },
    ],
    models: [
      {
        slug: 'alpha/fast',
        name: 'Alpha Fast',
        lab: 'alpha',
        variant: null,
        created: 1_000_000,
        weeklyTokens: 1_000_000_000,
        outputModalities: ['text'],
      },
      {
        slug: 'alpha/pro',
        name: 'Alpha Pro',
        lab: 'alpha',
        variant: null,
        created: 1_000_000,
        weeklyTokens: 100_000_000,
        outputModalities: ['text'],
      },
      {
        slug: 'beta/one',
        name: 'Beta One',
        lab: 'beta',
        variant: null,
        created: 1_000_000,
        weeklyTokens: 10_000_000,
        outputModalities: ['image'],
      },
    ],
    isUsageAvailable: true,
  }
  const wrap = document.createElement('div'),
    canvas = document.createElement('canvas'),
    front = document.createElement('canvas'),
    mark = document.createElement('div'),
    anchor = document.createElement('span'),
    labels = [
      document.createElement('button'),
      document.createElement('button'),
    ]
  Object.defineProperties(wrap, {
    clientWidth: { value: 1265, configurable: true },
    clientHeight: { value: 496, configurable: true },
  })
  wrap.append(canvas, front, mark, anchor, ...labels)
  document.body.append(wrap)
  const field = createGalaxyField(catalog, 1_000_000)
  const hover = vi.fn()
  const inspect = vi.fn()
  const scene = new ReferenceGalaxyScene({
    wrap,
    canvas,
    front,
    mark,
    anchor,
    labels,
    copy: null,
    field,
    onHover: hover,
    onInspectLab: inspect,
  })
  instances.push(scene)
  intersect(true)
  return { scene, field, canvas, labels, hover, wrap, anchor, inspect }
}
function frames(count: number) {
  for (let index = 0; index < count; index++) {
    clock += 1000 / 30
    const callbacks = [...pending.values()]
    pending.clear()
    callbacks.forEach((callback) => callback(clock))
  }
}
function pointer(
  canvas: HTMLCanvasElement,
  type: string,
  x: number,
  y: number
) {
  canvas.dispatchEvent(
    new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true })
  )
}

it('does not advance painted orbital positions for a burst of pointer events before the next frame', () => {
  const { canvas, labels } = fixture()
  frames(4)
  const before = labels.map((label) => label.style.transform)
  for (let index = 0; index < 30; index++) {
    pointer(canvas, 'pointermove', 40 + index, 40)
  }
  expect(labels.map((label) => label.style.transform)).toEqual(before)
  frames(20)
  expect(labels.map((label) => label.style.transform)).not.toEqual(before)
})

it('publishes the real hovered model and clears its detail when the pointer leaves', () => {
  const { scene, canvas, field, hover, anchor } = fixture()
  scene.setPaused(true)
  pointer(canvas, 'pointermove', field.points[0].x, field.points[0].y)
  expect(hover).toHaveBeenLastCalledWith(
    expect.objectContaining({
      model: expect.objectContaining({ slug: 'alpha/fast' }),
    })
  )
  expect(anchor.style.transform).toContain('translate(')
  pointer(canvas, 'pointerleave', 0, 0)
  expect(hover).toHaveBeenLastCalledWith(null)
})

it('centers a held model cluster and returns it to its original position on release', () => {
  const { scene, canvas, labels, field, inspect } = fixture()
  scene.setPaused(true)
  const before = labels[0].style.transform
  const point = field.points[0]
  pointer(canvas, 'pointermove', point.x, point.y)
  pointer(canvas, 'pointerdown', point.x, point.y)
  expect(inspect).toHaveBeenCalledWith('alpha')
  frames(40)
  expect(labels[0].style.transform).not.toBe(before)
  pointer(canvas, 'pointerup', point.x, point.y)
  frames(40)
  const position = (transform: string) =>
    (transform.match(/translate\(([-.\d]+)px,([-.\d]+)px\)/) ?? [])
      .slice(1)
      .map(Number)
  const start = position(before),
    returned = position(labels[0].style.transform)
  expect(
    Math.hypot(returned[0] - start[0], returned[1] - start[1])
  ).toBeLessThan(1)
})

it('preserves ordinary wheel scrolling but zooms for the control-wheel gesture', () => {
  const { scene, canvas, labels } = fixture()
  scene.setPaused(true)
  const before = labels[0].style.transform
  const scroll = new WheelEvent('wheel', { deltaY: -60, cancelable: true })
  canvas.dispatchEvent(scroll)
  expect(scroll.defaultPrevented).toBe(false)
  expect(labels[0].style.transform).toBe(before)
  const zoom = new WheelEvent('wheel', {
    deltaY: -60,
    ctrlKey: true,
    cancelable: true,
    clientX: 860,
    clientY: 248,
  })
  canvas.dispatchEvent(zoom)
  frames(40)
  expect(zoom.defaultPrevented).toBe(true)
  expect(labels[0].style.transform).not.toBe(before)
})

it('stops scheduling offscreen and retains model feedback under reduced motion', () => {
  reduced = true
  const { wrap, canvas, field, hover } = fixture()
  expect(wrap.dataset.playing).toBe('false')
  pointer(canvas, 'pointermove', field.points[0].x, field.points[0].y)
  expect(hover).toHaveBeenCalledWith(
    expect.objectContaining({
      model: expect.objectContaining({ name: 'Alpha Fast' }),
    })
  )
  intersect(false)
  expect(pending.size).toBe(0)
  expect(wrap.dataset.playing).toBe('false')
})

it.each([false, true])(
  'explores another model and pans by keyboard while stopped (reduced=%s)',
  (reduce) => {
    reduced = reduce
    const { scene, labels, hover } = fixture()
    scene.setPaused(true)
    scene.focusLab(0)
    expect(hover).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ slug: 'alpha/fast' }),
      })
    )
    labels[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
        cancelable: true,
      })
    )
    expect(hover).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ slug: 'alpha/pro' }),
      })
    )
    scene.inspectLab(0)
    frames(40)
    const before = labels[0].style.transform
    labels[0].dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    )
    frames(40)
    expect(labels[0].style.transform).not.toBe(before)
  }
)

it('normalizes fresh and user-zoomed views across both responsive directions', () => {
  const { scene, wrap, canvas } = fixture()
  scene.setPaused(true)
  expect(wrap.dataset.zoom).toBe('1.660')
  Object.defineProperties(wrap, {
    clientWidth: { value: 390 },
    clientHeight: { value: 340 },
  })
  resize()
  expect(wrap.dataset.zoom).toBe('1.900')
  Object.defineProperties(wrap, {
    clientWidth: { value: 1265 },
    clientHeight: { value: 496 },
  })
  resize()
  expect(wrap.dataset.zoom).toBe('1.660')
  canvas.dispatchEvent(
    new WheelEvent('wheel', {
      deltaY: -40,
      ctrlKey: true,
      cancelable: true,
      clientX: 860,
      clientY: 248,
    })
  )
  frames(40)
  const zoom = Number(wrap.dataset.zoom)
  Object.defineProperties(wrap, {
    clientWidth: { value: 390 },
    clientHeight: { value: 340 },
  })
  resize()
  expect(Number(wrap.dataset.zoom)).toBeCloseTo((zoom * 1.9) / 1.66, 2)
  Object.defineProperties(wrap, {
    clientWidth: { value: 1265 },
    clientHeight: { value: 496 },
  })
  resize()
  expect(Number(wrap.dataset.zoom)).toBeCloseTo(zoom, 2)
})

it('becomes idle after a stationary pointer settles near the paused mark', () => {
  const { scene, canvas, wrap } = fixture()
  scene.setPaused(true)
  pointer(canvas, 'pointermove', 950, 200)
  frames(240)
  expect(wrap.dataset.playing).toBe('false')
  expect(pending.size).toBe(0)
})
