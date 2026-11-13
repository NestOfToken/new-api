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
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { PublicGalaxyAnchor } from '@/features/auth/components/public-galaxy-anchor'
import { usePublicScenePlayback } from '@/features/auth/hooks/use-public-scene-playback'
import { formatNumber } from '@/lib/format'

import type { LandingCatalog } from '../hooks/use-landing-catalog'

import '@/styles/ruiyuan-home-hero.css'

export function LandingPlatformHero(props: {
  catalog: LandingCatalog
  startDestination: '/dashboard' | '/sign-in'
  onSelectProvider: (id: string) => void
}) {
  const { t } = useTranslation()
  const { paused } = usePublicScenePlayback()
  const count = props.catalog.providers.filter(
    (provider) => provider.id !== 'other'
  ).length
  let field: ReactNode = null
  if (props.catalog.isLoading) {
    field = <LoadingState message={t('Loading model catalog...')} />
  } else if (props.catalog.error) {
    field = (
      <ErrorState
        title={t(
          'The model catalog is temporarily unavailable. Please try again.'
        )}
        onRetry={() => void props.catalog.refetch()}
      />
    )
  } else if (!props.catalog.models.length) {
    field = <EmptyState title={t('No models are currently listed.')} />
  }
  return (
    <section className='lf-ruiyuan-hero' aria-labelledby='lf-hero-title'>
      <div className='lf-ruiyuan-opening or-reference-hero'>
        <div className='or-copy-container'>
          <div className='lf-ruiyuan-intro' data-hero-copy>
            <h1 id='lf-hero-title'>
              {t('More models.')}
              <span>{t('One place to build.')}</span>
            </h1>
            <p>
              {t(
                'Bring leading AI models into your business. Explore, choose and grow on one platform.'
              )}
            </p>
            <div className='lf-actions' data-hero-actions>
              <Button
                className='lf-primary'
                render={<Link to={props.startDestination} />}
              >
                {t('Use now')}
                <ArrowUpRight aria-hidden='true' />
              </Button>
              <Button variant='link' className='lf-inline-link' disabled>
                {t('Contact sales')}
              </Button>
            </div>
            <dl className='lf-ruiyuan-facts' aria-live='polite'>
              <div>
                <dt>{t('Available models')}</dt>
                <dd>
                  {props.catalog.isLoading || props.catalog.error
                    ? '—'
                    : formatNumber(
                        props.catalog.models.length,
                        props.catalog.locale
                      )}
                </dd>
              </div>
              <div>
                <dt>{t('Model providers')}</dt>
                <dd>
                  {props.catalog.isLoading || props.catalog.error
                    ? '—'
                    : formatNumber(count, props.catalog.locale)}
                </dd>
              </div>
              <div>
                <dt>{t('Flexible use')}</dt>
                <dd>{t('On demand')}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className='or-galaxy-mask'>
          <PublicGalaxyAnchor
            className='lf-home-galaxy-slot'
            mode='home'
            disabled={
              props.catalog.isLoading ||
              !!props.catalog.error ||
              !props.catalog.models.length
            }
            onInspectLab={props.onSelectProvider}
          />
          {field}
        </div>
        <div className='lf-ruiyuan-horizon' aria-hidden='true' />
      </div>
      <p id='or-galaxy-keyboard-help' className='sr-only'>
        {t(
          'Keyboard: Space to pause or resume; Tab to a provider; Left/Right to explore models; Enter to inspect; Shift+Arrow to pan; Esc to reset.'
        )}
      </p>
      <p className='sr-only' role='status'>
        {paused ? t('Model animation paused') : t('Model animation running')}
      </p>
    </section>
  )
}
