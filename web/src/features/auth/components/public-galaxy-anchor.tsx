/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useEffect, useLayoutEffect, useRef } from 'react'

import { usePublicScenePlayback } from '../hooks/use-public-scene-playback'
import type { PublicGalaxyMode } from '../lib/public-galaxy-transfer'

export function PublicGalaxyAnchor(props: {
  className: string
  mode: PublicGalaxyMode
  disabled?: boolean
  onInspectLab?: (key: string) => void
}) {
  const slot = useRef<HTMLDivElement>(null)
  const inspect = useRef(props.onInspectLab)
  const { register, paused } = usePublicScenePlayback()
  useEffect(() => {
    inspect.current = props.onInspectLab
  }, [props.onInspectLab])
  useLayoutEffect(() => {
    if (!slot.current) return
    return register?.({
      element: slot.current,
      mode: props.mode,
      disabled: props.disabled,
      inspect: (key) => inspect.current?.(key),
    })
  }, [register, props.mode, props.disabled])
  return (
    <div
      ref={slot}
      className={props.className}
      data-public-galaxy-anchor={props.mode}
      aria-hidden={props.mode === 'sign-in' || undefined}
      inert={props.mode === 'sign-in'}
      data-paused={paused}
    />
  )
}
