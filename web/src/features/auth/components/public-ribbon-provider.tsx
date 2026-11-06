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
import { useRouter, useRouterState } from '@tanstack/react-router'
import { Pause, Play } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import '@/styles/lftech-home-ribbons.css'

import { isPublicAuthTransition } from '../lib/public-auth-motion'
import { PublicSurfaceTransition } from './public-surface-transition'
import { createRibbonRenderer, type RibbonBounds } from './ribbon-renderer'

const RibbonPlayback = createContext({ paused: false, toggle: () => {} })

export function RibbonPlaybackButton() {
  const { t } = useTranslation()
  const playback = useContext(RibbonPlayback)
  const label = playback.paused ? t('Resume animation') : t('Pause animation')
  return (
    <Button
      type='button'
      variant='ghost'
      className='lf-ribbon-playback'
      onClick={playback.toggle}
      aria-pressed={playback.paused}
      aria-label={label}
    >
      {playback.paused ? (
        <Play aria-hidden='true' />
      ) : (
        <Pause aria-hidden='true' />
      )}
      {label}
    </Button>
  )
}

export function PublicRibbonProvider(props: { children: ReactNode }) {
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<{ bounds: RibbonBounds; progress: number } | null>(
    null
  )
  const phaseRef = useRef(0)
  const rendererRef = useRef<ReturnType<typeof createRibbonRenderer> | null>(
    null
  )
  const homeScrollRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const wakeRef = useRef(() => {})
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    pausedRef.current = paused
    wakeRef.current()
  }, [paused])

  useEffect(() => {
    let sampling = 0
    const unsubscribe = router.subscribe(
      'onBeforeLoad',
      ({ fromLocation, toLocation }) => {
        cancelAnimationFrame(sampling)
        const anchor = document.querySelector<HTMLElement>(
          '[data-lf-ribbon-anchor]'
        )
        sourceRef.current = null
        if (
          !anchor ||
          !isPublicAuthTransition(fromLocation?.pathname, toLocation.pathname)
        ) {
          return
        }
        const fromHome = fromLocation?.pathname === '/'
        if (fromHome) homeScrollRef.current = window.scrollY
        // Keep the actual CSS animation's phase and position until the old surface
        // leaves the DOM, including time spent resolving the existing auth guard.
        const capture = () => {
          if (
            !anchor.isConnected ||
            !anchor.closest('[data-lf-public-surface]')
          ) {
            return
          }
          const bounds = anchor.getBoundingClientRect()
          if (fromHome) {
            const animation = anchor
              .querySelector('.lf-optical-track')
              ?.getAnimations()[0]
            if (typeof animation?.currentTime === 'number') {
              phaseRef.current = animation.currentTime / 1000
            }
          }
          sourceRef.current = {
            bounds: {
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
            },
            progress: fromHome ? 0 : 1,
          }
          if (fromHome) sampling = requestAnimationFrame(capture)
        }
        capture()
      }
    )
    const resolved = router.subscribe('onResolved', () =>
      cancelAnimationFrame(sampling)
    )
    return () => {
      unsubscribe()
      resolved()
      cancelAnimationFrame(sampling)
    }
  }, [router])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (pathname !== '/' && pathname !== '/sign-in') {
      canvas.hidden = true
      sourceRef.current = null
      return
    }
    let disposed = false
    let initializing = false
    let release = () => {}
    const initialize = () => {
      const anchor = document.querySelector<HTMLElement>(
        `[data-lf-public-surface='${pathname === '/sign-in' ? 'sign-in' : 'home'}'] [data-lf-ribbon-anchor]`
      )
      if (!anchor || initializing) return
      initializing = true
      mutations.disconnect()
      const source = sourceRef.current
      sourceRef.current = null
      const targetProgress = pathname === '/sign-in' ? 1 : 0
      if (targetProgress === 0 && source && homeScrollRef.current !== null) {
        // The custom-home query can finish after the router's first restoration pass.
        window.scrollTo({ top: homeScrollRef.current, behavior: 'instant' })
      }
      const context = canvas.getContext('2d')
      if (!context) return
      const drawRibbon = (rendererRef.current ??= createRibbonRenderer(
        context,
        getComputedStyle(canvas)
      ))
      if (targetProgress === 0 && !source) {
        canvas.hidden = true
        return
      }
      if (targetProgress === 0) {
        anchor.dataset.ribbonMorphing = 'true'
        const surface = anchor.closest<HTMLElement>('[data-lf-public-surface]')
        if (surface) surface.dataset.lfAuthReturn = 'true'
      }
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      )
      let targetBounds = anchor.getBoundingClientRect()
      const origin = source ?? {
        bounds: targetBounds,
        progress: targetProgress,
      }
      let started: number | null = null
      let lastFrame = performance.now()
      let frame = 0
      let visible = true
      let settled = !source || reducedMotion.matches
      let dirty = true
      let needsMeasure = true
      let width = window.innerWidth
      let height = window.innerHeight
      let opacity =
        getComputedStyle(canvas).getPropertyValue('--ribbon-opacity')
      const measure = () => {
        needsMeasure = true
        wake()
      }
      const measureBounds = () => {
        targetBounds = anchor.getBoundingClientRect()
        width = window.innerWidth
        height = window.innerHeight
        opacity = getComputedStyle(canvas).getPropertyValue('--ribbon-opacity')
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
        const pixelWidth = Math.round(width * ratio)
        const pixelHeight = Math.round(height * ratio)
        if (canvas.width !== pixelWidth) canvas.width = pixelWidth
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        needsMeasure = false
      }
      const draw = (now: number) => {
        frame = 0
        if (disposed || document.hidden) return
        if (needsMeasure) measureBounds()
        if (!started) started = now
        const fraction = reducedMotion.matches
          ? 1
          : Math.min(1, (now - started) / 850)
        const travel = settled ? 1 : 1 - Math.pow(1 - fraction, 4)
        const progress =
          origin.progress + (targetProgress - origin.progress) * travel
        settled = settled || fraction === 1
        if (settled && targetProgress === 0) {
          const animation = anchor
            .querySelector('.lf-optical-track')
            ?.getAnimations()[0]
          if (animation) animation.currentTime = phaseRef.current * 1000
          delete anchor.dataset.ribbonMorphing
          canvas.hidden = true
          release()
          return
        }
        if (settled && !visible) {
          canvas.hidden = true
          return
        }
        if (
          dirty ||
          !settled ||
          (!pausedRef.current && !reducedMotion.matches)
        ) {
          if (!pausedRef.current && !reducedMotion.matches && lastFrame) {
            phaseRef.current += Math.max((now - lastFrame) / 1000, 0)
          }
          lastFrame = now
          context.clearRect(0, 0, width, height)
          drawRibbon({
            from: origin.bounds,
            to: targetBounds,
            fromProgress: origin.progress,
            toProgress: targetProgress,
            progress,
            time: phaseRef.current,
            viewportWidth: width,
          })
          if (canvas.style.opacity !== opacity) canvas.style.opacity = opacity
          canvas.hidden = false
          if (anchor.dataset.ribbonReady !== 'true') {
            anchor.dataset.ribbonReady = 'true'
          }
          dirty = false
        }
        if (
          !settled ||
          (visible && !pausedRef.current && !reducedMotion.matches)
        ) {
          frame = requestAnimationFrame(draw)
        }
      }
      function wake() {
        dirty = true
        lastFrame = performance.now()
        if (!frame && !document.hidden) frame = requestAnimationFrame(draw)
      }
      const visibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(frame)
          frame = 0
        } else wake()
      }
      const resize = new ResizeObserver(measure)
      resize.observe(anchor)
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        if (visible) wake()
      })
      intersection.observe(anchor)
      const appearance = new MutationObserver(() => {
        opacity = getComputedStyle(canvas).getPropertyValue('--ribbon-opacity')
        wake()
      })
      appearance.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      wakeRef.current = wake
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, { passive: true })
      document.addEventListener('visibilitychange', visibility)
      reducedMotion.addEventListener('change', wake)
      measure()
      release = () => {
        cancelAnimationFrame(frame)
        resize.disconnect()
        intersection.disconnect()
        appearance.disconnect()
        window.removeEventListener('resize', measure)
        window.removeEventListener('scroll', measure)
        document.removeEventListener('visibilitychange', visibility)
        reducedMotion.removeEventListener('change', wake)
        // The outgoing page can remain visible through the route handoff.
        // Keep its fallback hidden once the canvas has replaced it.
        delete anchor.dataset.ribbonMorphing
        wakeRef.current = () => {}
      }
    }
    const mutations = new MutationObserver(initialize)
    mutations.observe(document.body, { childList: true, subtree: true })
    initialize()
    return () => {
      disposed = true
      mutations.disconnect()
      release()
    }
  }, [pathname])

  return (
    <RibbonPlayback.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      {props.children}
      <PublicSurfaceTransition />
      <canvas
        ref={canvasRef}
        className='lf-public-ribbon-canvas lf-optical-light'
        aria-hidden='true'
        hidden
      />
    </RibbonPlayback.Provider>
  )
}
