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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { LandingPlatformDemo } from './landing-platform-demo'

export function LandingPlatformJourney() {
  const { t } = useTranslation()
  const [scene, setScene] = useState('stability')
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    let observer: IntersectionObserver | undefined
    const observeStories = () => {
      observer?.disconnect()
      observer = new IntersectionObserver(
        (entries) => {
          if (window.matchMedia('(max-width: 900px)').matches) return
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const value = (entry.target as HTMLElement).dataset.journeyStep
              if (value) setScene(value)
            }
          }
        },
        {
          rootMargin: `-${Math.round(window.innerHeight * 0.48)}px 0px -${Math.round(window.innerHeight * 0.48)}px 0px`,
          threshold: 0,
        }
      )
      const currentObserver = observer
      section.current
        ?.querySelectorAll('[data-journey-step]')
        .forEach((step) => currentObserver.observe(step))
    }
    observeStories()
    window.addEventListener('resize', observeStories)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', observeStories)
    }
  }, [])

  return (
    <section
      id='capabilities'
      className='lf-platform-journey'
      ref={section}
      aria-labelledby='lf-platform-title'
    >
      <div className='lf-container'>
        <div className='lf-journey-heading'>
          <h2 id='lf-platform-title'>{t('Built around your business.')}</h2>
          <p>
            {t(
              'From model discovery to everyday operations. A platform that moves with you.'
            )}
          </p>
        </div>
        <div className='lf-journey-layout'>
          <div className='lf-journey-stories'>
            <article
              data-journey-step='stability'
              data-current={scene === 'stability'}
            >
              <h3>{t('Stable when it matters.')}</h3>
              <p>
                {t(
                  'Elastic resource scaling supports high availability as business demand changes.'
                )}
              </p>
            </article>
            <article data-journey-step='usage' data-current={scene === 'usage'}>
              <h3>
                {t('Use what you need.')} {t('Grow at your own pace.')}
              </h3>
              <p>
                {t(
                  'Adjust usage to your actual needs, from early exploration to everyday business.'
                )}
              </p>
            </article>
          </div>
          <div className='lf-journey-visual'>
            <Tabs
              value={scene}
              onValueChange={(value) => setScene(String(value))}
            >
              <TabsList
                activateOnFocus
                className='lf-journey-tabs'
                aria-label={t('Explore the platform')}
              >
                <TabsTrigger value='stability'>{t('Stability')}</TabsTrigger>
                <TabsTrigger value='usage'>{t('Flexible usage')}</TabsTrigger>
              </TabsList>
              {['stability', 'usage'].map((value) => (
                <TabsContent value={value} key={value}>
                  <LandingPlatformDemo scene={value} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
      </div>
    </section>
  )
}
