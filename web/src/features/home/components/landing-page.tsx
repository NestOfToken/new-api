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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { isHttpUrl } from '@/lib/content-format'

import { HeroTerminalDemo } from './hero-terminal-demo'
import { LandingConsolePreview } from './landing-console-preview'
import { LandingModelExplorer } from './landing-model-explorer'
import { LandingOpticalRibbon } from './landing-optical-ribbon'
import { LandingAccessCard, LandingBalanceCard } from './landing-product-cards'
import { LandingRequestPath } from './landing-request-path'

import '@/styles/lftech-home.css'

interface LandingPageProps {
  isAuthenticated: boolean
}

export function LandingPage(props: LandingPageProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const docsUrl =
    typeof status?.docs_link === 'string' && status.docs_link
      ? status.docs_link
      : 'https://docs.newapi.pro'
  const configuredSalesUrl = import.meta.env.VITE_LFTECH_SALES_URL as
    | string
    | undefined
  const salesUrl =
    configuredSalesUrl &&
    (isHttpUrl(configuredSalesUrl) || configuredSalesUrl.startsWith('mailto:'))
      ? configuredSalesUrl
      : undefined
  const destination = props.isAuthenticated ? '/dashboard' : '/sign-up'
  const action = props.isAuthenticated
    ? t('Go to Dashboard')
    : t('Register and get started')

  return (
    <div className='lf-home'>
      <PublicLayout
        showMainContainer={false}
        showNotifications={false}
        navContent={
          <>
            <Link className='lf-header-link' to='/' hash='integration'>
              {t('Read the integration guide')}
            </Link>
            <Link className='lf-header-link' to='/' hash='models'>
              {t('View models and pricing')}
            </Link>
            <Link className='lf-header-link' to='/' hash='usage'>
              {t('Usage')}
            </Link>
            <Button
              className='lf-primary lf-mobile-registration'
              render={<Link to={destination} />}
            >
              {action}
            </Button>
          </>
        }
        headerProps={{
          className: 'lf-home-header',
          rightContent: (
            <Button
              className='lf-primary lf-header-cta'
              render={<Link to={destination} />}
            >
              {action}
            </Button>
          ),
        }}
      >
        <main id='home-content'>
          <section className='lf-hero' aria-labelledby='lf-hero-title'>
            <img
              className='lf-hero-art'
              src='/images/lftech/api-ribbon.webp'
              alt=''
              width={1672}
              height={941}
              fetchPriority='high'
            />
            <div className='lf-container lf-hero-copy'>
              <h1 id='lf-hero-title'>
                {t('Bring AI model capabilities')}
                <em>{t('into every enterprise idea.')}</em>
              </h1>
              <p>
                {t(
                  'Connect to language models through one API. Manage calls, usage, and account balance in one place.'
                )}
              </p>
              <div className='lf-actions'>
                <Button
                  size='lg'
                  className='lf-primary'
                  render={<Link to={destination} />}
                >
                  {action}
                  <ArrowRight aria-hidden='true' />
                </Button>
                <Button
                  size='lg'
                  variant='link'
                  className='lf-text-link'
                  disabled={!salesUrl}
                  title={!salesUrl ? t('Sales contact coming soon') : undefined}
                  render={<a href={salesUrl} />}
                >
                  {salesUrl
                    ? t('Contact sales')
                    : t('Sales contact coming soon')}
                  {salesUrl && <ArrowRight aria-hidden='true' />}
                </Button>
              </div>
            </div>
          </section>

          <section
            className='lf-container lf-capabilities'
            id='models'
            aria-labelledby='lf-models-title'
          >
            <LandingOpticalRibbon headingId='lf-models-title' />
            <div className='lf-section-heading'>
              <h2 id='lf-models-title'>
                <span className='lf-heading-phrase'>
                  {t('One entry point.')}
                </span>{' '}
                <span className='lf-highlight lf-highlight-green'>
                  {t('More possibilities.')}
                </span>
              </h2>
              <p>
                {t(
                  'Connect to language models through one API. Manage calls, usage, and account balance in one place.'
                )}
              </p>
            </div>
            <div className='lf-capability-grid'>
              <LandingAccessCard />
              <LandingModelExplorer />
              <LandingBalanceCard />
              <article
                className='lf-manage-panel'
                id='usage'
                aria-labelledby='lf-operations-title'
              >
                <h3 id='lf-operations-title'>
                  {t('Keep building.')}
                  <br />
                  {t('Keep usage in sight.')}
                </h3>
                <p className='lf-panel-description'>
                  {t(
                    'From the first request to everyday use, find call history, model usage, and your balance in the customer console.'
                  )}
                </p>
                <LandingConsolePreview />
                <p className='lf-manage-note'>
                  {t(
                    'Track consumption and top up as needed, so you can plan what comes next.'
                  )}
                </p>
              </article>
            </div>
          </section>

          <section
            className='lf-container lf-api-section'
            id='integration'
            aria-labelledby='lf-api-title'
          >
            <LandingOpticalRibbon headingId='lf-api-title' />
            <div className='lf-section-heading'>
              <h2 id='lf-api-title'>
                {t('From request')}{' '}
                <span className='lf-highlight'>{t('to response.')}</span>
              </h2>
              <p>
                {t(
                  'From your application, through our platform, to the model. Explore the API examples to see each request and response.'
                )}
              </p>
            </div>
            <div className='lf-api-stage'>
              <div className='lf-window-bar' aria-hidden='true'>
                <i />
                <i />
                <i />
                <span>API</span>
              </div>
              <LandingRequestPath />
              <HeroTerminalDemo
                className='lf-terminal'
                layout='split'
                autoPlay={false}
              />
              <p className='lf-demo-note'>
                {t(
                  'Illustrative requests and responses. No live API calls or performance claims.'
                )}
              </p>
            </div>
            <div className='lf-onboarding'>
              <ol aria-label={t('Getting started')}>
                <li>
                  <span aria-hidden='true'>1</span>
                  {t('Create an account')}
                </li>
                <li>
                  <span aria-hidden='true'>2</span>
                  {t('Create an API key')}
                </li>
                <li>
                  <span aria-hidden='true'>3</span>
                  {t('Make a model request')}
                </li>
              </ol>
              <Button
                variant='link'
                className='lf-inline-link'
                render={<a href={docsUrl} />}
              >
                {t('Read the integration guide')}
                <ArrowRight aria-hidden='true' />
              </Button>
            </div>
          </section>

          <section
            className='lf-container lf-closing'
            id='start'
            aria-labelledby='lf-closing-title'
          >
            <h2 id='lf-closing-title'>{t('Start with your first request.')}</h2>
            <p>
              {t(
                'Connect to language models through one API. Manage calls, usage, and account balance in one place.'
              )}
            </p>
            <div className='lf-actions' id='contact'>
              <Button
                size='lg'
                className='lf-light-button'
                render={<Link to={destination} />}
              >
                {action}
                <ArrowRight aria-hidden='true' />
              </Button>
              <Button
                variant='link'
                className='lf-light-link'
                disabled={!salesUrl}
                title={!salesUrl ? t('Sales contact coming soon') : undefined}
                render={<a href={salesUrl} />}
              >
                {salesUrl ? t('Contact sales') : t('Sales contact coming soon')}
                {salesUrl && <ArrowRight aria-hidden='true' />}
              </Button>
            </div>
          </section>
        </main>
        <Footer className='lf-home-footer' />
      </PublicLayout>
    </div>
  )
}
