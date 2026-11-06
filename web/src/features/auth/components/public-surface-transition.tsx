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
import { useEffect, useLayoutEffect, useRef } from 'react'

import { isPublicAuthTransition } from '../lib/public-auth-motion'

interface OutgoingSurface {
  node: HTMLElement
  destination: string
  scroll: number
  width: number
  ribbonReady: boolean
}

// React owns the routed pages. This empty host only receives an already removed
// DOM subtree for its exit animation; mounted React nodes are never moved/copied.
export function PublicSurfaceTransition() {
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const hostRef = useRef<HTMLDivElement>(null)
  const sourceRef = useRef<OutgoingSurface | null>(null)

  useEffect(
    () =>
      router.subscribe('onBeforeLoad', ({ fromLocation, toLocation }) => {
        sourceRef.current = null
        if (
          !isPublicAuthTransition(fromLocation?.pathname, toLocation.pathname)
        ) {
          return
        }
        const node = document.querySelector<HTMLElement>(
          '[data-lf-public-surface]'
        )
        if (!node) return
        sourceRef.current = {
          node,
          destination: toLocation.pathname,
          scroll: window.scrollY,
          width: node.getBoundingClientRect().width,
          ribbonReady:
            node.querySelector<HTMLElement>('.lf-sign-in-art')?.dataset
              .ribbonReady === 'true',
        }
      }),
    [router]
  )

  useLayoutEffect(() => {
    const host = hostRef.current
    const source = sourceRef.current
    sourceRef.current = null
    if (
      !host ||
      !source ||
      source.destination !== pathname ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof host.animate !== 'function'
    ) {
      return
    }
    let disposed = false
    let prepared = false
    let fallback = 0
    let target: HTMLElement | null = null
    const animations: Animation[] = []
    const release = () => {
      if (disposed) return
      disposed = true
      mutations.disconnect()
      window.clearTimeout(fallback)
      for (const animation of animations) animation.cancel()
      if (target) delete target.dataset.lfSurfaceEntering
      host.replaceChildren()
      if (prepared) source.node.replaceChildren()
      delete host.dataset.lfRibbonReady
    }
    const initialize = () => {
      if (disposed || source.node.isConnected) return
      if (!prepared) {
        prepared = true
        // Discard editable/hidden values before retaining the exited form. No
        // credentials are cloned, snapshotted, stored, or sent to the canvas.
        for (const input of source.node.querySelectorAll<HTMLInputElement>(
          'input, textarea'
        )) {
          input.value = ''
          input.removeAttribute('value')
        }
        for (const embedded of source.node.querySelectorAll('iframe, script')) {
          embedded.remove()
        }
        for (const shared of source.node.querySelectorAll<HTMLElement>(
          '.public-brand-link, .lf-sign-in-brand, #lf-hero-title, .lf-public-headline'
        )) {
          shared.style.visibility = 'hidden'
        }
        source.node.removeAttribute('data-lf-public-surface')
        for (const element of source.node.querySelectorAll(
          '[id], [data-lf-ribbon-anchor]'
        )) {
          element.removeAttribute('id')
          element.removeAttribute('data-lf-ribbon-anchor')
        }
        source.node.inert = true
        source.node.setAttribute('aria-hidden', 'true')
        source.node.style.width = `${source.width}px`
        // A custom homepage has no participating public surface. It must never
        // be covered or delayed by a retained login layout.
        fallback = window.setTimeout(release, 1000)
      }
      target = document.querySelector<HTMLElement>(
        `[data-lf-public-surface='${pathname === '/sign-in' ? 'sign-in' : 'home'}']`
      )
      if (!target) return
      window.clearTimeout(fallback)
      mutations.disconnect()
      host.style.width = `${target.getBoundingClientRect().width}px`
      host.dataset.lfRibbonReady = String(source.ribbonReady)
      host.append(source.node)
      host.scrollTop = source.scroll
      target.dataset.lfSurfaceEntering = 'true'
      target.dataset.lfSceneArrived = 'true'
      const enteringLogin = pathname === '/sign-in'
      const timing: KeyframeAnimationOptions = {
        duration: 850,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both',
      }
      animations.push(
        host.animate(
          [
            { clipPath: 'inset(0 0 0 0)' },
            {
              clipPath: enteringLogin
                ? 'inset(0 100% 0 0)'
                : 'inset(0 0 0 100%)',
            },
          ],
          timing
        )
      )
      // The departing login already reveals the homepage. Keep the homepage's
      // image/mask paint context unchanged instead of clipping it a second time.
      if (enteringLogin) {
        animations.push(
          target.animate(
            [
              {
                clipPath: enteringLogin
                  ? 'inset(0 0 0 100%)'
                  : 'inset(0 100% 0 0)',
              },
              { clipPath: 'inset(0 0 0 0)' },
            ],
            timing
          )
        )
      }
      const contents = source.node.querySelector<HTMLElement>(
        enteringLogin ? 'main' : '.lf-sign-in-form'
      )
      if (contents) {
        animations.push(
          contents.animate(
            [
              { transform: 'translateX(0)' },
              { transform: `translateX(${enteringLogin ? -24 : 32}px)` },
            ],
            timing
          )
        )
      }
      if (enteringLogin) {
        const form = target.querySelector<HTMLElement>('.lf-sign-in-form')
        if (form) {
          animations.push(
            form.animate(
              [
                { transform: 'translateX(24px)' },
                { transform: 'translateX(0)' },
              ],
              timing
            )
          )
        }
      }
      void Promise.all(animations.map((animation) => animation.finished)).then(
        release,
        release
      )
    }
    const mutations = new MutationObserver(initialize)
    mutations.observe(document.body, { childList: true, subtree: true })
    initialize()
    return release
  }, [pathname])

  return (
    <div
      ref={hostRef}
      className='lf-public-outgoing'
      aria-hidden='true'
      inert
    />
  )
}
