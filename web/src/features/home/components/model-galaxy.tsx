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
import {
  AudioLines,
  ArrowUpDown,
  Image as ImageIcon,
  Gavel,
  Mic,
  Speech,
  Boxes,
  Type,
  Video,
  Shapes,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent } from '@/components/ui/popover'
import { toIntlLocale } from '@/i18n/languages'
import { formatCompactNumber, formatNumber } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  createGalaxyField,
  type GalaxyCatalog,
  type GalaxyLab,
  type GalaxyPoint,
  type GalaxyPalette,
} from '../lib/reference-galaxy/layout'
import type { GalaxyMarkShape } from '../lib/reference-galaxy/mark'
import { ReferenceGalaxyScene } from '../lib/reference-galaxy/scene'
import { REFERENCE_MARK_PATH } from '../lib/reference-galaxy/shape'

import '@/styles/openrouter-replica.css'

const outputIcons = {
  text: Type,
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  speech: Speech,
  transcription: Mic,
  embeddings: Boxes,
  rerank: ArrowUpDown,
  decisions: Gavel,
}

function GalaxyProviderIcon({ lab, size }: { lab: GalaxyLab; size: number }) {
  if (lab.icon) return getLobeIcon(lab.icon, size)
  if (lab.image) {
    return (
      <img
        src={lab.image}
        data-dark-invert={lab.darkInvert || undefined}
        alt=''
        width={size}
        height={size}
      />
    )
  }
  return <Shapes size={size} aria-hidden='true' />
}

export function ModelGalaxy(props: {
  catalog: GalaxyCatalog
  reference?: boolean
  markShape?: GalaxyMarkShape
  palette?: { light: GalaxyPalette; dark: GalaxyPalette }
  onInspectLab?: (key: string) => void
  onTogglePause?: () => void
  paused: boolean
  scene: React.RefObject<ReferenceGalaxyScene | null>
  onSceneReady?: (scene: ReferenceGalaxyScene | null) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = props.reference
    ? 'en'
    : toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const inspect = useRef(props.onInspectLab)
  const onSceneReady = useRef(props.onSceneReady)
  useEffect(() => {
    inspect.current = props.onInspectLab
  }, [props.onInspectLab])
  const wrap = useRef<HTMLDivElement>(null),
    back = useRef<HTMLCanvasElement>(null),
    front = useRef<HTMLCanvasElement>(null),
    mark = useRef<HTMLDivElement>(null),
    anchor = useRef<HTMLSpanElement>(null)
  const labels = useRef<(HTMLButtonElement | null)[]>([])
  const [hovered, setHovered] = useState<GalaxyPoint | null>(null)
  const [catalogTime] = useState(() => Math.floor(Date.now() / 1000))
  const catalogSnapshot = useMemo(
    () => JSON.stringify(props.catalog),
    [props.catalog]
  )
  const field = useMemo(
    () =>
      createGalaxyField(
        JSON.parse(catalogSnapshot) as GalaxyCatalog,
        catalogTime
      ),
    [catalogSnapshot, catalogTime]
  )
  const fieldRef = useRef(field)
  useLayoutEffect(() => {
    fieldRef.current = field
    props.scene.current?.setField(
      field,
      labels.current.filter(
        (label): label is HTMLButtonElement => label !== null
      )
    )
  }, [field, props.scene])
  const ranks = useMemo(
    () =>
      new Map(
        field.points
          .filter((point) => point.model.weeklyTokens > 0)
          .sort((a, b) => b.model.weeklyTokens - a.model.weeklyTokens)
          .map((point, index) => [point.model.slug, index + 1])
      ),
    [field]
  )
  const paused = useRef(props.paused)
  useEffect(() => {
    paused.current = props.paused
    props.scene.current?.setPaused(props.paused)
  }, [props.paused, props.scene])
  useEffect(() => {
    if (
      !wrap.current ||
      !back.current ||
      !front.current ||
      !mark.current ||
      !anchor.current ||
      typeof CanvasRenderingContext2D === 'undefined' ||
      typeof ResizeObserver === 'undefined' ||
      typeof IntersectionObserver === 'undefined' ||
      !back.current.getContext('2d')
    ) {
      if (wrap.current) wrap.current.dataset.renderer = 'static'
      return
    }
    const sceneRef = props.scene
    const reportScene = onSceneReady.current
    const instance = new ReferenceGalaxyScene({
      wrap: wrap.current,
      canvas: back.current,
      front: front.current,
      mark: mark.current,
      labels: labels.current.filter(
        (label): label is HTMLButtonElement => label !== null
      ),
      anchor: anchor.current,
      copy:
        wrap.current.closest('section')?.querySelector('[data-hero-copy]') ??
        null,
      field: fieldRef.current,
      onHover: setHovered,
      markShape: props.markShape,
      palette: props.palette,
      onInspectLab: (key) => inspect.current?.(key),
    })
    sceneRef.current = instance
    reportScene?.(instance)
    instance.setPaused(paused.current)
    return () => {
      instance.dispose()
      sceneRef.current = null
      reportScene?.(null)
    }
  }, [props.scene, props.markShape, props.palette])
  const lab = hovered ? field.clusters[hovered.cluster] : null
  return (
    <div
      className='or-galaxy'
      ref={wrap}
      role='group'
      aria-label={t('Explore model providers')}
      aria-describedby='or-galaxy-keyboard-help'
      tabIndex={0}
      aria-keyshortcuts={props.onTogglePause ? 'Space Escape' : undefined}
      onKeyDown={(event) => {
        if (
          event.key === ' ' &&
          event.target === event.currentTarget &&
          props.onTogglePause
        ) {
          event.preventDefault()
          props.onTogglePause()
        }
      }}
      data-playing='false'
      data-mode={props.reference ? 'reference' : 'catalog'}
    >
      <canvas ref={back} className='or-galaxy-back' aria-hidden='true' />
      <div ref={mark} className='or-galaxy-mark' aria-hidden='true'>
        <svg
          viewBox='0 0 600 424'
          style={
            props.markShape?.scale
              ? {
                  width: `${53 * props.markShape.scale}%`,
                  height: `${53 * props.markShape.scale}%`,
                  left: `${(100 - 53 * props.markShape.scale) / 2}%`,
                  top: `${(100 - 53 * props.markShape.scale) / 2}%`,
                }
              : undefined
          }
        >
          <path
            d={props.markShape?.path ?? REFERENCE_MARK_PATH}
            fillRule='evenodd'
          />
        </svg>
      </div>
      <canvas ref={front} className='or-galaxy-front' aria-hidden='true' />
      {field.clusters.map((cluster, index) => (
        <Button
          key={cluster.key}
          variant='ghost'
          className='or-galaxy-lab'
          ref={(element) => {
            labels.current[index] = element
          }}
          aria-label={t('Explore {{provider}} models', {
            provider: cluster.name,
          })}
          aria-describedby={
            hovered?.cluster === index
              ? 'or-galaxy-keyboard-help or-model-detail'
              : 'or-galaxy-keyboard-help'
          }
          onFocus={() => props.scene.current?.focusLab(index)}
          onBlur={() => props.scene.current?.focusLab(null)}
          onPointerEnter={() => {
            if (!props.reference) props.scene.current?.focusLab(index)
          }}
          onPointerLeave={(event) => {
            if (
              !props.reference &&
              document.activeElement !== event.currentTarget
            ) {
              props.scene.current?.focusLab(null)
            }
          }}
          onClick={() => {
            if (props.scene.current) props.scene.current.inspectLab(index)
            else props.onInspectLab?.(cluster.key)
          }}
        >
          <span className='or-galaxy-disc'>
            <span className='or-favicon'>
              <GalaxyProviderIcon lab={cluster} size={16} />
            </span>
          </span>
        </Button>
      ))}
      <span className='or-galaxy-anchor' ref={anchor} aria-hidden='true' />
      <Popover open={hovered !== null}>
        <PopoverContent
          anchor={anchor}
          positionMethod='fixed'
          side='top'
          sideOffset={12}
          collisionPadding={8}
          initialFocus={false}
          finalFocus={false}
          role='tooltip'
          id='or-model-detail'
          className={
            props.reference
              ? 'or-model-popover'
              : 'or-model-popover lf-galaxy-popover'
          }
        >
          {hovered && lab && (
            <>
              <div className='or-popup-lab'>
                <span className='or-favicon'>
                  <GalaxyProviderIcon lab={lab} size={14} />
                </span>
                {lab.name}
              </div>
              <div className='or-popup-name'>
                {hovered.model.name}
                {hovered.model.variant && (
                  <span> ({hovered.model.variant})</span>
                )}
              </div>
              {!props.reference && (
                <div className='lf-galaxy-model-info'>
                  {hovered.model.description && (
                    <p>{hovered.model.description}</p>
                  )}
                  <span>{t('Available in the model catalog')}</span>
                </div>
              )}
              <dl className='or-popup-facts'>
                {props.catalog.isUsageAvailable && (
                  <>
                    <dt>
                      {t('Last 7 days', {
                        lng: props.reference ? 'en' : undefined,
                      })}
                    </dt>
                    <dd>
                      {ranks.has(hovered.model.slug) ? (
                        <>
                          <span>
                            #
                            {formatNumber(
                              ranks.get(hovered.model.slug),
                              locale
                            )}
                          </span>
                          <i />
                          {formatCompactNumber(
                            hovered.model.weeklyTokens,
                            locale
                          )}{' '}
                          tokens
                        </>
                      ) : (
                        t('No usage', {
                          lng: props.reference ? 'en' : undefined,
                        })
                      )}
                    </dd>
                  </>
                )}
                {hovered.model.outputModalities.length > 0 && (
                  <>
                    <dt>
                      {t('Outputs', {
                        lng: props.reference ? 'en' : undefined,
                      })}
                    </dt>
                    <dd>
                      {[
                        'text',
                        'image',
                        'video',
                        'speech',
                        'transcription',
                        'embeddings',
                        'rerank',
                        'decisions',
                        'audio',
                      ]
                        .filter((modality) =>
                          hovered.model.outputModalities.includes(modality)
                        )
                        .map((modality) => {
                          const Icon =
                            outputIcons[modality as keyof typeof outputIcons]
                          return Icon ? (
                            <Icon
                              key={modality}
                              size={14}
                              aria-label={modality}
                              role='img'
                            />
                          ) : (
                            <span key={modality}>{modality}</span>
                          )
                        })}
                    </dd>
                  </>
                )}
              </dl>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
