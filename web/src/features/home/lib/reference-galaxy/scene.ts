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
  clamp,
  type createGalaxyField,
  easeInOut,
  GALAXY_DARK,
  GALAXY_LIGHT,
  galaxyViewport,
  type GalaxyPoint,
} from './layout'
import type { GalaxyMark, GalaxyMarkShape } from './mark'
import { GalaxyPainter } from './painter'

interface Position {
  x: number
  y: number
}
interface GalaxySceneOptions {
  wrap: HTMLElement
  canvas: HTMLCanvasElement
  front: HTMLCanvasElement
  mark: HTMLElement
  labels: HTMLElement[]
  anchor: HTMLElement
  copy: HTMLElement | null
  field: ReturnType<typeof createGalaxyField>
  onHover: (point: GalaxyPoint | null) => void
  markShape?: GalaxyMarkShape
  onInspectLab?: (key: string) => void
  palette?: { light: typeof GALAXY_LIGHT; dark: typeof GALAXY_DARK }
}

export class ReferenceGalaxyScene {
  field: ReturnType<typeof createGalaxyField>
  private painter: GalaxyPainter
  private options: GalaxySceneOptions
  private width = 0
  private height = 0
  private ratio = 1
  private disposed = false
  private visible = false
  private paused = false
  private request = 0
  private previous = performance.now()
  private worldTime = 0
  private clock = 0
  private pointTime = 0
  private speed = 1
  private turn = 0
  private pointer: Position | null = null
  private pointerTarget = { x: 0, y: 0 }
  private tilt = { x: 0, y: 0 }
  private parallax = { x: 0, y: 0 }
  private face = { x: 0, y: 0 }
  private faceMotion = 0
  private spin = { x: 0, y: 0, vx: 0, vy: 0 }
  private coreDrag: Position | null = null
  private drag: (Position & { moved: number }) | null = null
  private touch = false
  private touchPoints = new Map<number, Position>()
  private pinch: {
    distance: number
    zoom: number
    worldX: number
    worldY: number
  } | null = null
  private lastTap: (Position & { time: number }) | null = null
  private heldInspect = false
  private inspectedLab: number | null = null
  private active: number | null = null
  private nearest: GalaxyPoint | null = null
  private lastPoint: GalaxyPoint | null = null
  private keyboardLab: number | null = null
  private published: GalaxyPoint | null = null
  private hoverOpen = false
  private latestInteraction = 0
  private view = { zoom: 1, x: 0, y: 0, targetZoom: 1, targetX: 0, targetY: 0 }
  private tween: {
    fromZoom: number
    fromX: number
    fromY: number
    zoom: number
    x: number
    y: number
    start: number
    duration: number
  } | null = null
  private mark: GalaxyMark | null = null
  private loadingMark = false
  private initializedSize = false
  private media = window.matchMedia('(prefers-reduced-motion: reduce)')
  private resize: ResizeObserver
  private intersection: IntersectionObserver
  private theme: MutationObserver
  private viewport: ReturnType<typeof galaxyViewport> | null = null
  private presenting = false
  private presentationFrame: ((now: number) => void) | null = null
  private visibilityTarget: HTMLElement

  constructor(options: GalaxySceneOptions) {
    this.options = options
    this.visibilityTarget = options.wrap
    this.field = options.field
    this.painter = new GalaxyPainter(
      options.canvas,
      options.front,
      this.field,
      options.labels,
      options.copy,
      options.mark,
      options.anchor
    )
    options.mark.dataset.state = 'loading'
    const canvas = options.canvas
    canvas.addEventListener('pointerdown', this.pointerDown)
    canvas.addEventListener('pointermove', this.pointerMove)
    canvas.addEventListener('pointerup', this.pointerUp)
    canvas.addEventListener('pointercancel', this.pointerUp)
    canvas.addEventListener('pointerleave', this.pointerLeave)
    canvas.addEventListener('wheel', this.wheel, { passive: false })
    canvas.addEventListener('dblclick', this.doubleClick)
    canvas.addEventListener('touchstart', this.touchStart, { passive: false })
    canvas.addEventListener('touchmove', this.touchMove, { passive: false })
    canvas.addEventListener('touchend', this.touchEnd)
    canvas.addEventListener('touchcancel', this.touchEnd)
    options.wrap.addEventListener('keydown', this.keyDown)
    options.mark.addEventListener('webglcontextlost', this.contextLost, true)
    document.addEventListener('visibilitychange', this.restart)
    document.addEventListener('pointerdown', this.outside)
    this.media.addEventListener('change', this.restart)
    this.resize = new ResizeObserver(this.measure)
    this.intersection = new IntersectionObserver((entries) => {
      const entry = entries.find(
        (item) => item.target === this.visibilityTarget
      )
      if (!entry) return
      const changed = this.visible !== entry.isIntersecting
      this.visible = entry.isIntersecting
      if (this.visible) this.loadMark()
      if (changed) this.restart()
    })
    this.theme = new MutationObserver(this.restart)
    this.theme.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    this.resize.observe(options.wrap)
    this.intersection.observe(options.wrap)
    this.measure()
    void document.fonts?.ready.then(() => {
      if (!this.disposed) {
        this.painter.measureCopy()
        this.restart()
      }
    })
  }

  setPaused(paused: boolean) {
    this.paused = paused
    this.restart()
  }
  private geometry() {
    return this.viewport ?? galaxyViewport(this.width, this.height)
  }
  setPresentation(active: boolean, frame?: (now: number) => void) {
    this.presenting = active
    this.presentationFrame = active ? (frame ?? null) : null
    // Camera travel uses the running scene clock, including between route slots.
    this.wake()
  }
  setViewport(viewport: ReturnType<typeof galaxyViewport>) {
    const previous = this.geometry()
    const zoomRatio = viewport.baseZoom / previous.baseZoom
    const panRatio =
      (viewport.radius / Math.max(previous.radius, 1)) * zoomRatio
    this.view.zoom *= zoomRatio
    this.view.targetZoom *= zoomRatio
    this.view.x *= panRatio
    this.view.targetX *= panRatio
    this.view.y *= panRatio
    this.view.targetY *= panRatio
    if (this.tween) {
      this.tween.fromZoom *= zoomRatio
      this.tween.zoom *= zoomRatio
      this.tween.fromX *= panRatio
      this.tween.x *= panRatio
      this.tween.fromY *= panRatio
      this.tween.y *= panRatio
    }
    this.viewport = viewport
    if (this.presenting) {
      // The scene paints once, after its presentation callback updates the camera.
      return
    }
    this.wake()
  }
  setCopy(copy: HTMLElement | null) {
    this.options.copy = copy
    this.painter.setCopy(copy)
  }
  setField(field: ReturnType<typeof createGalaxyField>, labels: HTMLElement[]) {
    this.field = field
    this.options.field = field
    this.options.labels = labels
    this.painter.setField(field, labels)
    this.active = null
    this.keyboardLab = null
    this.inspectedLab = null
    this.nearest = null
    this.lastPoint = null
    this.publish()
    this.wake()
  }
  setVisibilityTarget(target: HTMLElement) {
    if (target === this.visibilityTarget) return
    this.intersection.unobserve(this.visibilityTarget)
    this.visibilityTarget = target
    this.intersection.observe(target)
  }
  setInteractive(enabled: boolean) {
    if (enabled) return
    this.pointer = null
    this.pointerTarget = { x: 0, y: 0 }
    this.drag = null
    this.coreDrag = null
    this.pinch = null
    this.focusLab(null)
  }
  refreshLayout() {
    this.measure()
  }
  reset = () => {
    const g = this.geometry()
    this.animateView(g.baseZoom, 0, 0, 0.9)
    this.wake()
  }
  focusLab(index: number | null, modelOffset = 0) {
    this.keyboardLab = index
    this.active = index
    const models = this.field.points
      .filter((point) => point.cluster === index)
      .sort((a, b) => b.size - a.size)
    let selected = 0
    if (modelOffset && models.length) {
      const current = this.nearest ? models.indexOf(this.nearest) : 0
      selected =
        (Math.max(0, current) + modelOffset + models.length) % models.length
    }
    this.nearest = models[selected] ?? null
    if (this.nearest) this.lastPoint = this.nearest
    this.publish()
    this.wake()
  }
  inspectLab(index: number) {
    const cluster = this.field.clusters[index]
    if (!cluster) return
    this.options.onInspectLab?.(cluster.key)
    const g = this.geometry()
    this.inspectedLab = index
    this.animateView(
      6.5,
      (-(cluster.x - g.x - this.view.x) / this.view.zoom) * 6.5,
      (-(cluster.y - g.y - this.view.y) / this.view.zoom) * 6.5,
      1.1
    )
    this.wake()
  }

  private measure = () => {
    if (!this.options.wrap.clientWidth || !this.options.wrap.clientHeight) {
      return
    }
    const previousGeometry = this.geometry()
    this.width = this.options.wrap.clientWidth
    this.height = this.options.wrap.clientHeight
    this.ratio = Math.min(
      window.devicePixelRatio || 1,
      1.5,
      Math.sqrt(2_000_000 / (this.width * this.height))
    )
    for (const canvas of [this.options.canvas, this.options.front]) {
      const width = Math.round(this.width * this.ratio)
      const height = Math.round(this.height * this.ratio)
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      canvas.getContext('2d')?.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    }
    if (!this.initializedSize && this.width > 0) {
      this.initializedSize = true
      this.view.zoom = this.view.targetZoom = galaxyViewport(
        this.width,
        this.height
      ).baseZoom
    } else if (this.initializedSize && this.width > 0) {
      const geometry = this.geometry()
      if (geometry.baseZoom !== previousGeometry.baseZoom) {
        const zoomRatio = geometry.baseZoom / previousGeometry.baseZoom
        const panRatio = (geometry.radius / previousGeometry.radius) * zoomRatio
        this.view.zoom *= zoomRatio
        this.view.targetZoom *= zoomRatio
        this.view.x *= panRatio
        this.view.y *= panRatio
        this.view.targetX *= panRatio
        this.view.targetY *= panRatio
        if (this.tween) {
          this.tween.fromZoom *= zoomRatio
          this.tween.zoom *= zoomRatio
          this.tween.fromX *= panRatio
          this.tween.fromY *= panRatio
          this.tween.x *= panRatio
          this.tween.y *= panRatio
        }
      }
    }
    this.painter.measureCopy()
    this.restart()
  }

  private loadMark() {
    if (this.loadingMark || typeof WebGLRenderingContext === 'undefined') {
      if (!this.loadingMark) this.options.mark.dataset.state = 'fallback'
      return
    }
    this.loadingMark = true
    void import('./mark')
      .then(({ createGalaxyMark }) => {
        if (this.disposed) return
        try {
          this.mark = createGalaxyMark(this.options.markShape)
          this.options.mark.appendChild(this.mark.canvas)
          this.options.mark.dataset.state = 'rendered'
          this.restart()
        } catch {
          this.options.mark.dataset.state = 'fallback'
          this.restart()
        }
      })
      .catch(() => {
        if (!this.disposed) this.options.mark.dataset.state = 'fallback'
      })
  }

  private contextLost = (event: Event) => {
    event.preventDefault()
    const mark = this.mark
    this.mark = null
    this.options.mark.dataset.state = 'fallback'
    mark?.dispose()
    this.restart()
  }

  private autoplay() {
    return (
      this.visible && !document.hidden && !this.paused && !this.media.matches
    )
  }
  private zoomed() {
    return this.view.targetZoom > this.geometry().baseZoom * 1.02
  }
  private location(event: { clientX: number; clientY: number }) {
    const rect = this.options.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  private animateView(zoom: number, x: number, y: number, duration: number) {
    this.tween = {
      fromZoom: this.view.zoom,
      fromX: this.view.x,
      fromY: this.view.y,
      zoom,
      x,
      y,
      start: this.clock,
      duration: this.media.matches ? 0 : duration,
    }
  }
  private boundPan() {
    const g = this.geometry(),
      x = this.zoomed() ? this.view.targetZoom * g.radius : 0,
      y = x * 0.7
    this.view.targetX = clamp(this.view.targetX, -x, x)
    this.view.targetY = clamp(this.view.targetY, -y, y)
  }
  private zoomAt(factor: number, position: Position) {
    const g = this.geometry(),
      old = this.view.targetZoom
    const zoom = clamp(old * factor, g.baseZoom * 0.8, 8)
    this.view.targetX =
      position.x - g.x - ((position.x - g.x - this.view.targetX) / old) * zoom
    this.view.targetY =
      position.y - g.y - ((position.y - g.y - this.view.targetY) / old) * zoom
    this.view.targetZoom = zoom
    this.tween = null
    this.boundPan()
    this.touchAction()
  }
  private touchAction() {
    this.options.canvas.style.touchAction = this.zoomed() ? 'none' : 'pan-y'
  }
  private coreHit(position: Position) {
    if (!this.mark || !this.painter.markOccludes(position.x, position.y)) {
      return false
    }
    return !this.field.points.some(
      (point) =>
        this.field.clusters[point.cluster].worldY > 0 &&
        Math.hypot(point.x - position.x, point.y - position.y) <
          (this.touch ? 28 : 16)
    )
  }

  private hitTest() {
    if (this.keyboardLab !== null) return
    let nearest: GalaxyPoint | null = null
    const moved = !!this.drag && this.drag.moved > 4
    if (this.pointer && !moved && !this.coreDrag && !this.pinch) {
      let distance = this.touch ? 28 : 16
      for (const point of this.field.points) {
        if (
          clamp(this.painter.copyClearance(point.x, point.y) / 30) < 0.5 ||
          (this.field.clusters[point.cluster].worldY <= 0 &&
            this.mark &&
            this.painter.markOccludes(point.x, point.y))
        ) {
          continue
        }
        const delta = Math.hypot(
          point.x - this.pointer.x,
          point.y - this.pointer.y
        )
        if (delta < distance) {
          nearest = point
          distance = delta
        }
      }
    }
    let retained: number | null = null
    if (
      this.active !== null &&
      this.pointer &&
      !moved &&
      this.painter.copyClearance(this.pointer.x, this.pointer.y) >= 15
    ) {
      const cluster = this.field.clusters[this.active]
      if (
        ((this.pointer.x - cluster.x) / (cluster.rx + 16)) ** 2 +
          ((this.pointer.y - cluster.y) / (cluster.ry + 16)) ** 2 <=
        1
      ) {
        retained = this.active
      }
    }
    this.nearest = nearest
    this.active = nearest?.cluster ?? retained
    if (nearest) this.lastPoint = nearest
    this.publish()
    const grab =
      this.pointer &&
      (this.coreHit(this.pointer) ||
        (this.zoomed() &&
          this.painter.copyClearance(this.pointer.x, this.pointer.y) >= 15))
    let cursor = grab ? 'grab' : 'default'
    if (this.coreDrag || moved) cursor = 'grabbing'
    this.options.canvas.style.cursor = cursor
  }
  private publish() {
    const point = this.active === null ? null : this.lastPoint
    const open = point !== null
    if (
      point?.model.slug !== this.published?.model.slug ||
      open !== this.hoverOpen
    ) {
      this.published = point
      this.hoverOpen = open
      this.options.onHover(point)
    }
    this.options.wrap.dataset.focused =
      this.active === null ? '' : this.field.clusters[this.active].key
  }

  private pointerDown = (event: PointerEvent) => {
    this.keyboardLab = null
    this.touch = event.pointerType === 'touch'
    const position = this.location(event)
    this.touchPoints.set(event.pointerId, position)
    if (this.touchPoints.size >= 2) {
      this.drag = null
      return
    }
    if (!this.touch && event.button === 0 && this.active !== null) {
      this.heldInspect = true
      this.inspectLab(this.active)
      this.options.canvas.setPointerCapture(event.pointerId)
      return
    }
    if (this.coreHit(position)) {
      this.coreDrag = position
      this.spin.vx = this.spin.vy = 0
      this.options.canvas.setPointerCapture(event.pointerId)
      this.options.canvas.style.touchAction = 'none'
      this.wake()
      return
    }
    this.drag = { ...position, moved: 0 }
    this.pointer = position
    if (!this.touch) this.options.canvas.setPointerCapture(event.pointerId)
    this.hitTest()
    this.wake()
  }
  private pointerMove = (event: PointerEvent) => {
    this.keyboardLab = null
    this.touch = event.pointerType === 'touch'
    const position = this.location(event)
    if (this.touchPoints.has(event.pointerId)) {
      this.touchPoints.set(event.pointerId, position)
    }
    if (this.pinch || this.touchPoints.size >= 2) return
    if (this.coreDrag) {
      this.spin.y += (position.x - this.coreDrag.x) * 0.012
      this.spin.x += (position.y - this.coreDrag.y) * 0.012
      this.coreDrag = position
      this.pointer = position
      this.options.canvas.style.cursor = 'grabbing'
      this.wake()
      return
    }
    if (this.drag) {
      const dx = position.x - this.drag.x,
        dy = position.y - this.drag.y
      this.drag.moved += Math.abs(dx) + Math.abs(dy)
      this.drag.x = position.x
      this.drag.y = position.y
      if (this.zoomed()) {
        this.view.targetX += dx
        this.view.targetY += dy
        this.boundPan()
      } else if (!this.touch) this.turn += dx * 0.006
    }
    if (!this.touch || this.drag) {
      this.pointer = position
      this.pointerTarget = {
        x: (position.x / this.width - 0.5) * 2,
        y: (position.y / this.height - 0.5) * 2,
      }
      this.hitTest()
      this.wake()
    }
  }
  private pointerUp = (event: PointerEvent) => {
    this.touchPoints.delete(event.pointerId)
    if (this.heldInspect) {
      this.heldInspect = false
      this.reset()
      return
    }
    if (this.coreDrag) {
      this.coreDrag = null
      this.spin.x -= Math.round(this.spin.x / (Math.PI * 2)) * Math.PI * 2
      this.spin.y -= Math.round(this.spin.y / (Math.PI * 2)) * Math.PI * 2
      if (this.media.matches) this.spin.x = this.spin.y = 0
      this.touchAction()
      this.hitTest()
      this.wake()
      return
    }
    const moved = !!this.drag && this.drag.moved > 4
    this.drag = null
    const position = this.location(event)
    if (!moved && !this.media.matches && !this.paused) {
      this.painter.atmosphere.puff(position.x, position.y)
    }
    if (!moved && this.touch && !this.pinch) {
      const now = performance.now()
      if (
        this.lastTap &&
        now - this.lastTap.time < 320 &&
        Math.hypot(position.x - this.lastTap.x, position.y - this.lastTap.y) <
          32
      ) {
        if (this.zoomed()) this.reset()
        else this.zoomAt(2, position)
        this.lastTap = null
      } else this.lastTap = { ...position, time: now }
    }
    this.touchAction()
    this.hitTest()
    this.wake()
  }
  private pointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      this.pointer = null
      this.pointerTarget = { x: 0, y: 0 }
      this.hitTest()
      this.wake()
    }
  }
  private wheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    this.zoomAt(Math.exp(-0.01 * event.deltaY), this.location(event))
    this.wake()
  }
  private doubleClick = (event: MouseEvent) => {
    if (!this.touch) {
      this.zoomAt(2, this.location(event))
      this.wake()
    }
  }
  private touchStart = (event: TouchEvent) => {
    if (!event.cancelable) return
    const [first, second] = [event.touches[0], event.touches[1]]
    if (event.touches.length === 2 && first && second) {
      event.preventDefault()
      const a = this.location(first),
        b = this.location(second),
        g = this.geometry()
      this.pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: this.view.targetZoom,
        worldX:
          ((a.x + b.x) / 2 - g.x - this.view.targetX) / this.view.targetZoom,
        worldY:
          ((a.y + b.y) / 2 - g.y - this.view.targetY) / this.view.targetZoom,
      }
      this.drag = null
      this.coreDrag = null
      this.pointer = null
      this.hitTest()
      this.wake()
    } else if (
      first &&
      event.touches.length === 1 &&
      this.coreHit(this.location(first))
    ) {
      event.preventDefault()
    }
  }
  private touchMove = (event: TouchEvent) => {
    const [first, second] = [event.touches[0], event.touches[1]]
    if (
      !event.cancelable ||
      !this.pinch ||
      event.touches.length !== 2 ||
      !first ||
      !second
    ) {
      return
    }
    event.preventDefault()
    const a = this.location(first),
      b = this.location(second),
      g = this.geometry()
    this.view.targetZoom = clamp(
      (this.pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
        this.pinch.distance,
      g.baseZoom * 0.8,
      8
    )
    this.view.targetX =
      (a.x + b.x) / 2 - g.x - this.pinch.worldX * this.view.targetZoom
    this.view.targetY =
      (a.y + b.y) / 2 - g.y - this.pinch.worldY * this.view.targetZoom
    this.boundPan()
    this.wake()
  }
  private touchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      if (this.pinch) this.lastTap = null
      this.pinch = null
      this.touchAction()
      this.wake()
    }
  }
  private outside = (event: PointerEvent) => {
    if (
      event.target instanceof Node &&
      !this.options.wrap.contains(event.target)
    ) {
      this.pointer = null
      this.keyboardLab = null
      this.hitTest()
      this.wake()
    }
  }
  private keyDown = (event: KeyboardEvent) => {
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [64, 0],
      ArrowRight: [-64, 0],
      ArrowUp: [0, 64],
      ArrowDown: [0, -64],
    }
    const pan = arrows[event.key]
    if (pan && event.shiftKey && this.zoomed()) {
      event.preventDefault()
      this.tween = null
      this.view.targetX += pan[0]
      this.view.targetY += pan[1]
      this.boundPan()
      this.wake()
      return
    }
    if (
      this.keyboardLab !== null &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      event.preventDefault()
      this.focusLab(this.keyboardLab, event.key === 'ArrowLeft' ? -1 : 1)
      return
    }
    if (event.key === 'Escape' || event.key === 'Home') {
      event.preventDefault()
      this.reset()
    }
    if (event.key === '+' || event.key === '=' || event.key === '-') {
      event.preventDefault()
      const g = this.geometry()
      this.zoomAt(event.key === '-' ? 0.8 : 1.25, g)
      this.wake()
    }
  }
  private wake() {
    this.latestInteraction = performance.now()
    if (
      !this.presenting &&
      this.visible &&
      !document.hidden &&
      !this.autoplay()
    ) {
      this.draw(0)
    }
    if (!this.request && !this.disposed && this.visible && !document.hidden) {
      this.previous = performance.now()
      this.request = requestAnimationFrame(this.tick)
    }
  }

  private restart = () => {
    if (this.presenting && !this.disposed) {
      this.options.wrap.dataset.playing = String(this.autoplay())
      this.wake()
      return
    }
    cancelAnimationFrame(this.request)
    this.request = 0
    if (this.disposed) return
    this.previous = performance.now()
    this.latestInteraction = this.previous
    if (this.visible && !document.hidden) {
      this.draw(0)
      this.request = requestAnimationFrame(this.tick)
    } else this.options.wrap.dataset.playing = 'false'
  }
  private tick = (now: number) => {
    if (this.disposed || !this.visible || document.hidden) {
      this.request = 0
      return
    }
    // Keep the current request owned until presentation updates finish: settling
    // or interrupting a route must not schedule a second loop or reset its clock.
    this.presentationFrame?.(now)
    const active =
      now - this.latestInteraction < 1000 ||
      this.drag ||
      this.coreDrag ||
      this.pinch ||
      this.tween ||
      Math.abs(this.view.targetZoom - this.view.zoom) > 0.001 ||
      Math.abs(this.view.targetX - this.view.x) > 0.01 ||
      Math.abs(this.view.targetY - this.view.y) > 0.01
    const dt = Math.max(0, Math.min((now - this.previous) / 1000, 0.05))
    this.previous = now
    this.draw(dt)
    const motion =
      Math.abs(this.spin.x) +
      Math.abs(this.spin.y) +
      Math.abs(this.spin.vx) +
      Math.abs(this.spin.vy) +
      this.faceMotion
    this.request = 0
    if (
      this.presenting ||
      this.autoplay() ||
      active ||
      (!this.media.matches && motion > 0.002)
    ) {
      this.request = requestAnimationFrame(this.tick)
    }
  }
  private draw(dt: number) {
    if (!this.width || !this.height) return
    this.clock += dt
    const autoplay = this.autoplay()
    if (autoplay) this.worldTime += dt
    this.hitTest()
    const g = this.geometry(),
      easing = this.media.matches ? 1 : 1 - 0.001 ** dt
    this.view.zoom += (this.view.targetZoom - this.view.zoom) * easing
    this.view.x += (this.view.targetX - this.view.x) * easing
    this.view.y += (this.view.targetY - this.view.y) * easing
    if (this.tween) {
      const progress = this.tween.duration
          ? clamp((this.clock - this.tween.start) / this.tween.duration)
          : 1,
        eased = easeInOut(progress)
      this.view.zoom =
        this.tween.fromZoom + (this.tween.zoom - this.tween.fromZoom) * eased
      this.view.x = this.tween.fromX + (this.tween.x - this.tween.fromX) * eased
      this.view.y = this.tween.fromY + (this.tween.y - this.tween.fromY) * eased
      this.view.targetZoom = this.view.zoom
      this.view.targetX = this.view.x
      this.view.targetY = this.view.y
      if (progress >= 1 && !this.heldInspect) {
        this.tween = null
        if (this.view.zoom <= g.baseZoom * 1.05) this.inspectedLab = null
      }
    }
    const halted =
      !autoplay || this.view.zoom > 1.05 * g.baseZoom || this.drag || this.pinch
    let targetSpeed = this.active === null ? 1 : 0.95
    if (halted) targetSpeed = 0
    this.speed =
      Math.abs(targetSpeed - this.speed) < 0.005
        ? targetSpeed
        : this.speed + (targetSpeed - this.speed) * Math.min(1, dt * 2)
    if (!autoplay) this.speed = 0
    if (this.active === null) {
      this.tilt.x += (this.pointerTarget.x * this.speed - this.tilt.x) * 0.04
      this.tilt.y += (this.pointerTarget.y * this.speed - this.tilt.y) * 0.04
      const amount = this.view.zoom < g.baseZoom * 1.3 ? 1 : 0.4,
        allowed = this.drag || this.pinch || this.media.matches ? 0 : amount
      this.parallax.x +=
        (this.pointerTarget.x * allowed - this.parallax.x) * 0.05
      this.parallax.y +=
        (this.pointerTarget.y * allowed - this.parallax.y) * 0.05
    }
    let targetX = 0,
      targetY = 0
    if (this.pointer && !this.drag && !this.coreDrag && !this.media.matches) {
      const dx = this.pointer.x - this.painter.core.x,
        dy = this.pointer.y - this.painter.core.y,
        distance = Math.hypot(dx, dy) || 1
      const range = clamp((distance - this.width * 0.1) / (this.width * 0.4)),
        response =
          Math.min(1, distance / 32) * (1 - range ** 2 * (3 - range * 2))
      targetX = (dx / distance) * response
      targetY = (dy / distance) * response
    }
    this.face.x += (targetX - this.face.x) * Math.min(1, dt * 4)
    this.face.y += (targetY - this.face.y) * Math.min(1, dt * 4)
    this.faceMotion =
      Math.abs(targetX - this.face.x) + Math.abs(targetY - this.face.y)
    if (!this.coreDrag && !this.media.matches) {
      this.spin.vx += (-60 * this.spin.x - 11 * this.spin.vx) * dt
      this.spin.vy += (-60 * this.spin.y - 11 * this.spin.vy) * dt
      this.spin.x += this.spin.vx * dt
      this.spin.y += this.spin.vy * dt
    }
    this.pointTime += dt * this.speed * 0.6
    this.painter.paint(
      {
        width: this.width,
        geometry: this.geometry(),
        height: this.height,
        ratio: this.ratio,
        dt,
        time: this.worldTime,
        zoom: this.view.zoom,
        panX: this.view.x,
        panY: this.view.y,
        turn: this.turn,
        speed: this.speed,
        pointTime: this.pointTime,
        pointer: this.pointer,
        parallaxX: this.parallax.x,
        parallaxY: this.parallax.y,
        tiltX: this.tilt.x,
        tiltY: this.tilt.y,
        faceX: this.face.x,
        faceY: this.face.y,
        spinX: this.spin.x,
        spinY: this.spin.y,
        active: this.active,
        inspectedLab: this.inspectedLab,
        nearest: this.nearest,
        popoverPoint: this.active !== null ? this.lastPoint : null,
        reduced: this.media.matches,
        paused: this.paused,
        dragging: !!this.drag || !!this.pinch || !!this.coreDrag,
        palette: document.documentElement.classList.contains('dark')
          ? (this.options.palette?.dark ?? GALAXY_DARK)
          : (this.options.palette?.light ?? GALAXY_LIGHT),
      },
      this.mark
    )
    this.options.wrap.dataset.ready = 'true'
    this.options.wrap.dataset.playing = String(autoplay)
    this.options.wrap.dataset.zoom = this.view.zoom.toFixed(3)
    this.options.wrap.dataset.spin = `${this.spin.x.toFixed(3)},${this.spin.y.toFixed(3)}`
  }

  dispose() {
    this.disposed = true
    this.presentationFrame = null
    cancelAnimationFrame(this.request)
    this.mark?.dispose()
    this.mark = null
    this.resize.disconnect()
    this.intersection.disconnect()
    this.theme.disconnect()
    document.removeEventListener('visibilitychange', this.restart)
    document.removeEventListener('pointerdown', this.outside)
    this.media.removeEventListener('change', this.restart)
    const canvas = this.options.canvas
    canvas.removeEventListener('pointerdown', this.pointerDown)
    canvas.removeEventListener('pointermove', this.pointerMove)
    canvas.removeEventListener('pointerup', this.pointerUp)
    canvas.removeEventListener('pointercancel', this.pointerUp)
    canvas.removeEventListener('pointerleave', this.pointerLeave)
    canvas.removeEventListener('wheel', this.wheel)
    canvas.removeEventListener('dblclick', this.doubleClick)
    canvas.removeEventListener('touchstart', this.touchStart)
    canvas.removeEventListener('touchmove', this.touchMove)
    canvas.removeEventListener('touchend', this.touchEnd)
    canvas.removeEventListener('touchcancel', this.touchEnd)
    this.options.wrap.removeEventListener('keydown', this.keyDown)
    this.options.mark.removeEventListener(
      'webglcontextlost',
      this.contextLost,
      true
    )
  }
}
