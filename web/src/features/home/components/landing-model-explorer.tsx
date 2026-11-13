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
import { ArrowRight, ArrowUpRight, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatNumber } from '@/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'

import type { LandingCatalog } from '../hooks/use-landing-catalog'

export function LandingModelExplorer(props: {
  catalog: LandingCatalog
  selectedType: string
  onSelectType: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const catalog = props.catalog
  const category = catalog.modelTypes.find(
    (type) => type.id === props.selectedType
  )
  const selected = category?.id ?? 'all'
  const query = props.search.trim().toLocaleLowerCase(catalog.locale)
  const models = (category?.models ?? catalog.models).filter((model) => {
    return (
      !query ||
      `${model.model_name} ${model.vendor_name || t('Other models')}`
        .toLocaleLowerCase(catalog.locale)
        .includes(query)
    )
  })
  let message = t('Explore all available models in the catalog.')
  if (catalog.isLoading) {
    message = t('Loading model catalog...')
  } else if (catalog.error) {
    message = t('Browse the catalog to explore available models.')
  } else if (query) {
    message = t('No matching models. Try another name.')
  }

  return (
    <div className='lf-model-showcase'>
      <div className='lf-showcase-intro'>
        <div>
          <h2 id='lf-models-title'>{t('One platform. Every possibility.')}</h2>
          <p>
            {t(
              'Real models, ready to explore. Find the right fit for your next task.'
            )}
          </p>
        </div>
        <Button
          variant='link'
          className='lf-inline-link'
          render={<Link to='/pricing' />}
        >
          {t('Explore all models')}
          <ArrowUpRight aria-hidden='true' />
        </Button>
      </div>
      <div className='lf-catalog-toolbar'>
        <div className='lf-catalog-search'>
          <Search size={17} aria-hidden='true' />
          <Input
            aria-label={t('Search models or providers')}
            placeholder={t('Search models or providers')}
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
          {props.search && (
            <Button
              variant='ghost'
              size='icon-sm'
              aria-label={t('Clear search')}
              onClick={() => props.onSearchChange('')}
            >
              <X aria-hidden='true' />
            </Button>
          )}
        </div>
      </div>
      <Tabs
        value={selected}
        onValueChange={(value) => {
          props.onSelectType(String(value))
        }}
      >
        <TabsList
          activateOnFocus
          variant='line'
          className='lf-model-type-tabs'
          aria-label={t('Filter by model type')}
        >
          <TabsTrigger value='all'>
            {t('All models')}{' '}
            <span>{formatNumber(catalog.models.length, catalog.locale)}</span>
          </TabsTrigger>
          {catalog.modelTypes.map((type) => (
            <TabsTrigger key={type.id} value={type.id}>
              {type.name}{' '}
              <span>{formatNumber(type.models.length, catalog.locale)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={selected} className='lf-catalog-panel'>
          <div className='lf-model-gallery' aria-busy={catalog.isLoading}>
            {models.length ? (
              <ul
                className='lf-model-card-grid'
                aria-label={t('Models in the catalog')}
              >
                {models.slice(0, 6).map((model) => (
                  <li key={model.model_name}>
                    <Popover modal={false}>
                      <PopoverTrigger
                        render={
                          <Button variant='ghost' className='lf-model-card' />
                        }
                      >
                        <span className='lf-model-card-logo' aria-hidden='true'>
                          {getLobeIcon(
                            model.icon ||
                              model.vendor_icon ||
                              model.vendor_name ||
                              'Other models',
                            27
                          )}
                        </span>
                        <span className='lf-model-card-copy'>
                          <strong>{model.model_name}</strong>
                          <small>
                            {model.vendor_name || t('Other models')}
                          </small>
                        </span>
                        <ArrowUpRight size={16} aria-hidden='true' />
                      </PopoverTrigger>
                      <PopoverContent
                        className='lf-home lf-provider-flyout'
                        sideOffset={10}
                        collisionPadding={{
                          top: 80,
                          right: 16,
                          bottom: 16,
                          left: 16,
                        }}
                      >
                        <div className='lf-provider-flyout-heading'>
                          <div>
                            <PopoverTitle>{model.model_name}</PopoverTitle>
                            <p>{model.vendor_name || t('Other models')}</p>
                          </div>
                          <PopoverClose
                            render={
                              <Button
                                variant='ghost'
                                size='icon-sm'
                                aria-label={t('Close')}
                              />
                            }
                          >
                            <X aria-hidden='true' />
                          </PopoverClose>
                        </div>
                        {model.description && <p>{model.description}</p>}
                        {!!model.context_length && (
                          <p>
                            {t('Context length')}:{' '}
                            {formatNumber(model.context_length, catalog.locale)}
                          </p>
                        )}
                        <Button
                          className='lf-inline-link'
                          variant='link'
                          render={<Link to='/pricing' />}
                        >
                          {t('Open model catalog')}
                          <ArrowRight aria-hidden='true' />
                        </Button>
                      </PopoverContent>
                    </Popover>
                  </li>
                ))}
              </ul>
            ) : (
              <p className='lf-catalog-message' role='status'>
                {message}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
