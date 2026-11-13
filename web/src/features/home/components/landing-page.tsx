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
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NavLinkList, PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'

import { useLandingAtmosphere } from '../hooks/use-landing-atmosphere'
import { useLandingCatalog } from '../hooks/use-landing-catalog'
import { LandingIntegration } from './landing-integration'
import { LandingModelExplorer } from './landing-model-explorer'
import { LandingPlatformHero } from './landing-platform-hero'
import { LandingPlatformJourney } from './landing-platform-journey'
import { LandingUpstreamContinuity } from './landing-upstream-continuity'

import '@/styles/lftech-home.css'
import '@/styles/lftech-home-capabilities.css'
import '@/styles/lftech-home-platform.css'
import '@/styles/ruiyuan-home-atmosphere.css'

interface LandingPageProps {
  isAuthenticated: boolean
}

export function LandingPage(props: LandingPageProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const brand = useSystemConfig()
  const [selectedType, setSelectedType] = useState('all')
  const [catalogSearch, setCatalogSearch] = useState('')
  const surface = useRef<HTMLDivElement>(null)
  useLandingAtmosphere(surface)
  const [headerTone, setHeaderTone] = useState({
    navigation: true,
    brand: true,
  })
  const catalog = useLandingCatalog()

  useLayoutEffect(() => {
    const opening = surface.current?.querySelector('.lf-ruiyuan-opening')
    const header = surface.current?.querySelector('.lf-home-header')
    if (!opening || !header) return
    let boundary = 0
    let center = 0
    let brandLag = 0
    let navigation = true
    let inverseBrand = true
    const syncContrast = () => {
      const line = window.scrollY + center
      const nextNavigation = line < boundary
      const nextBrand = line < boundary + brandLag
      if (nextNavigation === navigation && nextBrand === inverseBrand) return
      navigation = nextNavigation
      inverseBrand = nextBrand
      setHeaderTone({ navigation, brand: inverseBrand })
    }
    const measure = () => {
      const offset =
        Number.parseFloat(
          getComputedStyle(opening).getPropertyValue('--lf-header-tone-offset')
        ) || 0
      brandLag =
        Number.parseFloat(
          getComputedStyle(opening).getPropertyValue('--lf-header-brand-lag')
        ) || 0
      boundary =
        opening.getBoundingClientRect().bottom + window.scrollY - offset
      center = header.getBoundingClientRect().height / 2
      syncContrast()
    }
    measure()
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(opening)
    observer?.observe(header)
    window.addEventListener('scroll', syncContrast, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', syncContrast)
      window.removeEventListener('resize', measure)
    }
  }, [])
  const docsUrl =
    typeof status?.docs_link === 'string' && status.docs_link.trim()
      ? status.docs_link.trim()
      : 'https://lftech-api-reference.humanespoon2.chatgpt.site'
  const destination = props.isAuthenticated ? '/dashboard' : '/sign-in'
  const action = props.isAuthenticated
    ? t('Go to Dashboard')
    : t('Sign in / Register')

  return (
    <div
      className='lf-home'
      data-lf-public-surface='home'
      data-header-tone={headerTone.navigation ? 'inverse' : 'default'}
      data-brand-tone={headerTone.brand ? 'inverse' : 'default'}
      ref={surface}
    >
      <PublicLayout
        showMainContainer={false}
        showNotifications={false}
        showAuthButtons={props.isAuthenticated}
        navContent={
          <NavLinkList
            className='lf-header-link'
            links={[
              { title: t('Explore all models'), href: '/pricing' },
              {
                title: t('Read the integration guide'),
                href: docsUrl,
                external: true,
              },
            ]}
          />
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
          <LandingPlatformHero
            catalog={catalog}
            startDestination={destination}
            onSelectProvider={(id) => {
              const provider = catalog.providers.find((item) => item.id === id)
              setSelectedType('all')
              setCatalogSearch(provider?.name ?? '')
            }}
          />

          <section
            className='lf-container lf-capabilities'
            id='models'
            aria-labelledby='lf-models-title'
          >
            <LandingModelExplorer
              catalog={catalog}
              selectedType={selectedType}
              onSelectType={setSelectedType}
              search={catalogSearch}
              onSearchChange={setCatalogSearch}
            />
          </section>

          <LandingUpstreamContinuity
            logo={brand.logo}
            name={brand.systemName}
          />
          <LandingPlatformJourney />
          <LandingIntegration docsUrl={docsUrl} />
        </main>
        <Footer
          className='lf-home-footer'
          description={t('More models. One place to build.')}
        />
      </PublicLayout>
    </div>
  )
}
