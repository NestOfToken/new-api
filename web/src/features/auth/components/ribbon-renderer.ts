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
export interface RibbonBounds {
  left: number
  top: number
  width: number
  height: number
}

interface RibbonFrame {
  from: RibbonBounds
  to: RibbonBounds
  fromProgress: number
  toProgress: number
  progress: number
  time: number
  viewportWidth: number
}

type Point = [number, number, number]
const circle = Math.PI * 2
const surfaceStops = [0, 0.28, 0.48, 0.66, 1]
const edgeStops = [0, 0.45, 0.75, 1]
const mix = (a: number, b: number, fraction: number) => a + (b - a) * fraction

function ringPoint(
  u: number,
  edge: number,
  time: number,
  point: Point,
  duration: number
) {
  const angle = u * circle
  const phase = (time / duration) * circle
  const twist = angle + phase
  const width = 0.29 * (1 + 0.12 * Math.sin(angle * 2))
  const x =
    Math.cos(angle) * 1.02 + Math.cos(twist) * Math.cos(angle) * edge * width
  const y =
    Math.sin(angle) * 1.4 + Math.cos(twist) * Math.sin(angle) * edge * width
  const z = Math.sin(angle * 2 + phase) * 0.43 + Math.sin(twist) * edge * width
  const rotationY = Math.sin(phase) * 0.17
  const rotationZ = -0.25
  const rotatedX = x * Math.cos(rotationY) + z * Math.sin(rotationY)
  point[0] = rotatedX * Math.cos(rotationZ) - y * Math.sin(rotationZ)
  point[1] = rotatedX * Math.sin(rotationZ) + y * Math.cos(rotationZ)
  point[2] = -x * Math.sin(rotationY) + z * Math.cos(rotationY)
}

function ringCamera(bounds: RibbonBounds) {
  const compact = bounds.height <= 360
  return {
    x: bounds.left + bounds.width * (compact ? 0.69 : 0.5),
    y: bounds.top + bounds.height * (compact ? 0.49 : 0.4),
    size: Math.min(bounds.width * (compact ? 0.17 : 0.2), bounds.height * 0.23),
  }
}

// Same Bezier surface and translucent material as LandingOpticalRibbon. Sampling
// lets that open wave fold into the approved login ring without swapping artwork.
export function createRibbonRenderer(
  context: CanvasRenderingContext2D,
  style: CSSStyleDeclaration
) {
  const value = (name: string) =>
    Number.parseFloat(style.getPropertyValue(name)) / 100
  const x = [
    0,
    value('--x-a'),
    value('--x-b'),
    0.5,
    value('--x-c'),
    value('--x-d'),
    1,
  ]
  const upper = [
    0.5,
    value('--upper-a'),
    value('--upper-b'),
    0.5,
    value('--upper-c'),
    value('--upper-d'),
    0.5,
  ]
  const lower = [
    0.5 + value('--end-width'),
    upper[1] + value('--width-a'),
    upper[2] + value('--width-b'),
    0.5 + value('--mid-width'),
    upper[4] + value('--width-c'),
    upper[5] + value('--width-d'),
    0.5 + value('--end-width'),
  ]
  const duration = Number.parseFloat(style.getPropertyValue('--flow-duration'))
  const delay = Number.parseFloat(style.getPropertyValue('--flow-delay'))
  const colors = ['a', 'b', 'c', 'd', 'e'].map((key) =>
    style.getPropertyValue(`--ribbon-color-${key}`).trim()
  )
  const edges = ['a', 'b', 'c'].map((key) =>
    style.getPropertyValue(`--ribbon-edge-${key}`).trim()
  )
  edges.push('#e3f6ff00')
  const profile = new Float64Array(1026)
  for (let index = 0; index <= 512; index++) {
    const position = index / 512
    const start = position < 0.5 ? 0 : 3
    let low = 0,
      high = 1
    for (let step = 0; step < 14; step++) {
      const t = (low + high) / 2
      if (
        cubic(x[start], x[start + 1], x[start + 2], x[start + 3], t) < position
      ) {
        low = t
      } else high = t
    }
    const t = (low + high) / 2
    profile[index * 2] = cubic(
      upper[start],
      upper[start + 1],
      upper[start + 2],
      upper[start + 3],
      t
    )
    profile[index * 2 + 1] = cubic(
      lower[start],
      lower[start + 1],
      lower[start + 2],
      lower[start + 3],
      t
    )
  }
  const points = Array.from({ length: 442 }, (): Point => [0, 0, 0])
  const projected = Array.from({ length: 442 }, (): Point => [0, 0, 0])
  const strips = Array.from({ length: 220 }, (_, index) => ({
    index,
    depth: 0,
  }))
  return (frame: RibbonFrame) => {
    const home = frame.toProgress === 0 ? frame.to : frame.from
    const login = frame.toProgress === 1 ? frame.to : frame.from
    const camera = ringCamera(login)
    const period = Math.max(1080, frame.viewportWidth * 1.1)
    const bandHeight =
      frame.viewportWidth <= 800
        ? 170
        : Math.min(220, Math.max(160, frame.viewportWidth * 0.2))
    const centerY = home.top + home.height / 2
    const phase = (frame.time - delay) / duration
    for (let index = 0; index <= 220; index++) {
      const u = index / 220
      const waveX = home.left + home.width * u
      const sample = ((waveX / period + phase) % 1) * 512
      const offset = Math.floor(sample)
      const fraction = sample - offset
      for (let edge = 0; edge < 2; edge++) {
        const slot = index * 2 + edge
        const y = mix(
          profile[offset * 2 + edge],
          profile[(offset + 1) * 2 + edge],
          fraction
        )
        const waveY = centerY + (y - 0.5) * bandHeight
        const point = points[slot]
        if (frame.progress > 0) {
          ringPoint(u, edge * 2 - 1, frame.time, point, duration)
        }
        const perspective = 4.8 / (4.8 - point[2])
        projected[slot][0] = mix(
          waveX,
          camera.x + point[0] * camera.size * perspective,
          frame.progress
        )
        projected[slot][1] = mix(
          waveY,
          camera.y + point[1] * camera.size * perspective,
          frame.progress
        )
      }
    }
    const materialY = mix(centerY, camera.y, frame.progress)
    const materialHeight = mix(bandHeight, camera.size * 3.2, frame.progress)
    const gain = mix(1, 4, frame.progress)
    const gradient = ribbonGradient(
      context,
      materialY,
      materialHeight,
      colors,
      surfaceStops,
      gain
    )
    const highlight = ribbonGradient(
      context,
      materialY,
      materialHeight,
      edges,
      edgeStops,
      gain
    )
    if (frame.progress === 0) {
      context.fillStyle = gradient
      traceBand(context, projected, 1)
      context.fill()
      context.fillStyle = highlight
      traceBand(context, projected, 0.14)
      context.fill()
      return
    }
    for (const strip of strips) {
      const slot = strip.index * 2
      strip.depth =
        (points[slot][2] +
          points[slot + 1][2] +
          points[slot + 2][2] +
          points[slot + 3][2]) /
        4
    }
    strips.sort((a, b) => a.depth - b.depth)
    for (const strip of strips) {
      const slot = strip.index * 2
      const a = projected[slot],
        b = projected[slot + 1],
        c = projected[slot + 3],
        d = projected[slot + 2]
      context.fillStyle = gradient
      context.beginPath()
      context.moveTo(a[0], a[1])
      context.lineTo(b[0], b[1])
      context.lineTo(c[0], c[1])
      context.lineTo(d[0], d[1])
      context.closePath()
      context.fill()
      context.fillStyle = highlight
      context.beginPath()
      context.moveTo(a[0], a[1])
      context.lineTo(mix(a[0], b[0], 0.14), mix(a[1], b[1], 0.14))
      context.lineTo(mix(d[0], c[0], 0.14), mix(d[1], c[1], 0.14))
      context.lineTo(d[0], d[1])
      context.closePath()
      context.fill()
    }
  }
}

function ribbonGradient(
  context: CanvasRenderingContext2D,
  centerY: number,
  height: number,
  colors: string[],
  stops: number[],
  gain: number
) {
  const gradient = context.createLinearGradient(
    0,
    centerY - height / 2,
    0,
    centerY + height / 2
  )
  for (let index = 0; index < colors.length; index++) {
    const color = colors[index]
    const alpha = Math.min(
      255,
      Math.round(Number.parseInt(color.slice(7), 16) * gain)
    )
    gradient.addColorStop(
      stops[index],
      `${color.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}`
    )
  }
  return gradient
}

function cubic(a: number, b: number, c: number, d: number, t: number) {
  const reverse = 1 - t
  return (
    reverse * reverse * reverse * a +
    3 * reverse * reverse * t * b +
    3 * reverse * t * t * c +
    t * t * t * d
  )
}

function traceBand(
  context: CanvasRenderingContext2D,
  points: Point[],
  width: number
) {
  context.beginPath()
  for (let index = 0; index <= 220; index++) {
    const top = points[index * 2]
    if (index === 0) context.moveTo(top[0], top[1])
    else context.lineTo(top[0], top[1])
  }
  for (let index = 220; index >= 0; index--) {
    const top = points[index * 2],
      bottom = points[index * 2 + 1]
    context.lineTo(bottom[0], mix(top[1], bottom[1], width))
  }
  context.closePath()
}
