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
import {
  GalaxyAtmosphere,
  GALAXY_STARS,
  REFRACTION_SAMPLES,
} from './atmosphere'
import {
  clamp,
  easeOut,
  galaxyArcAngle,
  galaxyArcTables,
  galaxyViewport,
  mixedColor,
  ORBITS,
  OUTER_ORBITS,
  projectGalaxy,
  rgba,
  type GalaxyCluster,
  type GalaxyPalette,
  type GalaxyPoint,
} from './layout'
import type { GalaxyMark } from './mark'

interface PaintedField {
  clusters: GalaxyCluster[]
  points: GalaxyPoint[]
}
export interface GalaxyPaintFrame {
  geometry?: ReturnType<typeof galaxyViewport>
  width: number
  height: number
  ratio: number
  dt: number
  time: number
  zoom: number
  panX: number
  panY: number
  turn: number
  speed: number
  pointTime: number
  pointer: { x: number; y: number } | null
  parallaxX: number
  parallaxY: number
  tiltX: number
  tiltY: number
  faceX: number
  faceY: number
  spinX: number
  spinY: number
  active: number | null
  inspectedLab: number | null
  nearest: GalaxyPoint | null
  reduced: boolean
  paused: boolean
  dragging: boolean
  palette: GalaxyPalette
  popoverPoint: GalaxyPoint | null
}

export class GalaxyPainter {
  readonly atmosphere = new GalaxyAtmosphere()
  core = { x: 0, y: 0, radius: 0, size: 0 }
  private rectangles: {
    left: number
    top: number
    right: number
    bottom: number
  }[] = []
  private boot = 0
  private labsIn = 0
  private markIn = 0
  private activeFade = 0
  private tilt = -1
  private tables = galaxyArcTables(1.27)
  private lamp = { x: 0, y: 0, on: 0 }
  private pulseAccumulator = 0
  private pulses: { point: GalaxyPoint; born: number }[] = []
  private backing = {
    x: 0,
    y: 0,
    span: 1,
    behindX: 0,
    behindY: 0,
    behindSize: 1,
  }
  private coarse = document.createElement('canvas')
  private scattered = document.createElement('canvas')
  private labelOpacity: number[] = []
  private tooltipPosition = { x: 0, y: 0, fresh: true }
  private font = 'sans-serif'
  private selectableLabs = false

  constructor(
    private canvas: HTMLCanvasElement,
    private front: HTMLCanvasElement,
    public field: PaintedField,
    private labels: HTMLElement[],
    private copy: HTMLElement | null,
    private markHost: HTMLElement,
    private anchor: HTMLElement
  ) {
    this.selectableLabs = canvas.parentElement?.dataset.mode === 'catalog'
  }

  measureCopy() {
    const canvasBounds = this.canvas.getBoundingClientRect()
    this.font = getComputedStyle(this.canvas).fontFamily
    this.rectangles = []
    if (!this.copy || this.canvas.clientWidth < 1024) return
    const bounds: DOMRect[] = []
    for (const element of this.copy.querySelectorAll('h1, p, dt, dd')) {
      const range = document.createRange()
      range.selectNodeContents(element)
      bounds.push(...range.getClientRects())
    }
    for (const element of this.copy.querySelectorAll(
      '[data-hero-actions] > *'
    )) {
      bounds.push(element.getBoundingClientRect())
    }
    this.rectangles = bounds.map((rect) => ({
      left: rect.left - canvasBounds.left - 32,
      right: rect.right - canvasBounds.left + 32,
      top: rect.top - canvasBounds.top - 32,
      bottom: rect.bottom - canvasBounds.top + 32,
    }))
  }

  setCopy(copy: HTMLElement | null) {
    this.copy = copy
    this.measureCopy()
  }
  setField(field: PaintedField, labels: HTMLElement[]) {
    const opacity = new Map(
      this.field.clusters.map((cluster, index) => [
        cluster.key,
        this.labelOpacity[index] ?? 0,
      ])
    )
    this.field = field
    // Pulses carry point references from the previous catalog, not stable IDs.
    this.pulses = []
    this.labels = labels
    this.labelOpacity = field.clusters.map(
      (cluster) => opacity.get(cluster.key) ?? 0
    )
  }

  copyClearance(x: number, y: number) {
    return this.rectangles.reduce(
      (distance, rect) =>
        Math.min(
          distance,
          Math.max(
            rect.left - x,
            x - rect.right,
            rect.top - y,
            y - rect.bottom,
            0
          )
        ),
      Infinity
    )
  }

  markOccludes(x: number, y: number) {
    return Math.hypot(x - this.core.x, y - this.core.y) < this.core.radius
  }

  private paintRefraction = (
    context: CanvasRenderingContext2D,
    size: number
  ) => {
    const frame = this.lastFrame
    if (!frame || this.labsIn < 0.01) return
    const ratio = this.canvas.width / frame.width
    context.globalAlpha = 0.75 * easeOut(this.labsIn)
    context.filter = 'blur(3px)'
    const b = this.backing
    context.drawImage(
      this.canvas,
      (b.behindX - b.behindSize / 2) * ratio,
      (b.behindY - b.behindSize / 2) * ratio,
      b.behindSize * ratio,
      b.behindSize * ratio,
      0,
      0,
      size,
      size
    )
    const smallSize = Math.round(size / 12)
    this.coarse.width = this.coarse.height = smallSize
    this.scattered.width = this.scattered.height = size
    const coarse = this.coarse.getContext('2d'),
      scatter = this.scattered.getContext('2d')
    if (coarse && scatter) {
      coarse.fillStyle = rgba(
        frame.palette.dark ? frame.palette.foreground : [28, 36, 52],
        1
      )
      coarse.beginPath()
      for (const point of this.field.points) {
        const x = ((point.x - b.x) * smallSize) / b.span + smallSize / 2,
          y = ((point.y - b.y) * smallSize) / b.span + smallSize / 2
        if (x >= 0 && y >= 0 && x <= smallSize && y <= smallSize) {
          coarse.rect(x, y, 1, 1)
        }
      }
      coarse.fill()
      for (const sample of REFRACTION_SAMPLES) {
        scatter.setTransform(
          sample.size,
          0,
          0,
          sample.size,
          sample.x * size,
          sample.y * size
        )
        scatter.rotate(sample.angle)
        scatter.globalAlpha = sample.light
        scatter.drawImage(this.coarse, -smallSize / 2, -smallSize / 2)
      }
      context.globalAlpha =
        easeOut(this.labsIn) * (frame.palette.dark ? 0.25 : 0.18)
      context.filter = 'blur(1.6px)'
      context.drawImage(this.scattered, 0, 0)
    }
    context.filter = 'none'
    context.globalAlpha = 1
  }
  private lastFrame: GalaxyPaintFrame | undefined

  paint(frame: GalaxyPaintFrame, mark: GalaxyMark | null) {
    this.lastFrame = frame
    const back = this.canvas.getContext('2d'),
      front = this.front.getContext('2d')
    if (!back || !front) return
    const { width, height, dt, time, palette, zoom, panX, panY } = frame
    const geometry = frame.geometry ?? galaxyViewport(width, height)
    const tilt = geometry.inclination + 0.015 * frame.tiltY
    const squash = Math.cos(tilt)
    if (Math.abs(squash - this.tilt) > 0.005) {
      this.tilt = squash
      this.tables = galaxyArcTables(tilt)
    }
    const project = (x: number, y: number) =>
      projectGalaxy(x, y, geometry, zoom, panX, panY, tilt)
    const parallaxSize = 0.0015 * Math.min(width, 1440)
    const shift = (depth: number) => ({
      x: -frame.parallaxX * parallaxSize * depth,
      y: -frame.parallaxY * parallaxSize * depth * 0.7,
    })
    back.clearRect(0, 0, width, height)
    front.clearRect(0, 0, width, height)
    this.boot = frame.reduced || frame.paused ? 9 : Math.min(9, this.boot + dt)
    if (this.boot > 0.5 && this.field.clusters.length) {
      this.labsIn =
        frame.reduced || frame.paused ? 1 : Math.min(1, this.labsIn + dt / 0.9)
    }
    const reveal = (order: number) =>
      easeOut(clamp((this.boot - order * 0.1) / 0.8))
    const labsAlpha = easeOut(this.labsIn)
    back.globalAlpha = front.globalAlpha = reveal(0)
    if (!palette.dark) {
      back.fillStyle = rgba(palette.foreground, 0.05)
      back.fillRect(0, 0, width, height)
    }
    const ground = back.createRadialGradient(
      geometry.x + panX,
      geometry.y + panY,
      0,
      geometry.x + panX,
      geometry.y + panY,
      1.1 * geometry.radius * zoom
    )
    ground.addColorStop(
      0,
      palette.dark ? rgba(palette.foreground, 0.05) : 'rgba(255,255,255,.85)'
    )
    ground.addColorStop(
      1,
      palette.dark ? rgba(palette.foreground, 0) : 'rgba(255,255,255,0)'
    )
    back.fillStyle = ground
    back.fillRect(0, 0, width, height)
    const lampEasing = 1 - 0.002 ** dt
    if (frame.pointer) {
      this.lamp.x += (frame.pointer.x - this.lamp.x) * lampEasing
      this.lamp.y += (frame.pointer.y - this.lamp.y) * lampEasing
    }
    this.lamp.on +=
      ((frame.pointer && !frame.reduced ? 1 : 0) - this.lamp.on) *
      Math.min(1, dt * 4)
    const cloudShift = shift(0.15)
    this.atmosphere.draw(
      back,
      width,
      height,
      geometry.x + panX + cloudShift.x,
      geometry.y + panY + cloudShift.y,
      geometry.radius * zoom * 1.9,
      squash,
      frame.reduced ? 0 : time,
      frame.paused ? 0 : dt,
      palette,
      this.lamp,
      frame.ratio
    )
    const starBuckets: number[][] = Array.from({ length: 5 }, () => [])
    const starShift = shift(0.3)
    for (const star of GALAXY_STARS) {
      const x =
        geometry.x +
        panX +
        star.x * geometry.radius * Math.sqrt(zoom) +
        starShift.x
      const y =
        geometry.y +
        panY +
        star.y * geometry.radius * Math.sqrt(zoom) +
        starShift.y
      if (x < -2 || y < -2 || x > width + 2 || y > height + 2) continue
      const twinkle = frame.reduced
        ? 1
        : 0.8 + 0.2 * Math.sin(time * 0.8 + star.twinkle)
      const alpha =
        star.alpha * twinkle * clamp(this.copyClearance(x, y) / 30, 0.3, 1)
      starBuckets[Math.min(4, Math.floor(alpha * 5))].push(
        x - star.size / 2,
        y - star.size / 2,
        star.size
      )
    }
    starBuckets.forEach((bucket, index) => {
      back.fillStyle = rgba(
        palette.foreground,
        ((index + 0.5) / 5) * (palette.dark ? 0.42 : 0.55)
      )
      back.beginPath()
      for (let point = 0; point < bucket.length; point += 3) {
        back.rect(
          bucket[point],
          bucket[point + 1],
          bucket[point + 2],
          bucket[point + 2]
        )
      }
      back.fill()
    })
    for (const [index, radius] of [...ORBITS, ...OUTER_ORBITS].entries()) {
      const outer = index >= ORBITS.length,
        order = outer ? index - ORBITS.length : index
      const offset = shift(outer ? 1.25 + order * 0.25 : 0.5 + order * 0.25)
      const samples = outer ? 128 : 96
      let opacity = palette.dark ? 0.09 : 0.15
      if (outer) opacity = (palette.dark ? 0.07 : 0.08) * (1 - order * 0.28)
      back.strokeStyle = rgba(palette.foreground, opacity)
      back.lineWidth = 1
      back.beginPath()
      for (let step = 0; step <= Math.round(samples * reveal(index)); step++) {
        const angle = Math.PI / 2 + (step / samples) * Math.PI * 2
        const point = project(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius
        )
        if (!step) back.moveTo(point.x + offset.x, point.y + offset.y)
        else back.lineTo(point.x + offset.x, point.y + offset.y)
      }
      back.stroke()
    }
    for (const cluster of this.field.clusters) {
      cluster.theta += (0.007 / 0.75 ** 1.5) * frame.speed * dt
      const table = this.tables.get(cluster.orbit)
      const angle = table
        ? galaxyArcAngle(
            cluster.theta + frame.turn + frame.tiltX * 0.035,
            table
          )
        : cluster.theta
      cluster.worldX = Math.cos(angle) * cluster.orbit
      cluster.worldY = Math.sin(angle) * cluster.orbit
      const point = project(cluster.worldX, cluster.worldY),
        offset = shift(cluster.depth)
      cluster.x = point.x + offset.x
      cluster.y = point.y + offset.y
      cluster.rx = cluster.radius * geometry.radius * point.scale * zoom
      cluster.ry = cluster.rx * squash
    }
    const highlightEasing =
      frame.reduced || frame.paused ? 1 : Math.min(1, dt * 14)
    this.activeFade +=
      ((frame.active !== null ? 1 : 0) - this.activeFade) * highlightEasing
    this.field.clusters.forEach((cluster, index) => {
      cluster.highlight +=
        ((frame.active === index ? 1 : 0) - cluster.highlight) * highlightEasing
    })
    const lineBuckets = [
      Array.from({ length: 12 }, () => [] as number[]),
      Array.from({ length: 12 }, () => [] as number[]),
    ]
    const dotBuckets = [
      Array.from({ length: 12 }, () => [] as number[]),
      Array.from({ length: 12 }, () => [] as number[]),
    ]
    const sizeZoom = 1 + (zoom - 1) * 0.3
    for (const point of this.field.points) {
      const cluster = this.field.clusters[point.cluster]
      const angle = point.angle + frame.pointTime * (0.12 / (0.4 + point.ring))
      const projected = project(
        cluster.worldX + Math.cos(angle) * point.ring * cluster.radius,
        cluster.worldY + Math.sin(angle) * point.ring * cluster.radius
      )
      const offset = shift(cluster.depth)
      let x = projected.x + offset.x,
        y = projected.y + offset.y,
        proximity = 0
      point.scale = projected.scale
      if (frame.pointer && !frame.dragging && zoom < 1.3) {
        const dx = x - frame.pointer.x,
          dy = y - frame.pointer.y,
          distance = Math.hypot(dx, dy)
        if (distance < 120) {
          proximity = 1 - distance / 120
          const force = proximity ** 2 * 3
          x += (dx / (distance || 1)) * force
          y += (dy / (distance || 1)) * force
        }
      }
      const dx = x - cluster.x,
        dy = y - cluster.y,
        distance = Math.hypot(dx, dy)
      const radius = Math.sqrt(
        576 + distance ** 2 * (1 - (24 / Math.max(cluster.rx, 25)) ** 2)
      )
      point.x =
        cluster.x +
        (distance > 0.5 ? dx / distance : Math.cos(point.angle)) * radius
      point.y =
        cluster.y +
        (distance > 0.5 ? dy / distance : Math.sin(point.angle)) * radius
      if (
        point.x < -20 ||
        point.x > width + 20 ||
        point.y < -20 ||
        point.y > height + 20 ||
        labsAlpha < 0.01
      ) {
        continue
      }
      const mask =
        clamp(this.copyClearance(point.x, point.y) / 30, 0.3, 1) * labsAlpha
      const depthAlpha = clamp((point.scale - 0.7) / 0.6, 0.55, 1)
      const baseAlpha =
        (((palette.dark ? 0.28 : 0.38) +
          ((palette.dark ? 1 : 0.95) - (palette.dark ? 0.28 : 0.38)) *
            point.luminosity) *
          depthAlpha +
          proximity * 0.5) *
        (1 - 0.25 * this.activeFade)
      const alpha = baseAlpha + (0.9 - baseAlpha) * cluster.highlight
      const lineAlpha =
        cluster.count > 1
          ? (palette.dark ? 0.16 : 0.26) *
            (cluster.count <= 6 ? 1.5 : 1) *
            depthAlpha *
            (1 - this.activeFade * 0.25)
          : 0
      const size =
        Math.max(1.9, point.size * point.scale * sizeZoom) +
        0.4 * cluster.highlight
      const layer = cluster.worldY > 0 ? 1 : 0
      if (cluster.highlight > 0.01) {
        const context = layer ? front : back
        if (lineAlpha) {
          context.strokeStyle = mixedColor(
            palette.foreground,
            palette.accent,
            cluster.highlight,
            (lineAlpha + (0.35 - lineAlpha) * cluster.highlight) * mask
          )
          context.lineWidth = 0.6
          context.beginPath()
          context.moveTo(cluster.x, cluster.y)
          context.lineTo(point.x, point.y)
          context.stroke()
        }
        context.fillStyle = mixedColor(
          palette.foreground,
          palette.accent,
          cluster.highlight,
          alpha * mask
        )
        context.beginPath()
        context.arc(point.x, point.y, size, 0, Math.PI * 2)
        context.fill()
      } else {
        if (lineAlpha) {
          lineBuckets[layer][
            Math.min(11, Math.floor(((lineAlpha * mask) / 0.4) * 12))
          ].push(cluster.x, cluster.y, point.x, point.y)
        }
        dotBuckets[layer][Math.min(11, Math.floor(alpha * mask * 12))].push(
          point.x,
          point.y,
          size
        )
      }
    }
    ;[back, front].forEach((context, layer) => {
      lineBuckets[layer].forEach((bucket, index) => {
        context.strokeStyle = rgba(
          palette.foreground,
          ((index + 0.5) / 12) * 0.4
        )
        context.lineWidth = 0.6
        context.beginPath()
        for (let point = 0; point < bucket.length; point += 4) {
          context.moveTo(bucket[point], bucket[point + 1])
          context.lineTo(bucket[point + 2], bucket[point + 3])
        }
        context.stroke()
      })
      dotBuckets[layer].forEach((bucket, index) => {
        context.fillStyle = rgba(
          palette.dark ? palette.foreground : [28, 36, 52],
          (index + 0.5) / 12
        )
        context.beginPath()
        for (let point = 0; point < bucket.length; point += 3) {
          context.moveTo(bucket[point] + bucket[point + 2], bucket[point + 1])
          context.arc(
            bucket[point],
            bucket[point + 1],
            bucket[point + 2],
            0,
            Math.PI * 2
          )
        }
        context.fill()
      })
    })
    if (
      zoom > 2.6 &&
      !frame.dragging &&
      (frame.inspectedLab !== null || frame.nearest)
    ) {
      const names = this.field.points
        .filter((point) => point.cluster === frame.inspectedLab)
        .sort((a, b) => b.size - a.size)
        .slice(0, 24)
      const occupied: { x: number; y: number; width: number }[] = []
      front.font = `450 14px ${this.font}`
      front.textBaseline = 'middle'
      front.textAlign = 'left'
      for (const point of frame.nearest
        ? [frame.nearest, ...names.filter((item) => item !== frame.nearest)]
        : names) {
        const name = point.model.variant
          ? `${point.model.name} (${point.model.variant})`
          : point.model.name
        const x = point.x + 6 * sizeZoom,
          textWidth = front.measureText(name).width
        if (
          occupied.some(
            (rect) =>
              Math.abs(rect.y - point.y) < 15 &&
              x < rect.x + rect.width + 6 &&
              x + textWidth + 6 > rect.x
          )
        ) {
          continue
        }
        occupied.push({ x, y: point.y, width: textWidth })
        const textOpacity =
          point === frame.nearest ? 1 : [0.85, 0.75][Number(palette.dark)]
        front.fillStyle = rgba(
          palette.foreground,
          textOpacity *
            clamp((zoom - 2.6) / 1.2) *
            clamp(this.copyClearance(point.x, point.y) / 30)
        )
        front.fillText(name, x, point.y)
      }
    }
    const markShift = shift(1.4),
      markRadius = 0.225 * geometry.radius * zoom
    const top = project(0, -ORBITS[0]).y,
      bottom = project(0, ORBITS[0]).y
    const coreX = geometry.x + panX + markShift.x,
      coreY = (top + bottom) / 2 + markShift.y - markRadius * 0.2
    const markSize = markRadius * 1.9
    this.core = {
      x: coreX,
      y: coreY,
      radius: markRadius * 0.62,
      size: markSize,
    }
    this.backing = {
      x: geometry.x + panX,
      y: geometry.y + panY,
      span: geometry.radius * zoom * 2.6,
      behindX: coreX,
      behindY: coreY,
      behindSize: (markSize * 4.2) / (13 * Math.tan((14 * Math.PI) / 180)),
    }
    if (
      mark &&
      coreX + markSize / 2 > 0 &&
      coreX - markSize / 2 < width &&
      coreY + markSize / 2 > 0 &&
      coreY - markSize / 2 < height
    ) {
      mark.render({
        // Stable targets avoid reallocating transmission buffers during camera travel.
        pixels: width <= 640 ? 384 : 512,
        time: frame.reduced ? 0 : time,
        faceX: frame.faceX,
        faceY: frame.faceY,
        spinX: frame.spinX,
        spinY: frame.spinY,
        palette,
        paint: this.paintRefraction,
      })
    }
    this.markIn =
      frame.reduced || frame.paused
        ? 1
        : Math.min(1, this.markIn + (this.labsIn > 0 ? dt / 0.8 : 0))
    this.markHost.style.width =
      this.markHost.style.height = `${Math.round(markSize * 2) / 2}px`
    this.markHost.style.transform = `translate(${Math.round((coreX - markSize / 2) * 2) / 2}px,${Math.round((coreY - markSize / 2) * 2) / 2}px)`
    this.markHost.style.opacity = String(
      clamp(this.copyClearance(coreX, coreY) / 30, 0.08, 1) *
        this.markIn *
        (2 - this.markIn)
    )
    if (!frame.reduced && !frame.paused && this.labsIn >= 1) {
      this.pulseAccumulator += dt * 12 * Math.max(frame.speed, 0.25)
      while (this.pulseAccumulator >= 1) {
        const point =
          this.field.points[
            Math.floor(Math.random() * this.field.points.length)
          ]
        if (point) this.pulses.push({ point, born: time })
        if (this.pulses.length > 60) this.pulses.shift()
        this.pulseAccumulator--
      }
    }
    this.pulses = this.pulses.filter((pulse) => time - pulse.born < 1.1)
    for (const pulse of this.pulses) {
      const progress = (time - pulse.born) / 1.1,
        point = pulse.point,
        context = this.field.clusters[point.cluster].worldY > 0 ? front : back
      const mask = clamp(this.copyClearance(point.x, point.y) / 30, 0.1, 1)
      if (progress < 0.3) {
        context.fillStyle = rgba(
          palette.accent,
          (1 - progress / 0.3) * 0.75 * mask
        )
        context.beginPath()
        context.arc(point.x, point.y, 3, 0, Math.PI * 2)
        context.fill()
      }
      context.strokeStyle = rgba(
        palette.accent,
        (1 - progress) * (palette.dark ? 0.7 : 0.75) * mask
      )
      context.lineWidth = 1.3
      context.beginPath()
      context.arc(point.x, point.y, 2 + 13 * easeOut(progress), 0, Math.PI * 2)
      context.stroke()
    }
    if (frame.nearest) {
      const point = frame.nearest,
        context = this.field.clusters[point.cluster].worldY > 0 ? front : back
      context.strokeStyle = rgba(palette.accent, 1)
      context.lineWidth = 1.5
      context.beginPath()
      context.arc(point.x, point.y, 6, 0, Math.PI * 2)
      context.stroke()
    }
    if (geometry.wide) {
      for (const context of [back, front]) {
        const fade = context.createLinearGradient(0, 0, width * 0.42, 0)
        for (const [stop, alpha] of [
          [0, 1],
          [0.2, 0.55],
          [0.45, 0.3],
          [1, 0],
        ]) {
          fade.addColorStop(stop, `rgba(0,0,0,${alpha})`)
        }
        context.save()
        context.globalAlpha = 1
        context.globalCompositeOperation = 'destination-out'
        context.fillStyle = fade
        context.fillRect(0, 0, width * 0.42, height)
        context.restore()
      }
    }
    const occupied: { x: number; y: number }[] = []
    const order = this.field.clusters
      .map((_, index) => index)
      .sort((a, b) => {
        if (a === frame.active) return -1
        if (b === frame.active) return 1
        return this.field.clusters[b].count - this.field.clusters[a].count
      })
    const visible = new Set<number>()
    for (const index of order) {
      const cluster = this.field.clusters[index]
      if (
        !occupied.some(
          (point) =>
            Math.abs(point.y - cluster.y) < 22 &&
            Math.abs(point.x - cluster.x) < 36
        )
      ) {
        occupied.push(cluster)
        visible.add(index)
      }
    }
    this.field.clusters.forEach((cluster, index) => {
      const label = this.labels[index]
      if (!label) return
      const edge = clamp(cluster.x / (width * 0.16))
      const behind =
        cluster.worldY <= 0 && this.markOccludes(cluster.x, cluster.y) ? 0.1 : 1
      const target =
        visible.has(index) &&
        cluster.x > -40 &&
        cluster.x < width + 40 &&
        cluster.y > -40 &&
        cluster.y < height + 40
          ? clamp(this.copyClearance(cluster.x, cluster.y) / 40) *
            (geometry.wide ? edge ** 2 * (3 - edge * 2) : 1) *
            behind *
            (frame.active !== null && frame.active !== index ? 0.75 : 1) *
            labsAlpha
          : 0
      const old = this.labelOpacity[index] ?? 0
      const alpha =
        frame.reduced || frame.paused || Math.abs(target - old) < 0.01
          ? target
          : old + (target - old) * Math.min(1, dt * 12)
      this.labelOpacity[index] = alpha
      label.style.opacity = String(alpha)
      label.style.zIndex = cluster.worldY > 0 ? '2' : '0'
      label.style.transform = `translate(${Math.round(cluster.x * 2) / 2}px,${Math.round(cluster.y * 2) / 2}px) translate(-50%,-50%)`
      label.tabIndex = alpha > 0.4 ? 0 : -1
      if (this.selectableLabs) {
        label.style.pointerEvents = alpha > 0.4 ? 'auto' : 'none'
      }
    })
    if (frame.popoverPoint) {
      const point = frame.popoverPoint,
        cluster = this.field.clusters[point.cluster]
      let x = point.x,
        y = point.y,
        bottom = point.y
      if (zoom <= geometry.baseZoom * 1.3) {
        x = cluster.x
        y = cluster.y - 16
        bottom = cluster.y + 16
        for (const item of this.field.points) {
          if (item.cluster === point.cluster) {
            y = Math.min(y, item.y - item.size * 2)
            bottom = Math.max(bottom, item.y + item.size * 2)
          }
        }
      }
      const easing =
        this.tooltipPosition.fresh || frame.reduced ? 1 : 1 - 0.0001 ** dt
      this.tooltipPosition.x += (x - this.tooltipPosition.x) * easing
      this.tooltipPosition.y += (y - this.tooltipPosition.y) * easing
      this.tooltipPosition.fresh = false
      this.anchor.style.transform = `translate(${this.tooltipPosition.x}px,${this.tooltipPosition.y}px)`
      this.anchor.style.height = `${bottom - y}px`
    } else this.tooltipPosition.fresh = true
  }
}
