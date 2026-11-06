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
  travel: number
  time: number
  dark: boolean
}

type Point = [number, number, number]
const circle = Math.PI * 2
const mix = (a: number, b: number, fraction: number) => a + (b - a) * fraction

function ribbonPoint(
  u: number,
  edge: number,
  time: number,
  progress: number
): Point {
  const angle = u * circle
  const phase = time * 0.16
  const twist = angle + phase
  const width = mix(0.22, 0.29, progress) * (1 + 0.12 * Math.sin(angle * 2))
  const x =
    mix((u - 0.5) * 5.9, Math.cos(angle) * 1.02, progress) +
    Math.cos(twist) * Math.cos(angle) * edge * width
  const y =
    mix(
      Math.sin(angle + phase) * 0.42 + 0.25,
      Math.sin(angle) * 1.4,
      progress
    ) +
    Math.cos(twist) * Math.sin(angle) * edge * width
  const z =
    mix(
      Math.cos(angle + phase) * 0.45,
      Math.sin(angle * 2 + phase) * 0.43,
      progress
    ) +
    Math.sin(twist) * edge * width
  const rotationY = mix(-0.2, Math.sin(time * 0.12) * 0.17, progress)
  const rotationZ = mix(-0.12, -0.25, progress)
  const rotatedX = x * Math.cos(rotationY) + z * Math.sin(rotationY)
  return [
    rotatedX * Math.cos(rotationZ) - y * Math.sin(rotationZ),
    rotatedX * Math.sin(rotationZ) + y * Math.cos(rotationZ),
    -x * Math.sin(rotationY) + z * Math.cos(rotationY),
  ]
}

function ribbonCamera(bounds: RibbonBounds, progress: number) {
  const compact = bounds.height <= 360
  return {
    x: bounds.left + bounds.width * mix(0.72, compact ? 0.69 : 0.5, progress),
    y: bounds.top + bounds.height * mix(0.48, compact ? 0.49 : 0.4, progress),
    size: mix(
      bounds.width * 0.13,
      Math.min(bounds.width * (compact ? 0.17 : 0.2), bounds.height * 0.23),
      progress
    ),
  }
}

// Only decorative geometry is drawn. Credentials and form pixels never enter this canvas.
export function drawRibbon(
  context: CanvasRenderingContext2D,
  frame: RibbonFrame
) {
  const origin = ribbonCamera(frame.from, frame.fromProgress)
  const target = ribbonCamera(frame.to, frame.toProgress)
  const x = mix(origin.x, target.x, frame.travel)
  const y = mix(origin.y, target.y, frame.travel)
  const size = mix(origin.size, target.size, frame.travel)
  const project = (point: Point): Point => {
    const perspective = 4.8 / (4.8 - point[2])
    return [
      x + point[0] * size * perspective,
      y + point[1] * size * perspective,
      point[2],
    ]
  }
  const shadow = context.createRadialGradient(
    x,
    y + size * 1.38,
    0,
    x,
    y + size * 1.38,
    size * 1.3
  )
  shadow.addColorStop(0, frame.dark ? '#00132922' : '#235aaf18')
  shadow.addColorStop(1, '#235aaf00')
  context.fillStyle = shadow
  context.beginPath()
  context.ellipse(x, y + size * 1.38, size * 1.3, size * 0.16, 0, 0, circle)
  context.fill()

  const strips = []
  for (let index = 0; index < 220; index++) {
    const u = index / 220
    const next = (index + 1) / 220
    const points = [
      ribbonPoint(u, -1, frame.time, frame.progress),
      ribbonPoint(u, 1, frame.time, frame.progress),
      ribbonPoint(next, 1, frame.time, frame.progress),
      ribbonPoint(next, -1, frame.time, frame.progress),
    ]
    const [a, b, , d] = points
    const ab = b.map((value, axis) => value - a[axis])
    const ad = d.map((value, axis) => value - a[axis])
    const normal = [
      ab[1] * ad[2] - ab[2] * ad[1],
      ab[2] * ad[0] - ab[0] * ad[2],
      ab[0] * ad[1] - ab[1] * ad[0],
    ]
    const length = Math.hypot(...normal) || 1
    const light = Math.abs(
      (normal[0] * 0.4 - normal[1] * 0.5 + normal[2] * 0.75) / length
    )
    strips.push({
      points: points.map(project),
      depth: points.reduce((sum, point) => sum + point[2], 0) / 4,
      light,
      u,
    })
  }
  strips.sort((a, b) => a.depth - b.depth)
  for (const strip of strips) {
    const [a, b, c, d] = strip.points
    const hue = 216 + 10 * Math.sin(strip.u * circle + frame.time * 0.1)
    const lightness =
      41 +
      strip.light * 32 +
      Math.pow(strip.light, 7) * 13 +
      (frame.dark ? 4 : 0)
    const gradient = context.createLinearGradient(a[0], a[1], b[0], b[1])
    gradient.addColorStop(0, `hsl(${hue} 78% ${Math.min(96, lightness + 17)}%)`)
    gradient.addColorStop(
      0.08,
      `hsl(${hue} 72% ${Math.max(24, lightness - 16)}%)`
    )
    gradient.addColorStop(0.34, `hsl(${hue} 64% ${lightness}%)`)
    gradient.addColorStop(
      0.66,
      `hsl(${hue + 6} 64% ${Math.min(97, lightness + 15)}%)`
    )
    gradient.addColorStop(
      0.94,
      `hsl(${hue} 80% ${Math.max(25, lightness - 13)}%)`
    )
    gradient.addColorStop(1, `hsl(${hue} 70% 94%)`)
    context.fillStyle = gradient
    context.strokeStyle = gradient
    context.lineWidth = 1.15
    context.beginPath()
    context.moveTo(a[0], a[1])
    context.lineTo(b[0], b[1])
    context.lineTo(c[0], c[1])
    context.lineTo(d[0], d[1])
    context.closePath()
    context.fill()
    context.stroke()
  }
}
