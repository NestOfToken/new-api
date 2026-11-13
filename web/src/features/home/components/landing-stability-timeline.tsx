/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { HeaderLogo } from '@/components/layout'
import { getLobeIcon } from '@/lib/lobe-icon'

import { useLandingDemoPlayback } from '../hooks/use-landing-demo-playback'

import '@/styles/ruiyuan-stability.css'

const interruptions = [
  { id: 'tencent', x: 150, y: 30 },
  { id: 'alibaba', x: 330, y: 90 },
  { id: 'deepseek', x: 510, y: 150 },
]

export function LandingStabilityTimeline(props: {
  name: string
  logo: string
}) {
  const { t } = useTranslation()
  const playback = useLandingDemoPlayback()
  const pastId = useId()
  // Same 600-unit repeat and 27s cycle as the continuously scrolling drawing.
  const position = (570 + ((playback.tick % 36) * 600) / 36) % 600
  const providers = [
    { id: 'tencent', name: t('Tencent Cloud'), icon: 'TencentCloud.Color' },
    { id: 'alibaba', name: t('Alibaba Cloud'), icon: 'AlibabaCloud.Color' },
    { id: 'deepseek', name: 'DeepSeek', icon: 'DeepSeek.Color' },
  ]

  return (
    <div
      className='lf-stability-demo'
      ref={playback.root}
      data-playing={playback.playing}
      role='img'
      aria-label={t(
        'Illustrative timeline: healthy upstreams serve in parallel, and other available routes maintain continuous platform service when one is interrupted.'
      )}
    >
      <div className='lf-relay-field' aria-hidden='true'>
        <div className='lf-relay-labels'>
          {providers.map((provider, index) => {
            const interrupted =
              position >= interruptions[index].x &&
              position < interruptions[index].x + 66
            return (
              <div
                className='lf-relay-name'
                key={provider.id}
                data-provider={provider.id}
                data-active={!interrupted}
                data-interrupted={interrupted}
              >
                <span className='lf-stability-icon'>
                  {getLobeIcon(provider.icon, 16)}
                </span>
                <span>{provider.name}</span>
              </div>
            )
          })}
          <div className='lf-relay-name lf-relay-platform-name'>
            <HeaderLogo
              src={props.logo}
              loading={false}
              logoLoaded
              alt=''
              className='lf-stability-icon'
            />
            <strong>{props.name}</strong>
          </div>
        </div>
        <div className='lf-relay-chart'>
          <svg
            viewBox='0 0 600 240'
            preserveAspectRatio='none'
            focusable='false'
          >
            <defs>
              <clipPath id={pastId}>
                <rect width='450' height='180' />
              </clipPath>
            </defs>
            {[30, 90, 150].map((y) => (
              <path key={y} d={`M0 ${y}H600`} className='lf-relay-guide' />
            ))}
            <path d='M0 180H600' className='lf-relay-divider' />
            <g clipPath={`url(#${pastId})`}>
              <g className='lf-relay-scroll'>
                {[0, 600, 1200].map((offset) => (
                  <g key={offset} transform={`translate(${offset})`}>
                    {interruptions.map((lane) => (
                      <path
                        key={lane.id}
                        data-lane={lane.id}
                        className='lf-relay-carry'
                        d={`M0 ${lane.y}H${lane.x - 8} M${lane.x + 66} ${lane.y}H600`}
                      />
                    ))}
                    {interruptions.map((event) => (
                      <g
                        key={event.id}
                        data-interruption={event.id}
                        className='lf-relay-break'
                      >
                        <path
                          d={`M${event.x - 6} ${event.y - 5}l12 10m0-10l-12 10`}
                        />
                      </g>
                    ))}
                  </g>
                ))}
              </g>
            </g>
            <g className='lf-stability-service'>
              <path className='lf-relay-guide' d='M0 210H600' />
              <path className='lf-relay-service-line' d='M0 210H450' />
              <path className='lf-relay-service-flow' d='M0 210H450' />
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
