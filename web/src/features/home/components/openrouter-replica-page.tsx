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
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  ExternalLink,
  Pause,
  Play,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

import type { GalaxyCatalog } from '../lib/reference-galaxy/layout'
import type { ReferenceGalaxyScene } from '../lib/reference-galaxy/scene'
import { ModelGalaxy as ReferenceGalaxy } from './model-galaxy'

import '@/styles/openrouter-replica.css'

export function OpenRouterReplicaPage() {
  const { t } = useTranslation()
  const scene = useRef<ReferenceGalaxyScene | null>(null)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (typeof FontFace === 'undefined' || !document.fonts) return
    const faces = [
      new FontFace('OR Jakarta', "url('/__reference/fonts/jakarta.woff2')", {
        weight: '100 900',
        display: 'swap',
      }),
      new FontFace('OR Gordita', "url('/__reference/fonts/gordita.woff2')", {
        weight: '700',
        display: 'swap',
      }),
    ]
    for (const face of faces) document.fonts.add(face)
    void Promise.allSettled(faces.map((face) => face.load())).then(() =>
      scene.current?.refreshLayout()
    )
    return () => {
      for (const face of faces) document.fonts.delete(face)
    }
  }, [])
  const catalog = useQuery({
    queryKey: ['local-openrouter-reference'],
    queryFn: async () => {
      const response = await api.get<GalaxyCatalog>('/__reference/catalog.json')
      if (
        !Array.isArray(response.data.labs) ||
        !Array.isArray(response.data.models)
      ) {
        throw new Error('Reference catalog unavailable')
      }
      return response.data
    },
    staleTime: Infinity,
    retry: false,
    meta: { errorToast: false },
  })
  let fieldContent = <LoadingState />
  if (catalog.data) {
    fieldContent = (
      <ReferenceGalaxy
        reference
        catalog={catalog.data}
        paused={paused}
        scene={scene}
      />
    )
  } else if (catalog.isError) {
    fieldContent = (
      <ErrorState
        title={t('Reference scene assets are unavailable')}
        onRetry={() => void catalog.refetch()}
      />
    )
  }
  const metrics = [
    ['800T+', t('monthly tokens', { lng: 'en' })],
    ['10M+', t('users', { lng: 'en' })],
    ['600+', t('models', { lng: 'en' })],
  ]
  return (
    <div className='or-source-page'>
      <PublicLayout
        showMainContainer={false}
        showThemeSwitch={false}
        showAuthButtons={false}
        showNotifications={false}
        logo={
          <>
            <img
              className='or-brand-light'
              src='/__reference/brand.svg'
              alt='OpenRouter'
            />
            <img
              className='or-brand-dark'
              src='/__reference/brand-dark.svg'
              alt='OpenRouter'
            />
          </>
        }
        siteName='OpenRouter'
        headerProps={{
          className: 'or-source-header',
          showLanguageSwitcher: false,
          rightContent: (
            <>
              <Button
                variant='ghost'
                className='or-mobile-search'
                aria-label={t('Search', { lng: 'en' })}
                render={<a href='https://openrouter.ai/models' />}
              >
                <Search size={16} />
              </Button>
              <Button
                variant='outline'
                className='or-nav-outline'
                render={<a href='https://openrouter.ai/enterprise/form' />}
              >
                {t('Talk to sales', { lng: 'en' })}
              </Button>
              <Button
                variant='outline'
                className='or-nav-outline'
                render={<a href='https://openrouter.ai/' />}
              >
                {t('Sign in', { lng: 'en' })}
              </Button>
              <Button
                className='or-nav-signup'
                render={<a href='https://openrouter.ai/' />}
              >
                {t('Sign up', { lng: 'en' })}
              </Button>
            </>
          ),
        }}
        navContent={
          <>
            <Button
              variant='outline'
              className='or-source-search'
              render={<a href='https://openrouter.ai/models' />}
            >
              <Search size={15} />
              <span>{t('Search', { lng: 'en' })}</span>
              <kbd>⌘ K</kbd>
            </Button>
            {['Models', 'Rankings', 'Ori', 'Docs', 'Chat', 'Pricing'].map(
              (title) => (
                <a
                  key={title}
                  className='or-source-nav-link'
                  href={`https://openrouter.ai/${title === 'Docs' ? 'docs/quickstart' : title.toLowerCase()}`}
                >
                  {title === 'Ori' ? title : t(title, { lng: 'en' })}
                  {['Models', 'Rankings', 'Ori'].includes(title) && (
                    <ChevronDown size={12} />
                  )}
                  {title === 'Docs' && <ExternalLink size={11} />}
                </a>
              )
            )}
          </>
        }
      >
        <main className='or-source-main'>
          <section
            className='or-reference-hero'
            aria-labelledby='or-reference-title'
          >
            <div className='or-copy-container'>
              <div className='or-reference-copy' data-hero-copy>
                <h1 id='or-reference-title'>
                  {t('The future is multi-model', { lng: 'en' })}
                </h1>
                <p>
                  {t(
                    'Run all your AI workloads securely on one neutral platform, with the best model at the best intelligence per dollar.',
                    { lng: 'en' }
                  )}
                </p>
                <div className='or-reference-actions' data-hero-actions>
                  <Button
                    className='or-source-primary'
                    render={
                      <a href='https://openrouter.ai/workspaces/default/keys' />
                    }
                  >
                    {t('Get API key', { lng: 'en' })}
                  </Button>
                  <CopyButton
                    variant='outline'
                    size='default'
                    className='or-source-agent'
                    value='Connect this project to OpenRouter: https://openrouter.ai/docs/quickstart'
                    aria-label={t('Use your agent', { lng: 'en' })}
                  >
                    {t('Use your agent', { lng: 'en' })}
                  </CopyButton>
                </div>
                <dl className='or-source-metrics'>
                  {metrics.map(([value, label]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className='or-galaxy-mask'>{fieldContent}</div>
          </section>
          <aside className='or-reference-note'>
            <div>
              <strong>{t('OpenRouter reference scene')}</strong>
              <p>
                {t(
                  'Official sample data for visual comparison. This is not the platform model catalog.'
                )}
              </p>
              <p>
                {t(
                  'Hover a model, hold to inspect, drag the mark, or double-click to zoom.'
                )}
              </p>
              <p id='or-galaxy-keyboard-help'>
                {t(
                  'Keyboard: Tab to a provider, Left/Right to explore models, Enter to inspect, Shift+Arrow to pan, Esc to reset.'
                )}
              </p>
            </div>
            <div className='or-reference-controls'>
              <Button
                variant='outline'
                size='icon'
                onClick={() => setPaused(!paused)}
                aria-pressed={paused}
                aria-label={
                  paused
                    ? t('Resume model animation')
                    : t('Pause model animation')
                }
              >
                {paused ? <Play /> : <Pause />}
              </Button>
              <Button
                variant='outline'
                size='icon'
                aria-label={t('Reset view')}
                onClick={() => scene.current?.reset()}
              >
                <RotateCcw />
              </Button>
              <Button variant='outline' render={<a href='/' />}>
                {t('Back to platform')}
              </Button>
            </div>
          </aside>
        </main>
      </PublicLayout>
    </div>
  )
}
