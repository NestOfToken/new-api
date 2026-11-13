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
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { SystemBrand } from '@/components/layout/components/system-brand'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'

import { RibbonPlaybackButton } from '../../components/public-ribbon-provider'
import { SignInGalaxy } from './sign-in-galaxy'

export function SignInLayout(props: { children: ReactNode; heading?: string }) {
  const { t } = useTranslation()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Focus the page heading without opening a mobile keyboard or delaying input for the animation.
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <main className='lf-sign-in' data-lf-public-surface='sign-in'>
      <div className='lf-sign-in-brand'>
        <SystemBrand variant='inline' />
      </div>
      <div className='lf-sign-in-toolbar'>
        <LanguageSwitcher />
        <ThemeSwitch />
        <Button
          role='link'
          aria-label={t('Back to home')}
          variant='link'
          className='lf-sign-in-back'
          render={<Link to='/' />}
        >
          <ArrowLeft aria-hidden='true' />
          <span>{t('Back to home')}</span>
        </Button>
      </div>
      <section
        className='lf-sign-in-art'
        aria-label={t('Bring AI model capabilities')}
      >
        <SignInGalaxy />
        <div className='lf-sign-in-story'>
          <h2 className='lf-public-headline'>
            {t('Bring AI model capabilities')}
            <em>{t('into every enterprise idea.')}</em>
          </h2>
          <p>
            {t(
              'Connect to language models through one API. Manage calls, usage, and account balance in one place.'
            )}
          </p>
        </div>
        <RibbonPlaybackButton />
      </section>
      <section
        className='lf-sign-in-panel'
        aria-labelledby='lf-sign-in-heading'
      >
        <div className='lf-sign-in-form'>
          <h1 id='lf-sign-in-heading' ref={headingRef} tabIndex={-1}>
            {props.heading ?? t('Welcome back!')}
          </h1>
          {props.children}
        </div>
      </section>
    </main>
  )
}
