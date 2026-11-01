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
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { isHttpUrl } from '@/lib/content-format'

import { HeroTerminalDemo } from './hero-terminal-demo'
import { LandingConsolePreview } from './landing-console-preview'

import '@/styles/lftech-home.css'

interface LandingPageProps {
  isAuthenticated: boolean
}

export function LandingPage(props: LandingPageProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const root = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    const element = root.current
    if (!element || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          entry.target.classList.toggle('lf-in-view', entry.isIntersecting)
        }
      },
      { threshold: 0.15 }
    )
    for (const target of element.querySelectorAll('[data-home-motion]')) {
      observer.observe(target)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div className='lf-home' ref={root}>
      <PublicLayout
        showMainContainer={false}
        showNotifications={false}
        navContent={
          <>
            <Link className='lf-header-link' to='/' hash='models'>
              {t('View models and pricing')}
            </Link>
            <Link className='lf-header-link' to='/' hash='integration'>
              {t('Read the integration guide')}
            </Link>
            <Link className='lf-header-link' to='/' hash='usage'>
              {t('Usage')}
            </Link>
          </>
        }
        headerProps={{
          className: 'lf-home-header',
          rightContent: (
            <Button className='lf-primary' render={<Link to={destination} />}>
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
                <br />
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
            className='lf-container lf-api-section'
            aria-labelledby='lf-api-title'
          >
            <div className='lf-api' data-home-motion>
              <div className='lf-api-story'>
                <h2 id='lf-api-title'>
                  {t('From request')}
                  <br />
                  {t('to response.')}
                </h2>
                <p>
                  {t(
                    'From your application, through our platform, to the model. Explore the API examples to see each request and response.'
                  )}
                </p>
                <div
                  className='lf-request-path'
                  aria-label={t('API request path')}
                >
                  <span>{t('Your application')}</span>
                  <i />
                  <span>{t('Linfei platform')}</span>
                  <i />
                  <span>{t('Model')}</span>
                </div>
                <small>
                  {t(
                    'Illustrative requests and responses. No live API calls or performance claims.'
                  )}
                </small>
              </div>
              <HeroTerminalDemo
                className='lf-terminal'
                layout='split'
                autoPlay={false}
              />
              <div className='lf-onboarding' id='integration'>
                <ol aria-label={t('Getting started')}>
                  <li>{t('Create an account')}</li>
                  <li>{t('Create an API key')}</li>
                  <li>{t('Make a model request')}</li>
                </ol>
                <Button variant='link' render={<a href={docsUrl} />}>
                  {t('Read the integration guide')}
                  <ArrowRight aria-hidden='true' />
                </Button>
              </div>
            </div>
          </section>

          <section
            className='lf-models'
            id='models'
            aria-labelledby='lf-models-title'
          >
            <div className='lf-container'>
              <h2 id='lf-models-title'>
                {t('Choose models.')}
                <br />
                {t('Connect your business.')}
              </h2>
              <p className='lf-lead'>
                {t(
                  'Explore models and prices for your application. Availability follows the current model catalog.'
                )}
              </p>
              <div className='lf-model-layout'>
                <div className='lf-model-intro'>
                  <h3>
                    {t('One entry point.')}
                    <br />
                    {t('More possibilities.')}
                  </h3>
                  <Button
                    variant='link'
                    className='lf-text-link'
                    render={<Link to='/pricing' />}
                  >
                    {t('View models and pricing')}
                    <ArrowRight aria-hidden='true' />
                  </Button>
                </div>
                <div className='lf-model-list'>
                  <article data-home-motion>
                    <h3>{t('Content and answers')}</h3>
                    <p>
                      {t(
                        'Choose models for content generation, information processing, and question answering.'
                      )}
                    </p>
                  </article>
                  <article data-home-motion>
                    <h3>{t('Understanding and analysis')}</h3>
                    <p>
                      {t(
                        'Explore models and integration options that fit your tasks.'
                      )}
                    </p>
                  </article>
                  <article data-home-motion>
                    <h3>{t('Choose as you need')}</h3>
                    <p>
                      {t('Find model availability and pricing in the catalog.')}
                    </p>
                  </article>
                </div>
              </div>
            </div>
          </section>

          <section
            className='lf-operations'
            id='usage'
            aria-labelledby='lf-operations-title'
          >
            <div className='lf-container lf-operations-layout'>
              <div id='start'>
                <h2 id='lf-operations-title'>
                  {t('Keep building.')}
                  <br />
                  {t('Keep usage in sight.')}
                </h2>
                <p>
                  {t(
                    'From the first request to everyday use, find call history, model usage, and your balance in the customer console.'
                  )}
                </p>
                <p>
                  {t(
                    'Track consumption and top up as needed, so you can plan what comes next.'
                  )}
                </p>
                <div className='lf-actions' id='contact'>
                  <Button
                    size='lg'
                    className='lf-light-button'
                    render={<Link to={destination} />}
                  >
                    {action}
                  </Button>
                  <Button
                    variant='link'
                    className='lf-light-link'
                    disabled={!salesUrl}
                    title={
                      !salesUrl ? t('Sales contact coming soon') : undefined
                    }
                    render={<a href={salesUrl} />}
                  >
                    {salesUrl
                      ? t('Contact sales')
                      : t('Sales contact coming soon')}
                    {salesUrl && <ArrowRight aria-hidden='true' />}
                  </Button>
                </div>
              </div>
              <LandingConsolePreview />
            </div>
          </section>
        </main>
        <Footer className='lf-home-footer' />
      </PublicLayout>
    </div>
  )
}
