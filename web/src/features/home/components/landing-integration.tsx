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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { HeroTerminalDemo } from './hero-terminal-demo'

interface LandingIntegrationProps {
  docsUrl: string
}

export function LandingIntegration(props: LandingIntegrationProps) {
  const { t } = useTranslation()
  return (
    <section
      className='lf-container lf-integration'
      id='integration'
      aria-labelledby='lf-integration-title'
    >
      <div className='lf-integration-heading'>
        <div>
          <h2 id='lf-integration-title'>
            {t('From exploration to integration.')}
          </h2>
          <p>
            {t(
              'Explore the models, then bring their capabilities into your application.'
            )}
          </p>
        </div>
      </div>
      <div className='lf-integration-content'>
        <div className='lf-onboarding'>
          <h3>{t('Getting started')}</h3>
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
            render={<a href={props.docsUrl} />}
          >
            {t('Read the integration guide')}
            <ArrowRight aria-hidden='true' />
          </Button>
        </div>
        <section className='lf-api-stage' aria-labelledby='lf-api-title'>
          <div className='lf-window-bar'>
            <i aria-hidden='true' />
            <i aria-hidden='true' />
            <i aria-hidden='true' />
            <h3 id='lf-api-title'>
              {t('From request')} {t('to response.')}
            </h3>
          </div>
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
        </section>
      </div>
    </section>
  )
}
