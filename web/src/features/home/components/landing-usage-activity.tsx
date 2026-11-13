/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { useTranslation } from 'react-i18next'

import { useLandingDemoPlayback } from '../hooks/use-landing-demo-playback'

// Relative illustrative amounts, never live usage or billing quantities.
const demandLevels = [3, 7, 11, 5]

export function LandingUsageActivity() {
  const { t } = useTranslation()
  const playback = useLandingDemoPlayback()
  const phase = Math.floor((playback.tick % 24) / 6)
  const amount = demandLevels[phase]
  const growing = phase === 1 || phase === 2
  let caption = t('Choose for the task. Adjust as you grow.')
  if (growing) caption = t('Demand grows, usage grows with it.')
  if (phase === 3) caption = t('Demand falls, usage falls with it.')

  return (
    <div
      className='lf-usage-activity'
      ref={playback.root}
      data-playing={playback.playing}
    >
      <h3 className='lf-usage-title'>{t('Usage follows demand.')}</h3>
      <div
        className='lf-usage-comparison'
        role='img'
        aria-label={t(
          'Illustrative comparison: platform usage increases and decreases with business demand. Not actual usage data.'
        )}
      >
        {['demand', 'usage'].map((track) => (
          <div
            className='lf-usage-row'
            data-usage-track={track}
            key={track}
            aria-hidden='true'
          >
            <span className='lf-usage-row-label'>
              {track === 'demand' ? t('Business demand') : t('Actual usage')}
            </span>
            <div className='lf-usage-units'>
              {Array.from({ length: 12 }, (_, index) => (
                <span
                  className='lf-usage-unit'
                  key={index}
                  data-active={index < amount}
                >
                  <i
                    style={{
                      transitionDelay: `${(track === 'usage' ? 160 : 0) + (growing ? index : 11 - index) * 25}ms`,
                    }}
                  />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className='lf-activity-footer' key={phase}>
        {caption}
      </div>
    </div>
  )
}
