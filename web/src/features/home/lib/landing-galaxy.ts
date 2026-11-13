/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import type { LandingProvider } from '../hooks/use-landing-catalog'
import type { GalaxyCatalog, GalaxyPalette } from './reference-galaxy/layout'

const nightSky: GalaxyPalette = {
  background: [5, 12, 27],
  foreground: [218, 233, 255],
  accent: [105, 177, 255],
  dark: true,
}
export const RUIYUAN_GALAXY_PALETTE = { light: nightSky, dark: nightSky }

export function createLandingGalaxyCatalog(
  providers: LandingProvider[]
): GalaxyCatalog {
  return {
    labs: providers.map((provider) => ({
      key: provider.id,
      author: provider.id,
      name: provider.name,
      icon: provider.icon,
      image: '',
    })),
    models: providers.flatMap((provider) =>
      provider.models.map((model) => ({
        slug: model.model_name,
        name: model.model_name,
        description: model.description,
        lab: provider.id,
        variant: null,
        created: 0,
        weeklyTokens: 0,
        outputModalities: [],
      }))
    ),
    isUsageAvailable: false,
    layout: 'catalog',
  }
}
