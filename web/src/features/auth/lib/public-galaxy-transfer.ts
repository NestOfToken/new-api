/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { galaxyViewport } from '@/features/home/lib/reference-galaxy/layout'
import type { ReferenceGalaxyScene } from '@/features/home/lib/reference-galaxy/scene'

import { PUBLIC_GALAXY_TRAVEL_MS } from './public-auth-motion'

export type PublicGalaxyMode = 'home' | 'sign-in'
export interface PublicGalaxyAnchor {
  element: HTMLElement
  mode: PublicGalaxyMode
  inspect?: (key: string) => void
  disabled?: boolean
}
type Viewport = ReturnType<typeof galaxyViewport>
interface SkyPosition {
  geometry: Viewport
  clip: number[]
  sky: number[]
  mode: PublicGalaxyMode
  visible: boolean
}

// One external portal container, moved only between empty React-owned slots.
// Its renderer, WebGL context and simulation clock never leave the React tree.
export class PublicGalaxyTransfer {
  readonly host = document.createElement('div')
  private flight = document.createElement('div')
  private sky = document.createElement('div')
  private pane = document.createElement('div')
  private horizon = document.createElement('div')
  private formPanel: HTMLElement | null = null
  private formOrigin = { left: 0, top: 0 }
  private scene: ReferenceGalaxyScene | null = null
  private active: PublicGalaxyAnchor | null = null
  private source: SkyPosition | null = null
  private geometry: Viewport | null = null
  private currentClip: number[] = [0, 0, 0, 0]
  private currentSky: number[] = []
  private timeout = 0
  private resize: ResizeObserver | null = null
  private media = window.matchMedia('(prefers-reduced-motion: reduce)')

  constructor() {
    this.host.className = 'lf-public-galaxy-host'
    this.flight.className = 'lf-public-galaxy-flight'
    this.sky.className = 'lf-public-galaxy-sky'
    this.pane.className = 'lf-public-galaxy-pane'
    this.horizon.className = 'lf-ruiyuan-horizon lf-public-galaxy-horizon'
    this.flight.append(this.sky, this.horizon, this.pane)
    this.flight.setAttribute('aria-hidden', 'true')
    this.flight.inert = true
  }
  start() {
    window.addEventListener('resize', this.resizeViewport)
    this.media.addEventListener('change', this.reduceMotion)
  }
  stop() {
    window.removeEventListener('resize', this.resizeViewport)
    this.media.removeEventListener('change', this.reduceMotion)
    this.hide()
  }
  private size() {
    this.host.style.width = `${document.documentElement.clientWidth || window.innerWidth}px`
    this.host.style.height = `${window.innerHeight}px`
  }
  private position(anchor: PublicGalaxyAnchor, global: boolean): SkyPosition {
    const rect = anchor.element.getBoundingClientRect()
    const geometry = galaxyViewport(rect.width || 1, rect.height || 1)
    const left = global ? rect.left : 0
    const top = global ? rect.top : 0
    geometry.x += left
    geometry.y += top
    const art = anchor.element
      .closest('.lf-sign-in-art')
      ?.getBoundingClientRect()
    const opening =
      anchor.element.closest('.lf-ruiyuan-opening')?.getBoundingClientRect() ??
      rect
    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth
    const stacked = window.innerWidth <= 640
    return {
      geometry,
      mode: anchor.mode,
      visible: rect.bottom > 80 && rect.top < window.innerHeight,
      clip: [
        Math.max(0, rect.top),
        Math.max(0, rect.left),
        Math.min(viewportWidth, art?.right ?? rect.right),
        Math.max(0, Math.min(window.innerHeight, rect.bottom)),
        anchor.mode === 'home' ? 64 : rect.height * 0.12,
        rect.height * (anchor.mode === 'home' ? 0.22 : 0.25),
      ],
      // Paper slides over one full sky; it never feathers a dark rectangle.
      sky: [
        stacked ? 0 : Math.min(viewportWidth, art?.right ?? viewportWidth),
        stacked ? Math.max(0, art?.bottom ?? window.innerHeight) : 0,
        art ? window.innerHeight + 320 : opening.bottom + 24,
      ],
    }
  }
  private present(geometry: Viewport) {
    this.geometry = geometry
    this.host.style.setProperty('--lf-core-x', `${geometry.x}px`)
    this.host.style.setProperty('--lf-core-y', `${geometry.y}px`)
    this.host.style.setProperty('--lf-core-span', `${geometry.radius * 2}px`)
    this.scene?.setViewport(geometry)
  }
  private clip(bounds: number[]) {
    this.currentClip = bounds
    const [top, left, right, bottom, fadeTop, fadeBottom] = bounds
    const width = document.documentElement.clientWidth || window.innerWidth
    this.host.style.clipPath = `inset(${top}px ${Math.max(0, width - right)}px ${Math.max(0, window.innerHeight - bottom)}px ${left}px)`
    this.host.style.maskImage = `linear-gradient(to bottom, transparent ${top}px, #000 ${top + fadeTop}px, #000 ${Math.max(top + fadeTop, bottom - fadeBottom)}px, transparent ${bottom}px)`
  }
  private paintSky(bounds: number[]) {
    this.currentSky = bounds
    const [left, top, horizon] = bounds
    this.pane.style.transform = `translate3d(${left}px,${top}px,0)`
    this.horizon.style.transform = `translate3d(0,${horizon}px,0) rotate(-2deg)`
    if (this.formPanel) {
      this.formPanel.style.clipPath = `inset(${Math.max(0, top - this.formOrigin.top)}px 0 0 ${Math.max(0, left - this.formOrigin.left)}px)`
    }
  }
  setScene = (scene: ReferenceGalaxyScene | null) => {
    this.scene = scene
    if (!scene) return
    scene.setPresentation(this.flight.isConnected)
    if (this.geometry) scene.setViewport(this.geometry)
    if (this.active) {
      scene.setVisibilityTarget(this.active.element)
      scene.setInteractive(this.active.mode === 'home')
      scene.setCopy(this.copy())
    }
  }
  inspect = (key: string) => this.active?.inspect?.(key)
  private copy() {
    if (this.active?.mode !== 'home') return null
    return (
      this.active.element
        .closest('section')
        ?.querySelector<HTMLElement>('[data-hero-copy]') ?? null
    )
  }
  private syncSurfaceColors(anchor: PublicGalaxyAnchor) {
    const home = anchor.element.closest('.lf-home')
    if (home) {
      this.flight.style.setProperty(
        '--lf-paper',
        getComputedStyle(home).getPropertyValue('--lf-paper')
      )
    }
    const auth = anchor.element.closest('.lf-sign-in')
    if (auth) {
      this.pane.style.setProperty(
        '--lf-pane-paper',
        getComputedStyle(auth).getPropertyValue('--lf-auth-paper')
      )
    }
  }
  attach(anchor: PublicGalaxyAnchor) {
    window.clearTimeout(this.timeout)
    this.resize?.disconnect()
    this.active = anchor
    this.syncSurfaceColors(anchor)
    const auth = anchor.element.closest('.lf-sign-in')
    this.formPanel =
      auth?.querySelector<HTMLElement>('.lf-sign-in-panel') ?? null
    if (this.formPanel && auth) {
      const rect = this.formPanel.getBoundingClientRect()
      this.formOrigin = { left: rect.left, top: rect.top }
    }
    this.size()
    this.host.hidden = !!anchor.disabled
    this.host.dataset.mode = anchor.mode
    const source = this.source
    const target = this.position(anchor, true)
    const moving =
      source &&
      this.scene &&
      source.mode !== anchor.mode &&
      source.visible &&
      target.visible &&
      !document.hidden &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!moving) this.settle(anchor)
    else {
      this.host.inert = true
      this.host.setAttribute('aria-hidden', 'true')
      this.scene?.setInteractive(false)
      this.scene?.setCopy(null)
      this.flight.dataset.moving = 'true'
      if (!this.flight.isConnected) document.body.append(this.flight)
      this.flight.append(this.host)
      this.scene?.setVisibilityTarget(this.flight)
      const started = performance.now()
      const draw = (now: number) => {
        if (this.active !== anchor || !anchor.element.isConnected) return
        const end = this.position(anchor, true)
        if (!end.visible) {
          this.settle(anchor)
          return
        }
        // A frame timestamp can predate the route work that started this move.
        const progress = Math.max(
          0,
          Math.min(1, (now - started) / PUBLIC_GALAXY_TRAVEL_MS)
        )
        const amount = 1 - (1 - progress) ** 3
        const geometry = { ...end.geometry }
        for (const key of [
          'x',
          'y',
          'radius',
          'baseZoom',
          'inclination',
        ] as const) {
          geometry[key] =
            source.geometry[key] +
            (end.geometry[key] - source.geometry[key]) * amount
        }
        const clip = source.clip.map(
          (value, i) => value + (end.clip[i] - value) * amount
        )
        const sky = source.sky.map(
          (value, i) => value + (end.sky[i] - value) * amount
        )
        this.paintSky(sky)
        this.clip(clip)
        // The scene invokes this immediately before painting its next live frame.
        this.present(geometry)
        if (progress >= 1) this.settle(anchor)
      }
      this.scene?.setPresentation(true, draw)
    }
    this.resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (!this.flight.isConnected && this.active === anchor) {
              this.settle(anchor)
            }
          })
    this.resize?.observe(anchor.element)
    return () => this.release(anchor)
  }
  private settle(anchor: PublicGalaxyAnchor) {
    this.source = null
    if (!anchor.element.isConnected) return
    if (this.formPanel) this.formPanel.style.clipPath = ''
    anchor.element.append(this.host)
    this.host.style.clipPath = ''
    this.host.style.maskImage = ''
    this.flight.remove()
    delete this.flight.dataset.moving
    this.host.inert = anchor.mode !== 'home'
    this.host.setAttribute('aria-hidden', String(anchor.mode !== 'home'))
    this.present(this.position(anchor, false).geometry)
    this.scene?.setCopy(this.copy())
    this.scene?.setVisibilityTarget(anchor.element)
    this.scene?.setInteractive(anchor.mode === 'home')
    this.scene?.setPresentation(false)
  }
  private release(anchor: PublicGalaxyAnchor) {
    if (this.active !== anchor) return
    this.syncSurfaceColors(anchor)
    this.resize?.disconnect()
    const position = this.position(anchor, true)
    if (this.flight.isConnected && this.geometry) {
      position.geometry = this.geometry
      position.clip = this.currentClip
      position.sky = this.currentSky
    }
    this.source = position
    if (this.formPanel) this.formPanel.style.clipPath = ''
    this.formPanel = null
    this.active = null
    this.host.inert = true
    this.host.setAttribute('aria-hidden', 'true')
    this.scene?.setInteractive(false)
    this.scene?.setPresentation(true)
    this.scene?.setCopy(null)
    this.paintSky(position.sky)
    this.clip(position.clip)
    if (!this.flight.isConnected) document.body.append(this.flight)
    this.flight.append(this.host)
    this.present(position.geometry)
    this.scene?.setVisibilityTarget(this.flight)
    this.timeout = window.setTimeout(() => this.hide(), 1000)
  }
  private resizeViewport = () => {
    this.size()
    if (this.active) this.settle(this.active)
  }
  private reduceMotion = () => {
    if (this.media.matches && this.active) this.settle(this.active)
  }
  hide() {
    window.clearTimeout(this.timeout)
    this.resize?.disconnect()
    this.active = null
    this.source = null
    if (this.formPanel) this.formPanel.style.clipPath = ''
    this.formPanel = null
    this.host.remove()
    this.flight.remove()
    this.scene?.setPresentation(false)
  }
}
