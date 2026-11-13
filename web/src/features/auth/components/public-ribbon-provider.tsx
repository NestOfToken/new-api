/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useRouterState } from '@tanstack/react-router'
import { Pause, Play } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { ModelGalaxy } from '@/features/home/components/model-galaxy'
import { useLandingCatalog } from '@/features/home/hooks/use-landing-catalog'
import {
  createLandingGalaxyCatalog,
  RUIYUAN_GALAXY_PALETTE,
} from '@/features/home/lib/landing-galaxy'
import type { ReferenceGalaxyScene } from '@/features/home/lib/reference-galaxy/scene'
import { RUIYUAN_KEY_SHAPE } from '@/lib/ruiyuan-brand'

import {
  PublicScenePlayback,
  usePublicScenePlayback,
} from '../hooks/use-public-scene-playback'
import {
  PublicGalaxyTransfer,
  type PublicGalaxyAnchor,
} from '../lib/public-galaxy-transfer'
import { PublicSurfaceTransition } from './public-surface-transition'

function PersistentPublicGalaxy(props: {
  transfer: PublicGalaxyTransfer
  paused: boolean
  toggle: () => void
}) {
  const catalog = useLandingCatalog()
  const scene = useRef<ReferenceGalaxyScene | null>(null)
  const field = useMemo(
    () => createLandingGalaxyCatalog(catalog.providers),
    [catalog.providers]
  )
  return (
    <>
      <div className='lf-shared-scene-fallback' aria-hidden='true'>
        <span />
        <span />
        <span />
        <svg viewBox='0 0 600 424'>
          <path d={RUIYUAN_KEY_SHAPE.path} fillRule='evenodd' />
        </svg>
      </div>
      {!catalog.isLoading && (
        <ModelGalaxy
          catalog={field}
          paused={props.paused}
          scene={scene}
          markShape={RUIYUAN_KEY_SHAPE}
          palette={RUIYUAN_GALAXY_PALETTE}
          onSceneReady={props.transfer.setScene}
          onInspectLab={props.transfer.inspect}
          onTogglePause={props.toggle}
        />
      )}
    </>
  )
}

// Keep the existing public provider entry point; it no longer owns a ribbon renderer.
export function PublicRibbonProvider(props: { children: ReactNode }) {
  const [paused, setPaused] = useState(false)
  const [started, setStarted] = useState(false)
  const [transfer] = useState(() => new PublicGalaxyTransfer())
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const publicRoute = pathname === '/' || pathname === '/sign-in'
  const register = useCallback(
    (anchor: PublicGalaxyAnchor) => {
      setStarted(true)
      return transfer.attach(anchor)
    },
    [transfer]
  )
  const toggle = useCallback(() => setPaused((value) => !value), [])
  const dismiss = useCallback(() => transfer.hide(), [transfer])
  const playback = useMemo(
    () => ({ paused, toggle, register, dismiss }),
    [paused, toggle, register, dismiss]
  )
  useEffect(() => {
    transfer.start()
    return () => transfer.stop()
  }, [transfer])
  useLayoutEffect(() => {
    if (!publicRoute) transfer.hide()
  }, [publicRoute, transfer])
  return (
    <PublicScenePlayback.Provider value={playback}>
      {props.children}
      <PublicSurfaceTransition />
      {started &&
        publicRoute &&
        createPortal(
          <PersistentPublicGalaxy
            transfer={transfer}
            paused={paused}
            toggle={toggle}
          />,
          transfer.host
        )}
    </PublicScenePlayback.Provider>
  )
}

export function RibbonPlaybackButton() {
  const { t } = useTranslation()
  const playback = usePublicScenePlayback()
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
