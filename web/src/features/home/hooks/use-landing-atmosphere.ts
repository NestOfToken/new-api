/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useEffect, type RefObject } from 'react'

// CSS owns the slow drift; this only gates each background's playback lifecycle.
export function useLandingAtmosphere(surface: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const sections = surface.current?.querySelectorAll<HTMLElement>(
      '.lf-capabilities, .lf-continuity, .lf-platform-journey, .lf-integration'
    )
    if (!sections?.length || typeof IntersectionObserver === 'undefined') return
    const visible = new Set<Element>()
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const synchronize = () => {
      for (const section of sections) {
        section.dataset.atmospherePlaying = String(
          visible.has(section) && !document.hidden && !media.matches
        )
      }
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      synchronize()
    })
    sections.forEach((section) => observer.observe(section))
    media.addEventListener('change', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    synchronize()
    return () => {
      observer.disconnect()
      media.removeEventListener('change', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
      sections.forEach((section) => delete section.dataset.atmospherePlaying)
    }
  }, [surface])
}
