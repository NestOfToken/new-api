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
import {
  ArrowRight,
  MessageSquare,
  ScanText,
  SlidersHorizontal,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export function LandingModelExplorer() {
  const { t } = useTranslation()
  return (
    <article className='lf-model-panel'>
      <h3>
        {t('Choose models.')}
        <br />
        {t('Connect your business.')}
      </h3>
      <p className='lf-panel-description'>
        {t(
          'Explore models and prices for your application. Availability follows the current model catalog.'
        )}
      </p>
      <Tabs defaultValue='content' className='lf-model-explorer'>
        <TabsList className='lf-model-tabs' aria-label={t('Application needs')}>
          <TabsTrigger value='content'>{t('Content and answers')}</TabsTrigger>
          <TabsTrigger value='analysis'>
            {t('Understanding and analysis')}
          </TabsTrigger>
          <TabsTrigger value='choice'>{t('Choose as you need')}</TabsTrigger>
        </TabsList>
        <TabsContent value='content' className='lf-task-panel'>
          <MessageSquare className='lf-task-icon' aria-hidden='true' />
          <p>
            {t(
              'Choose models for content generation, information processing, and question answering.'
            )}
          </p>
        </TabsContent>
        <TabsContent value='analysis' className='lf-task-panel'>
          <ScanText className='lf-task-icon' aria-hidden='true' />
          <p>
            {t('Explore models and integration options that fit your tasks.')}
          </p>
        </TabsContent>
        <TabsContent value='choice' className='lf-task-panel'>
          <SlidersHorizontal className='lf-task-icon' aria-hidden='true' />
          <p>{t('Find model availability and pricing in the catalog.')}</p>
        </TabsContent>
      </Tabs>
      <Button
        variant='link'
        className='lf-inline-link'
        render={<Link to='/pricing' />}
      >
        {t('View models and pricing')}
        <ArrowRight aria-hidden='true' />
      </Button>
    </article>
  )
}
