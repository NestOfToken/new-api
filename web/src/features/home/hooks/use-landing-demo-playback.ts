/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useEffect, useRef, useState } from 'react'

// One clock per visible demonstration. Pausing preserves its position.
export function useLandingDemoPlayback() {
  const root = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const target = root.current
    if (!target) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = typeof IntersectionObserver === 'undefined'
    let timer: ReturnType<typeof setInterval> | undefined
    const synchronize = () => {
      clearInterval(timer)
      timer = undefined
      const active = visible && !document.hidden && !media.matches
      setReducedMotion(media.matches)
      setPlaying(active)
      if (active) timer = setInterval(() => setTick((value) => value + 1), 750)
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.find((item) => item.target === target)
              if (!entry) return
              const next =
                entry.isIntersecting && entry.intersectionRatio >= 0.2
              if (next === visible) return
              visible = next
              synchronize()
            },
            { threshold: [0, 0.2] }
          )
    observer?.observe(target)
    media.addEventListener('change', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    if (!observer || media.matches) synchronize()
    return () => {
      clearInterval(timer)
      observer?.disconnect()
      media.removeEventListener('change', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
    }
  }, [])
  return { root, tick, playing, reducedMotion }
}
