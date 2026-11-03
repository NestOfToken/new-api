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

import { Button } from '@/components/ui/button'

import { LandingRequestPath } from './landing-request-path'

export function LandingAccessCard() {
  const { t } = useTranslation()
  return (
    <article className='lf-product-card lf-access-card'>
      <h3>{t('API Access')}</h3>
      <p className='lf-card-description'>
        {t(
          'From your application, through our platform, to the model. Explore the API examples to see each request and response.'
        )}
      </p>
      <div className='lf-card-diagram'>
        <LandingRequestPath />
      </div>
      <Button
        variant='link'
        className='lf-card-link'
        render={<Link to='/' hash='integration' />}
      >
        {t('View details')}
        <ArrowRight aria-hidden='true' />
      </Button>
    </article>
  )
}

export function LandingBalanceCard() {
  const { t } = useTranslation()
  return (
    <article className='lf-product-card lf-balance-card'>
      <h3>{t('Top up as needed')}</h3>
      <p className='lf-card-description'>
        {t(
          'Track consumption and top up as needed, so you can plan what comes next.'
        )}
      </p>
      <div className='lf-account-flow' aria-hidden='true'>
        <span className='lf-account-label'>{t('Available Balance')}</span>
        <span className='lf-account-currency'>¥</span>
        <img
          src='/brand-mark.svg'
          alt=''
          width={160}
          height={160}
          loading='lazy'
        />
      </div>
      <Button
        variant='link'
        className='lf-card-link'
        render={<Link to='/' hash='usage' />}
      >
        {t('View details')}
        <ArrowRight aria-hidden='true' />
      </Button>
    </article>
  )
}
