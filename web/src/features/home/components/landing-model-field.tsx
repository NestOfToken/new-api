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
import { Shapes } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { LandingProvider } from '../hooks/use-landing-catalog'
import type { ModelCoreRenderer } from '../lib/model-core-renderer'
import {
  projectModelOrbit,
  projectModelPosition,
  providerOrbits,
} from '../lib/model-orbit'

interface ModelFieldProps {
  providers: LandingProvider[]
  locale: string | undefined
  paused: boolean
  selected: string | null
  onSelect: (id: string) => void
}

export function LandingModelField(props: ModelFieldProps) {
  const { t } = useTranslation()
  const field = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const foreground = useRef<HTMLCanvasElement>(null)
  const core = useRef<HTMLDivElement>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const hovered = useRef<string | null>(null)
  const phase = useRef(0)
  const redraw = useRef<() => void>(() => {})
  const settings = useRef({ paused: props.paused, selected: props.selected })

  useEffect(() => {
    settings.current = { paused: props.paused, selected: props.selected }
    field.current?.dispatchEvent(new Event('fieldstatechange'))
  }, [props.paused, props.selected])

  useEffect(() => {
    const surface = field.current
    const back = canvas.current
    const front = foreground.current
    const center = core.current
    if (
      !surface ||
      !back ||
      !front ||
      !center ||
      typeof CanvasRenderingContext2D === 'undefined' ||
      typeof ResizeObserver === 'undefined' ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return
    }
    const context = back.getContext('2d')
    const frontContext = front.getContext('2d')
    if (!context || !frontContext) return
    const controls = surface.querySelectorAll<HTMLElement>('.lf-field-provider')
    const modelElements =
      surface.querySelectorAll<HTMLElement>('.lf-field-model')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const camera = { x: 0, y: 0 }
    let visible = false
    let frame = 0
    let width = surface.clientWidth
    let height = surface.clientHeight
    let safeLeft = 24
    let safeRight = width - 24
    let textRight = width * 0.44
    let previous = performance.now()
    let disposed = false
    let loading = false
    let metal: ModelCoreRenderer | undefined

    const draw = (time: number) => {
      const playing =
        visible &&
        !document.hidden &&
        !settings.current.paused &&
        !reduced.matches
      const elapsed = Math.min(Math.max(time - previous, 0), 40)
      if (playing) {
        phase.current += elapsed * 0.00011
        const easing = 1 - Math.exp(-elapsed / 460)
        camera.x += (pointer.current.x - camera.x) * easing
        camera.y += (pointer.current.y - camera.y) * easing
      }
      previous = time
      context.clearRect(0, 0, width, height)
      frontContext.clearRect(0, 0, width, height)
      const compact = width < 700
      const extent = compact ? width * 1.35 : width
      const clusterExtent = compact ? width * 1.06 : width
      const clusterScale = compact ? 0.65 : Math.min(1, width / 1200)
      const dark = document.documentElement.classList.contains('dark')
      const ink = dark ? '185,181,207' : '110,114,132'
      surface.dataset.focused = hovered.current ?? ''
      const radii = [0.135, 0.22, 0.29, 0.36, 0.415, 0.475, 0.54]
      for (let ring = 0; ring < radii.length; ring++) {
        const radius = extent * radii[ring]
        context.beginPath()
        for (let step = 0; step <= 144; step++) {
          const theta = (step / 144) * Math.PI * 2
          const elevation =
            Math.cos(theta) * ((ring % 3) - 1) * radius * 0.075 + ring * 2
          const point = projectModelOrbit(
            width,
            height,
            radius,
            theta,
            camera,
            elevation
          )
          if (!step) context.moveTo(point.x, point.y)
          else context.lineTo(point.x, point.y)
        }
        context.strokeStyle = `rgba(${ink},${0.19 - ring * 0.014})`
        context.lineWidth = 0.8
        context.stroke()
        // Widely spaced, uncounted motes describe the receding outer planes.
        for (let mote = 0; mote < 5; mote++) {
          const theta = mote * 2.39996 + ring * 0.7 + phase.current * 0.045
          const point = projectModelOrbit(
            width,
            height,
            radius,
            theta,
            camera,
            ring * 2
          )
          const layer = point.depth > 0 ? frontContext : context
          layer.beginPath()
          layer.arc(
            point.x,
            point.y,
            Math.min(2, point.scale) * 1.2,
            0,
            Math.PI * 2
          )
          layer.fillStyle = `rgba(${ink},${Math.min(0.32, point.scale * 0.15)})`
          layer.fill()
        }
      }
      let modelCursor = 0
      props.providers
        .slice(0, providerOrbits.length)
        .forEach((provider, group) => {
          const orbit = providerOrbits[group]
          const angle = orbit.angle + phase.current * 0.026
          const worldX = Math.cos(angle) * clusterExtent * orbit.radius
          const worldZ = Math.sin(angle) * clusterExtent * orbit.radius
          const baseElevation =
            (compact ? [-52, -25, 25, 75, 26, -45] : [-38, -52, 8, 35, -8, 12])[
              group
            ] ?? 0
          const position = projectModelPosition(
            width,
            height,
            worldX,
            worldZ,
            baseElevation,
            camera
          )
          const x = Math.min(
            safeRight,
            Math.max(
              compact ? safeLeft : Math.max(safeLeft, textRight),
              position.x
            )
          )
          const y = Math.min(height - 36, Math.max(40, position.y))
          const shiftX = x - position.x
          const shiftY = y - position.y
          const active =
            hovered.current === provider.id ||
            settings.current.selected === provider.id
          const control = controls[group]
          if (control) {
            // The semantic hit region stays 44px. Only the visible mark recedes.
            control.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
            control.style.zIndex = position.depth > 0 ? '4' : '1'
            control.style.setProperty(
              '--lf-depth-scale',
              String(Math.min(1.25, Math.max(0.72, position.scale)))
            )
            control.style.setProperty(
              '--lf-node-blur',
              `${Math.max(0, 1 - position.scale) * 2}px`
            )
          }
          // Group topology follows its real catalog: short sparse branches for one
          // model; larger, inclined volumes for the seven/nine-model collections.
          const dustCount = Math.min(18, 4 + provider.models.length * 2)
          for (let dust = 0; dust < dustCount; dust++) {
            const theta = dust * 2.39996 + group * 1.2 + phase.current * 0.09
            const distance =
              (25 +
                Math.sqrt(dust / dustCount) *
                  (35 + provider.models.length * 8)) *
              clusterScale
            const point = projectModelPosition(
              width,
              height,
              worldX + Math.cos(theta) * distance,
              worldZ + Math.sin(theta) * distance * (0.65 + (group % 3) * 0.17),
              baseElevation + Math.sin(theta + group) * distance * 0.16,
              camera
            )
            const layer = point.depth > 0 ? frontContext : context
            layer.beginPath()
            layer.moveTo(x, y)
            layer.lineTo(point.x + shiftX, point.y + shiftY)
            layer.strokeStyle = `rgba(${ink},${active ? 0.18 : 0.09})`
            layer.lineWidth = 0.65
            layer.stroke()
            layer.beginPath()
            layer.arc(
              point.x + shiftX,
              point.y + shiftY,
              (dust % 4 ? 1.1 : 2) * point.scale,
              0,
              Math.PI * 2
            )
            layer.fillStyle = `rgba(${ink},${Math.min(0.48, point.scale * 0.25)})`
            layer.fill()
          }
          provider.models
            .slice(0, Math.max(0, 48 - modelCursor))
            .forEach((_, index) => {
              const theta =
                index * 2.39996 +
                group * 0.8 +
                phase.current * (group % 2 ? 0.2 : -0.16)
              const distance = (42 + Math.sqrt(index) * 27) * clusterScale
              const roaming = index % 3 === 2
              const roamingRadius = extent * (0.24 + (index % 4) * 0.035)
              const modelX = roaming
                ? Math.cos(theta + group * 0.7) * roamingRadius
                : worldX + Math.cos(theta) * distance
              const modelZ = roaming
                ? Math.sin(theta + group * 0.7) * roamingRadius
                : worldZ +
                  Math.sin(theta) * distance * (0.85 + (group % 3) * 0.2)
              const elevation =
                baseElevation + Math.cos(theta + group * 0.7) * distance * 0.25
              const point = projectModelPosition(
                width,
                height,
                modelX,
                modelZ,
                elevation,
                camera
              )
              const px = point.x + shiftX
              const py = point.y + shiftY
              const layer = point.depth > 0 ? frontContext : context
              // Split connections where they cross the core plane, so occlusion is real.
              if (position.depth * point.depth < 0) {
                const fraction =
                  Math.abs(position.depth) /
                  (Math.abs(position.depth) + Math.abs(point.depth))
                const crossing = projectModelPosition(
                  width,
                  height,
                  worldX + (modelX - worldX) * fraction,
                  worldZ + (modelZ - worldZ) * fraction,
                  baseElevation + (elevation - baseElevation) * fraction,
                  camera
                )
                const startLayer = position.depth > 0 ? frontContext : context
                startLayer.beginPath()
                startLayer.moveTo(x, y)
                startLayer.lineTo(crossing.x + shiftX, crossing.y + shiftY)
                startLayer.strokeStyle = `rgba(${ink},${active ? 0.5 : 0.22})`
                startLayer.lineWidth = 0.8
                startLayer.stroke()
                layer.beginPath()
                layer.moveTo(crossing.x + shiftX, crossing.y + shiftY)
              } else {
                layer.beginPath()
                layer.moveTo(x, y)
              }
              layer.lineTo(px, py)
              layer.strokeStyle = `rgba(${ink},${active ? 0.5 : 0.22})`
              layer.lineWidth = 0.8
              layer.stroke()
              if (roaming) {
                for (let mote = 0; mote < 4; mote++) {
                  const direction = mote * 2.39996 + theta
                  const reach = 12 + mote * 5
                  layer.beginPath()
                  layer.moveTo(px, py)
                  layer.lineTo(
                    px + Math.cos(direction) * reach * point.scale,
                    py + Math.sin(direction) * reach * point.scale * 0.6
                  )
                  layer.strokeStyle = `rgba(${ink},.12)`
                  layer.stroke()
                  layer.beginPath()
                  layer.arc(
                    px + Math.cos(direction) * reach * point.scale,
                    py + Math.sin(direction) * reach * point.scale * 0.6,
                    1.6 * point.scale,
                    0,
                    Math.PI * 2
                  )
                  layer.fillStyle = `rgba(${ink},.4)`
                  layer.fill()
                }
              }
              const element = modelElements[modelCursor++]
              if (element) {
                element.style.transform = `translate3d(${px}px,${py}px,0) translate(-50%,-50%) scale(${Math.min(1.6, Math.max(0.6, point.scale))})`
                element.style.zIndex = point.depth > 0 ? '4' : '1'
                element.style.opacity = String(
                  active ? 1 : Math.min(0.9, 0.45 + point.scale * 0.25)
                )
                element.style.filter = `blur(${Math.max(0, 1 - point.scale) * 3}px)`
              }
              const pulse =
                (phase.current * 0.8 + index * 0.37 + group * 0.17) % 1
              if (active || pulse < 0.42) {
                layer.beginPath()
                layer.arc(
                  px,
                  py,
                  (active ? 12 : 9 + pulse * 22) * point.scale,
                  0,
                  Math.PI * 2
                )
                layer.strokeStyle = `rgba(143,103,215,${active ? 0.55 : (1 - pulse / 0.42) * 0.4})`
                layer.lineWidth = 1
                layer.stroke()
              }
            })
        })
      metal?.render(phase.current, camera)
      surface.dataset.playing = String(playing)
      if (playing) frame = requestAnimationFrame(draw)
    }
    const update = () => {
      cancelAnimationFrame(frame)
      previous = performance.now()
      draw(previous)
    }
    redraw.current = update
    const resize = new ResizeObserver(() => {
      width = surface.clientWidth
      height = surface.clientHeight
      const bounds = surface.getBoundingClientRect()
      safeLeft = Math.max(24, 24 - bounds.left)
      safeRight = Math.min(width - 24, window.innerWidth - bounds.left - 24)
      const intro = surface.parentElement?.querySelector('.lf-platform-intro')
      textRight = intro
        ? intro.getBoundingClientRect().right - bounds.left + 24
        : width * 0.44
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      for (const [element, drawing] of [
        [back, context],
        [front, frontContext],
      ] as const) {
        element.width = width * ratio
        element.height = height * ratio
        drawing.setTransform(ratio, 0, 0, ratio, 0, 0)
      }
      metal?.resize(center.clientWidth)
      update()
    })
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      update()
      if (!visible || loading || typeof WebGLRenderingContext === 'undefined') {
        return
      }
      loading = true
      void import('../lib/model-core-renderer')
        .then(({ createModelCoreRenderer }) => {
          if (disposed) return
          try {
            metal = createModelCoreRenderer(center)
            metal.resize(center.clientWidth)
            update()
          } catch {
            // The static, accessible brand silhouette remains when WebGL is unavailable.
            center.querySelector('canvas')?.remove()
            delete center.dataset.rendered
          }
        })
        .catch(() => {
          /* Keep the static fallback if the optional renderer cannot load. */
        })
    })
    const lost = (event: Event) => {
      event.preventDefault()
      metal?.dispose()
      metal = undefined
      delete center.dataset.rendered
    }
    center.addEventListener('webglcontextlost', lost, true)
    resize.observe(surface)
    intersection.observe(surface)
    document.addEventListener('visibilitychange', update)
    reduced.addEventListener('change', update)
    surface.addEventListener('fieldstatechange', update)
    return () => {
      disposed = true
      redraw.current = () => {}
      cancelAnimationFrame(frame)
      metal?.dispose()
      resize.disconnect()
      intersection.disconnect()
      center.removeEventListener('webglcontextlost', lost, true)
      document.removeEventListener('visibilitychange', update)
      reduced.removeEventListener('change', update)
      surface.removeEventListener('fieldstatechange', update)
    }
  }, [props.providers])

  return (
    <div
      className='lf-model-field'
      ref={field}
      data-playing='false'
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        pointer.current = {
          x: ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          y: ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
        }
      }}
      onPointerLeave={() => {
        pointer.current = { x: 0, y: 0 }
        hovered.current = null
        redraw.current()
      }}
    >
      <canvas className='lf-orbit-background' ref={canvas} aria-hidden='true' />
      <div className='lf-model-core' ref={core} aria-hidden='true'>
        <svg viewBox='0 0 64 64' className='lf-core-fallback'>
          <path
            d='M16 16v32h32M26 38l22-22M32 16h16v16'
            fill='none'
            stroke='currentColor'
            strokeWidth='5'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      </div>
      <canvas
        className='lf-orbit-foreground'
        ref={foreground}
        aria-hidden='true'
      />
      <div
        className='lf-field-providers'
        role='group'
        aria-label={t('Explore model providers')}
      >
        <div aria-hidden='true' className='lf-field-models'>
          {props.providers
            .slice(0, providerOrbits.length)
            .flatMap((provider) =>
              provider.models.map((model) => ({ provider, model }))
            )
            .slice(0, 48)
            .map(({ provider, model }) => (
              <span
                key={`${provider.id}-${model.model_name}`}
                className='lf-field-model'
                data-provider={provider.id}
                title={model.model_name}
              >
                {provider.id === 'other' ? (
                  <Shapes size={13} />
                ) : (
                  getLobeIcon(provider.icon || provider.name, 14)
                )}
              </span>
            ))}
        </div>
        <TooltipProvider delay={80}>
          {props.providers
            .slice(0, providerOrbits.length)
            .map((provider, index) => (
              <Tooltip key={provider.id}>
                <TooltipTrigger
                  render={
                    <Button
                      variant='ghost'
                      className='lf-field-provider'
                      style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${50 + Math.cos(providerOrbits[index].angle) * 35}vw,${170 + Math.sin(providerOrbits[index].angle) * 80}px)`,
                      }}
                      aria-label={
                        provider.id === 'other'
                          ? t('Other models')
                          : t('Explore {{provider}} models', {
                              provider: provider.name,
                            })
                      }
                      aria-pressed={props.selected === provider.id}
                      onClick={() => props.onSelect(provider.id)}
                      onPointerEnter={() => {
                        hovered.current = provider.id
                        redraw.current()
                      }}
                      onPointerLeave={() => {
                        hovered.current = null
                        redraw.current()
                      }}
                      onFocus={() => {
                        hovered.current = provider.id
                        redraw.current()
                      }}
                      onBlur={() => {
                        hovered.current = null
                        redraw.current()
                      }}
                    >
                      <span className='lf-field-logo'>
                        {provider.id === 'other' ? (
                          <Shapes size={18} aria-hidden='true' />
                        ) : (
                          getLobeIcon(provider.icon || provider.name, 20)
                        )}
                      </span>
                    </Button>
                  }
                />
                <TooltipContent>
                  {provider.name}
                  <span className='tabular-nums opacity-70'>
                    {formatNumber(provider.models.length, props.locale)}
                  </span>
                </TooltipContent>
              </Tooltip>
            ))}
        </TooltipProvider>
      </div>
    </div>
  )
}
