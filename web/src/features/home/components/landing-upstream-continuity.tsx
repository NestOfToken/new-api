/*
Copyright (C) 2023-2026 QuantumNous
SPDX-License-Identifier: AGPL-3.0-or-later
*/
import { Network } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { HeaderLogo } from '@/components/layout'
import { getLobeIcon } from '@/lib/lobe-icon'

import '@/styles/ruiyuan-continuity.css'

type Phase =
  | 'idle'
  | 'normal'
  | 'failure'
  | 'switching'
  | 'restored'
  | 'recovering'

const sequence = [
  { phase: 'normal', duration: 3600 },
  { phase: 'failure', duration: 900 },
  { phase: 'switching', duration: 1600 },
  { phase: 'restored', duration: 4200 },
  { phase: 'recovering', duration: 1500 },
] as const

const routes = [
  {
    id: 'tencent',
    icon: 'TencentCloud.Color',
    y: 48,
    desktop: 'M138 108 C240 108 310 48 432 48',
    mobile: 'M138 108 C210 108 230 48 316 48',
  },
  {
    id: 'alibaba',
    icon: 'AlibabaCloud.Color',
    y: 88,
    desktop: 'M138 108 C240 108 310 88 432 88',
    mobile: 'M138 108 C210 108 230 88 316 88',
  },
  {
    id: 'deepseek',
    icon: 'DeepSeek.Color',
    y: 128,
    desktop: 'M138 108 C240 108 310 128 432 128',
    mobile: 'M138 108 C210 108 230 128 316 128',
  },
  {
    id: 'other',
    icon: '',
    y: 168,
    desktop: 'M138 108 C240 108 310 168 432 168',
    mobile: 'M138 108 C210 108 230 168 316 168',
  },
] as const

export function LandingUpstreamContinuity(props: {
  logo: string
  name: string
}) {
  const { t } = useTranslation()
  const figure = useRef<HTMLElement>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [playing, setPlaying] = useState(false)
  const names = {
    tencent: t('Tencent Cloud'),
    alibaba: t('Alibaba Cloud'),
    deepseek: 'DeepSeek',
    other: t('Other'),
  }
  useEffect(() => {
    const target = figure.current
    if (!target) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = typeof IntersectionObserver === 'undefined'
    let timer: ReturnType<typeof setTimeout> | undefined
    const clear = () => {
      clearTimeout(timer)
      timer = undefined
    }
    const synchronize = () => {
      clear()
      if (media.matches) {
        setPlaying(false)
        setPhase('restored')
        return
      }
      if (!visible || document.hidden) {
        setPlaying(false)
        setPhase('idle')
        return
      }
      setPlaying(true)
      let step = 0
      const advance = () => {
        const current = sequence[step]
        setPhase(current.phase)
        timer = setTimeout(() => {
          step = (step + 1) % sequence.length
          advance()
        }, current.duration)
      }
      advance()
    }
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries.find((item) => item.target === target)
              if (!entry) return
              const next =
                entry.isIntersecting && entry.intersectionRatio >= 0.35
              if (visible === next) return
              visible = next
              synchronize()
            },
            { threshold: [0, 0.35] }
          )
    observer?.observe(target)
    media.addEventListener('change', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    if (media.matches || !observer) synchronize()
    return () => {
      clear()
      observer?.disconnect()
      media.removeEventListener('change', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
    }
  }, [])

  const failed =
    phase === 'failure' || phase === 'switching' || phase === 'restored'
  const takeover =
    phase === 'switching' || phase === 'restored' || phase === 'recovering'
  return (
    <section
      className='lf-continuity'
      id='continuity'
      aria-labelledby='lf-continuity-title'
    >
      <div className='lf-container lf-continuity-layout'>
        <div className='lf-continuity-heading'>
          <h2 id='lf-continuity-title'>
            {t('One connection.')}
            <span>{t('More ways to keep going.')}</span>
          </h2>
          <p>
            {t(
              'Multiple upstreams let the platform change routes when one becomes unavailable, reducing the impact of a single point of failure.'
            )}
          </p>
        </div>
        <figure
          className='lf-failover'
          ref={figure}
          data-phase={phase}
          data-playing={playing}
        >
          <div className='lf-route-window'>
            <div className='lf-route-window-header'>
              <span>{t('Automatic upstream selection')}</span>
            </div>
            <div
              className='lf-failover-diagram'
              role='img'
              aria-label={t(
                'Routing illustration: requests flow through Tencent Cloud, Alibaba Cloud, DeepSeek and other upstreams. Unavailable routes are bypassed automatically.'
              )}
            >
              <div aria-hidden='true'>
                {(['desktop', 'mobile'] as const).map((layout) => (
                  <svg
                    key={layout}
                    className={`lf-failover-lines lf-failover-${layout}`}
                    viewBox='0 0 680 216'
                    preserveAspectRatio='none'
                  >
                    <path className='lf-route-ground' d='M28 108 H118' />
                    {routes.map((route, index) => (
                      <g
                        key={route.id}
                        className='lf-upstream-route'
                        data-failed={failed && route.id === 'tencent'}
                        data-active={
                          takeover
                            ? route.id === 'alibaba'
                            : route.id === 'tencent'
                        }
                      >
                        <path className='lf-route-ground' d={route[layout]} />
                        {playing && (
                          <g className='lf-route-packets'>
                            {[0, 1].map((packet) => (
                              <circle
                                key={packet}
                                className='lf-route-dot'
                                r='2.6'
                                style={{
                                  offsetPath: `path("${route[layout]}")`,
                                  animationDelay: `${-index * 260 - packet * 900}ms`,
                                }}
                              />
                            ))}
                          </g>
                        )}
                      </g>
                    ))}
                    {playing &&
                      [0, 1].map((packet) => (
                        <circle
                          key={packet}
                          className='lf-route-dot lf-route-inlet'
                          r='3'
                          style={{
                            offsetPath: 'path("M28 108 H118")',
                            animationDelay: `${-packet * 900}ms`,
                          }}
                        />
                      ))}
                  </svg>
                ))}
                <div className='lf-route-hub' title={props.name}>
                  <HeaderLogo
                    src={props.logo}
                    loading={false}
                    logoLoaded
                    alt=''
                    className='lf-gateway-mark'
                  />
                </div>
                {routes.map((route) => {
                  const unavailable = failed && route.id === 'tencent'
                  const selected = takeover
                    ? route.id === 'alibaba'
                    : !failed && route.id === 'tencent'
                  return (
                    <div
                      key={route.id}
                      className='lf-route-row'
                      style={{ top: `${(route.y / 216) * 100}%` }}
                      data-upstream={route.id}
                      data-active={selected}
                      data-failed={unavailable}
                    >
                      <span className='lf-upstream-label'>
                        <span className='lf-upstream-icon' aria-hidden='true'>
                          {route.icon ? (
                            getLobeIcon(route.icon, 16)
                          ) : (
                            <Network size={16} />
                          )}
                        </span>
                        <span>{names[route.id]}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </figure>
      </div>
    </section>
  )
}
