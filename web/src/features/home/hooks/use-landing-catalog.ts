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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import type { PricingModel } from '@/features/pricing/types'
import { toIntlLocale } from '@/i18n/languages'

import { getLandingModelTypes, type LandingModelType } from '../lib/model-types'

export interface LandingProvider {
  id: string
  name: string
  icon?: string
  models: PricingModel[]
}

export function useLandingCatalog() {
  const catalog = usePricingData()
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const providers = useMemo(() => {
    const groups = new Map<string, LandingProvider>()
    const names = new Set<string>()
    for (const model of catalog.models) {
      if (!model.model_name.trim() || names.has(model.model_name)) continue
      names.add(model.model_name)
      const assigned = model.vendor_id !== undefined && !!model.vendor_name
      const id = assigned ? String(model.vendor_id) : 'other'
      let provider = groups.get(id)
      if (!provider) {
        provider = {
          id,
          name: model.vendor_name || t('Other models'),
          icon: assigned ? model.vendor_icon : undefined,
          models: [],
        }
        groups.set(id, provider)
      }
      provider.models.push(model)
    }
    for (const provider of groups.values()) {
      provider.models.sort((a, b) =>
        a.model_name.localeCompare(b.model_name, locale, { numeric: true })
      )
    }
    return [...groups.values()].sort((a, b) => {
      if (a.id === 'other') return 1
      if (b.id === 'other') return -1
      return a.name.localeCompare(b.name, locale)
    })
  }, [catalog.models, locale, t])
  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  )
  const modelTypes = useMemo(() => {
    const groups = new Map<LandingModelType, PricingModel[]>()
    for (const model of models) {
      for (const type of getLandingModelTypes(model)) {
        const group = groups.get(type) ?? []
        group.push(model)
        groups.set(type, group)
      }
    }
    return [
      { id: 'text', name: t('Text') },
      { id: 'image', name: t('Image') },
      { id: 'video', name: t('Video') },
      { id: 'speech', name: t('Speech') },
      { id: 'transcription', name: t('Transcription') },
      { id: 'embeddings', name: t('Embeddings') },
      { id: 'rerank', name: t('Rerank') },
      { id: 'audio', name: t('Audio') },
      { id: 'other', name: t('Other') },
    ]
      .map((type) => ({
        ...type,
        models: groups.get(type.id as LandingModelType) ?? [],
      }))
      .filter((type) => type.models.length > 0)
  }, [models, t])
  return { ...catalog, models, providers, modelTypes, locale }
}

export type LandingCatalog = ReturnType<typeof useLandingCatalog>
