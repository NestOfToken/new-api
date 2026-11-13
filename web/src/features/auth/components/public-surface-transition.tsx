/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useRouter, useRouterState } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef } from 'react'

import { isPublicAuthTransition } from '../lib/public-auth-motion'

// Only the new foreground settles here. The same live scene moves independently.
export function PublicSurfaceTransition() {
  const router = useRouter()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const destination = useRef<string | null>(null)
  useEffect(
    () =>
      router.subscribe('onBeforeLoad', ({ fromLocation, toLocation }) => {
        destination.current = isPublicAuthTransition(
          fromLocation?.pathname,
          toLocation.pathname
        )
          ? toLocation.pathname
          : null
      }),
    [router]
  )
  useLayoutEffect(() => {
    const arriving = destination.current === pathname
    destination.current = null
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!arriving || media.matches) {
      return
    }
    const animations: Animation[] = []
    const reduce = () => {
      if (media.matches) animations.forEach((animation) => animation.cancel())
    }
    media.addEventListener('change', reduce)
    let initialized = false
    const initialize = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-lf-public-surface='${pathname === '/sign-in' ? 'sign-in' : 'home'}']`
      )
      if (!target || initialized || typeof target.animate !== 'function') return
      initialized = true
      observer.disconnect()
      const foreground = target.querySelectorAll<HTMLElement>(
        '.lf-sign-in-form, .lf-sign-in-toolbar, [data-hero-copy]'
      )
      for (const form of foreground) {
        let delay = 0
        if (document.querySelector('.lf-public-galaxy-flight[data-moving]')) {
          delay = pathname === '/' ? 80 : 180
        }
        animations.push(
          form.animate(
            [
              { opacity: 0, transform: 'translateX(14px)' },
              { opacity: 1, transform: 'translateX(0)' },
            ],
            {
              duration: 280,
              delay,
              fill: 'backwards',
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            }
          )
        )
      }
      const navigation = target.querySelector<HTMLElement>(
        '.lf-home-header nav'
      )
      if (navigation) {
        animations.push(
          navigation.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 240,
            delay: document.querySelector(
              '.lf-public-galaxy-flight[data-moving]'
            )
              ? 160
              : 0,
            fill: 'backwards',
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          })
        )
      }
    }
    const observer = new MutationObserver(initialize)
    observer.observe(document.body, { childList: true, subtree: true })
    initialize()
    const timeout = window.setTimeout(() => observer.disconnect(), 1000)
    return () => {
      observer.disconnect()
      window.clearTimeout(timeout)
      media.removeEventListener('change', reduce)
      animations.forEach((animation) => animation.cancel())
    }
  }, [pathname])
  return null
}
