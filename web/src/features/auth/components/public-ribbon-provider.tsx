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
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { isPublicAuthTransition } from '../lib/public-auth-motion'
import type { RibbonBounds } from './ribbon-renderer'

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
  const homeScrollRef = useRef<number | null>(null)
  const pausedRef = useRef(false)
  const wakeRef = useRef(() => {})
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    pausedRef.current = paused
    wakeRef.current()
  }, [paused])

  useEffect(
    () =>
      router.subscribe('onBeforeLoad', ({ fromLocation, toLocation }) => {
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
        const bounds = anchor.getBoundingClientRect()
        if (fromLocation?.pathname === '/') {
          homeScrollRef.current = window.scrollY
        }
        sourceRef.current = {
          bounds: {
            left: bounds.left,
            top: bounds.top,
            width: bounds.width,
            height: bounds.height,
          },
          progress: fromLocation?.pathname === '/sign-in' ? 1 : 0,
        }
      }),
    [router]
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.hidden = true
    if (pathname !== '/' && pathname !== '/sign-in') {
      sourceRef.current = null
      return
    }
    let disposed = false
    let initializing = false
    let release = () => {}
    const initialize = async () => {
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
      if (targetProgress === 0 && !source) return
      const renderer = await import('./ribbon-renderer').catch(() => null)
      if (disposed || !renderer) return
      const { drawRibbon } = renderer
      const context = canvas.getContext('2d')
      if (!context) return
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      )
      let targetBounds = anchor.getBoundingClientRect()
      const origin = source ?? {
        bounds: targetBounds,
        progress: targetProgress,
      }
      let started: number | null = null
      let lastFrame = 0
      let frame = 0
      let visible = true
      let settled = !source || reducedMotion.matches
      let dirty = true
      const measure = () => {
        targetBounds = anchor.getBoundingClientRect()
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
        const width = Math.round(window.innerWidth * ratio)
        const height = Math.round(window.innerHeight * ratio)
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        dirty = true
        wake()
      }
      const draw = (now: number) => {
        frame = 0
        if (disposed || document.hidden) return
        if (!started) started = now
        const fraction = reducedMotion.matches
          ? 1
          : Math.min(1, (now - started) / 850)
        const travel = settled ? 1 : 1 - Math.pow(1 - fraction, 4)
        const progress =
          origin.progress + (targetProgress - origin.progress) * travel
        settled = settled || fraction === 1
        if (settled && (targetProgress === 0 || !visible)) {
          canvas.hidden = true
          return
        }
        if (now - lastFrame >= 32 || dirty) {
          if (!pausedRef.current && !reducedMotion.matches && lastFrame) {
            phaseRef.current += Math.min((now - lastFrame) / 1000, 0.05)
          }
          lastFrame = now
          context.clearRect(0, 0, window.innerWidth, window.innerHeight)
          drawRibbon(context, {
            from: origin.bounds,
            to: targetBounds,
            fromProgress: origin.progress,
            toProgress: targetProgress,
            progress,
            travel,
            time: phaseRef.current,
            dark: document.documentElement.classList.contains('dark'),
          })
          canvas.style.opacity = String(0.1 + progress * 0.9)
          canvas.hidden = false
          anchor.dataset.ribbonReady = 'true'
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
      const appearance = new MutationObserver(wake)
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
        delete anchor.dataset.ribbonReady
        wakeRef.current = () => {}
      }
    }
    const mutations = new MutationObserver(() => void initialize())
    mutations.observe(document.body, { childList: true, subtree: true })
    void initialize()
    return () => {
      disposed = true
      mutations.disconnect()
      release()
      canvas.hidden = true
    }
  }, [pathname])

  return (
    <RibbonPlayback.Provider
      value={{ paused, toggle: () => setPaused((value) => !value) }}
    >
      {props.children}
      <canvas
        ref={canvasRef}
        className='lf-public-ribbon-canvas'
        aria-hidden='true'
        hidden
      />
    </RibbonPlayback.Provider>
  )
}
