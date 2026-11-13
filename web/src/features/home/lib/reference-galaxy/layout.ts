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

export interface GalaxyModel {
  slug: string
  name: string
  lab: string
  variant: string | null
  created: number
  weeklyTokens: number
  outputModalities: string[]
  description?: string
}
export interface GalaxyLab {
  key: string
  name: string
  author: string
  image: string
  icon?: string
  darkInvert?: boolean
}
export interface GalaxyCatalog {
  layout?: 'catalog'
  labs: GalaxyLab[]
  models: GalaxyModel[]
  isUsageAvailable: boolean
}
export interface GalaxyCluster extends GalaxyLab {
  count: number
  orbit: number
  theta: number
  radius: number
  depth: number
  worldX: number
  worldY: number
  x: number
  y: number
  rx: number
  ry: number
  highlight: number
}
export interface GalaxyPoint {
  model: GalaxyModel
  cluster: number
  ring: number
  angle: number
  size: number
  luminosity: number
  x: number
  y: number
  scale: number
}
export interface GalaxyPalette {
  foreground: [number, number, number]
  background: [number, number, number]
  accent: [number, number, number]
  dark: boolean
}
export const ORBITS = [0.32, 0.55, 0.75, 0.92, 1.08, 1.24]
export const OUTER_ORBITS = [1.5, 1.9]
export const GALAXY_LIGHT: GalaxyPalette = {
  foreground: [3, 8, 10],
  background: [252, 252, 254],
  accent: [118, 36, 244],
  dark: false,
}
export const GALAXY_DARK: GalaxyPalette = {
  foreground: [252, 252, 254],
  background: [3, 8, 10],
  accent: [200, 255, 0],
  dark: true,
}
export const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value))
export const easeOut = (value: number) => 1 - (1 - value) ** 3
export const easeInOut = (value: number) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2
export const rgba = (color: readonly number[], alpha: number) =>
  `rgba(${color[0]},${color[1]},${color[2]},${alpha})`
export const mixedColor = (
  from: readonly number[],
  to: readonly number[],
  amount: number,
  alpha: number
) =>
  rgba(
    from.map((channel, index) => channel + (to[index] - channel) * amount),
    alpha
  )

export function seededRandom(seed: number) {
  let value = seed
  return () => {
    value = (value * 16807) % 2147483647
    return value / 2147483647
  }
}

/** The reference allocates its five biggest labs to the inner ring. */
export function createGalaxyField(catalog: GalaxyCatalog, now: number) {
  const labs = new Map(catalog.labs.map((lab) => [lab.key, lab]))
  const grouped = new Map<string, GalaxyModel[]>()
  for (const model of catalog.models) {
    if (labs.has(model.lab)) {
      grouped.set(model.lab, [...(grouped.get(model.lab) ?? []), model])
    }
  }
  const sorted = [...grouped.entries()].sort(
    (a, b) => b[1].length - a[1].length
  )
  const remainder = Math.max(0, sorted.length - 5)
  const weights = ORBITS.slice(1)
  const total = weights.reduce((sum, radius) => sum + radius, 0)
  const plan = [
    Math.min(sorted.length, 5),
    ...weights.map((radius) => Math.floor((remainder * radius) / total)),
  ]
  let missing = sorted.length - plan.reduce((sum, count) => sum + count, 0)
  let cursor = plan.length - 1
  while (missing > 0) {
    plan[cursor]++
    missing--
    cursor = cursor > 1 ? cursor - 1 : plan.length - 1
  }
  const clusters: GalaxyCluster[] = []
  const points: GalaxyPoint[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  sorted.forEach(([key, models], index) => {
    const lab = labs.get(key)
    if (!lab) return
    let ring = 0
    let slot = index
    while (ring < plan.length - 1 && slot >= plan[ring]) {
      slot -= plan[ring]
      ring++
    }
    const catalogLayout = catalog.layout === 'catalog' && sorted.length <= 8
    if (catalogLayout) ring = index % ORBITS.length
    clusters.push({
      ...lab,
      count: models.length,
      orbit: ORBITS[ring],
      theta: catalogLayout
        ? [0.18, 1.4, 4.2, 4.7, 2, 1.1][index % ORBITS.length] +
          Math.floor(index / ORBITS.length) * golden
        : ((slot + ((0.618 * ring) % 1)) / (plan[ring] || 1)) * Math.PI * 2,
      radius: Math.max(
        0.016 + 0.011 * Math.sqrt(models.length),
        catalogLayout
          ? Math.min(0.11, 0.055 + 0.012 * Math.sqrt(models.length))
          : 0
      ),
      depth: 1.2 - (index / Math.max(1, sorted.length - 1)) * 0.8,
      worldX: 0,
      worldY: 0,
      x: 0,
      y: 0,
      rx: 0,
      ry: 0,
      highlight: 0,
    })
    const uniformModelSize = catalogLayout ? 2 : 1.1
    models.forEach((model, order) => {
      points.push({
        model,
        cluster: index,
        ring: Math.sqrt((order + 0.5) / models.length),
        angle: order * golden + index,
        size:
          model.weeklyTokens <= 0
            ? uniformModelSize
            : 1.1 +
              2.7 * clamp((Math.log10(model.weeklyTokens) - 5) / 8.6) ** 3.2,
        luminosity:
          model.created <= 0
            ? 0
            : 2 ** (-Math.max(0, now - model.created) / 86400 / 90),
        x: 0,
        y: 0,
        scale: 1,
      })
    })
  })
  return { clusters, points }
}

export function galaxyViewport(width: number, height: number) {
  const wide = width >= 1024
  return {
    wide,
    inclination: wide ? 1.27 : 1,
    x: width * (wide ? 0.68 : 0.5),
    y: height * 0.5,
    radius: wide
      ? Math.min(width * 0.34, height * 0.9)
      : Math.min(width * 0.56, height * 0.8),
    baseZoom: wide ? 1.66 : 1.9,
  }
}

export function projectGalaxy(
  x: number,
  y: number,
  geometry: ReturnType<typeof galaxyViewport>,
  zoom: number,
  panX: number,
  panY: number,
  tilt: number
) {
  const scale = 2.6 / (2.6 + y * Math.sin(tilt))
  return {
    x: geometry.x + x * geometry.radius * scale * zoom + panX,
    y: geometry.y + y * Math.cos(tilt) * geometry.radius * scale * zoom + panY,
    scale,
  }
}

/** Parameterize each perspective ellipse by screen-space arc length. */
export function galaxyArcTables(tilt: number) {
  return new Map(
    ORBITS.map((radius) => {
      const table = new Float32Array(129)
      let distance = 0
      let lastX = 1
      let lastY = 0
      for (let step = 1; step <= 128; step++) {
        const angle = (step / 128) * Math.PI * 2
        const scale = 2.6 / (2.6 + Math.sin(angle) * radius * Math.sin(tilt))
        const x = Math.cos(angle) * scale
        const y = Math.cos(tilt) * Math.sin(angle) * scale
        distance += Math.hypot(x - lastX, y - lastY)
        table[step] = distance
        lastX = x
        lastY = y
      }
      return [radius, table.map((value) => value / distance)]
    })
  )
}

export function galaxyArcAngle(angle: number, table: Float32Array) {
  const normalized = (((angle / (Math.PI * 2)) % 1) + 1) % 1
  let low = 0,
    high = 128
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (table[middle] <= normalized) low = middle
    else high = middle
  }
  return (
    ((low + (normalized - table[low]) / (table[high] - table[low] || 1)) /
      128) *
    Math.PI *
    2
  )
}
