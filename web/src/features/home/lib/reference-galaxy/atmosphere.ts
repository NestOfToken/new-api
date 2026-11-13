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
import { clamp, rgba, seededRandom, type GalaxyPalette } from './layout'

const starRandom = seededRandom(11)
export const GALAXY_STARS = Array.from({ length: 1800 }, () => {
  const angle = starRandom() * Math.PI * 2
  const radius = Math.sqrt(0.09 + starRandom() * (12.96 - 0.09))
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.8,
    size: 0.6 + 1.1 * starRandom(),
    alpha: 0.3 + 0.7 * starRandom(),
    twinkle: starRandom() * Math.PI * 2,
  }
})
const refractionRandom = seededRandom(23)
export const REFRACTION_SAMPLES = Array.from({ length: 120 }, () => ({
  x: refractionRandom(),
  y: refractionRandom(),
  size: 0.6 + 0.5 * refractionRandom(),
  angle: refractionRandom() * Math.PI * 2,
  light: 0.5 + 0.5 * refractionRandom(),
}))

function noiseHash(x: number, y: number) {
  const value = 43758.5453 * Math.sin(127.1 * x + 311.7 * y)
  return value - Math.floor(value)
}
function fractalNoise(x: number, y: number) {
  let sum = 0,
    amplitude = 0.5,
    frequency = 1 / 36
  for (let octave = 0; octave < 4; octave++) {
    const px = x * frequency,
      py = y * frequency
    const ix = Math.floor(px),
      iy = Math.floor(py)
    const fx = (px - ix) ** 2 * (3 - 2 * (px - ix)),
      fy = (py - iy) ** 2 * (3 - 2 * (py - iy))
    const a = noiseHash(ix, iy),
      b = noiseHash(ix + 1, iy),
      c = noiseHash(ix, iy + 1)
    sum +=
      amplitude *
      (a +
        (b - a) * fx +
        (c - a) * fy +
        (a - b - c + noiseHash(ix + 1, iy + 1)) * fx * fy)
    frequency *= 2
    amplitude *= 0.5
  }
  return sum
}

function nebulaTexture(dark: boolean, layer: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 224
  const context = canvas.getContext('2d')
  if (!context) return canvas
  const image = context.createImageData(224, 224)
  let color = layer ? [255, 255, 255] : [116, 128, 152]
  if (dark) color = [252, 252, 254]
  const offsetX = 17 + 61 * layer,
    offsetY = 5 + 37 * layer
  for (let y = 0; y < 224; y++) {
    for (let x = 0; x < 224; x++) {
      const density = clamp(
        (fractalNoise(x + 36 * offsetX, y + 36 * offsetY) -
          (dark ? 0.38 : 0.44)) /
          (dark ? 0.37 : 0.22)
      )
      const detail =
        1 -
        Math.abs(
          2 * fractalNoise(x * 1.6 + 900 + offsetX, y * 1.6 + 400 + offsetY) - 1
        )
      const index = (224 * y + x) * 4
      image.data[index] = color[0]
      image.data[index + 1] = color[1]
      image.data[index + 2] = color[2]
      image.data[index + 3] =
        density ** 2 * (3 - 2 * density) * (0.45 + 0.55 * detail ** 3) * 255
    }
  }
  context.putImageData(image, 0, 0)
  return canvas
}

export class GalaxyAtmosphere {
  private layer = document.createElement('canvas')
  private masked = document.createElement('canvas')
  private textures: HTMLCanvasElement[] = []
  private dark: boolean | undefined
  private puffs: { x: number; y: number; age: number }[] = []

  puff(x: number, y: number) {
    this.puffs.push({ x, y, age: 0 })
    if (this.puffs.length > 4) this.puffs.shift()
  }

  draw(
    target: CanvasRenderingContext2D,
    width: number,
    height: number,
    x: number,
    y: number,
    radius: number,
    squash: number,
    time: number,
    dt: number,
    palette: GalaxyPalette,
    lamp: { x: number; y: number; on: number },
    pixelRatio: number
  ) {
    const context = this.layer.getContext('2d'),
      maskContext = this.masked.getContext('2d')
    if (!context || !maskContext) return
    if (this.dark !== palette.dark) {
      this.dark = palette.dark
      this.textures = [
        nebulaTexture(palette.dark, 0),
        nebulaTexture(palette.dark, 1),
      ]
    }
    const w = Math.ceil((width * pixelRatio) / 2),
      h = Math.ceil((height * pixelRatio) / 2)
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = this.masked.width = w
      this.layer.height = this.masked.height = h
    }
    const scale = w / width
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.globalCompositeOperation = 'source-over'
    context.globalAlpha = 1
    context.clearRect(0, 0, width, height)
    context.save()
    context.translate(x, y)
    context.scale(1, squash)
    context.imageSmoothingQuality = 'high'
    this.textures.forEach((texture, index) => {
      context.save()
      const opacity = palette.dark ? 1 : [0.4, 0.3][index]
      context.globalAlpha =
        opacity * (0.6 + 0.25 * Math.sin(0.19 * time + 3 * index))
      context.rotate(
        (index ? -1 : 1) *
          (0.03 * time +
            0.2 * Math.sin(time * (index ? 0.15 : 0.18) + index * 2)) +
          2.1 * index
      )
      const stretch = 1 + 0.06 * Math.sin(0.21 * time + index)
      context.scale(stretch, stretch)
      context.drawImage(texture, -radius, -radius, radius * 2, radius * 2)
      context.restore()
    })
    const edge = context.createRadialGradient(0, 0, 0, 0, 0, radius)
    for (const [stop, alpha] of [
      [0, 0.15],
      [0.22, 0.7],
      [0.45, 1],
      [0.8, 0.7],
      [1, 0],
    ]) {
      edge.addColorStop(stop, `rgba(0,0,0,${alpha})`)
    }
    context.globalCompositeOperation = 'destination-in'
    context.globalAlpha = 1
    context.fillStyle = edge
    context.fillRect(-radius, -radius, radius * 2, radius * 2)
    context.restore()
    target.save()
    target.setTransform(1, 0, 0, 1, 0, 0)
    target.globalAlpha *= palette.dark ? 0.11 : 1
    target.drawImage(this.layer, 0, 0, width * pixelRatio, height * pixelRatio)
    target.restore()
    const masks: {
      gradient: CanvasGradient
      alpha: number
      puff?: { x: number; y: number; scale: number }
    }[] = []
    if (lamp.on > 0.01) {
      const light = maskContext.createRadialGradient(
        lamp.x,
        lamp.y,
        0,
        lamp.x,
        lamp.y,
        280
      )
      light.addColorStop(0, '#000')
      light.addColorStop(1, 'rgba(0,0,0,0)')
      masks.push({
        gradient: light,
        alpha: lamp.on * (palette.dark ? 0.14 : 0.16),
      })
    }
    this.puffs = this.puffs.filter((puff) => {
      puff.age += dt
      return puff.age < 1.6
    })
    for (const puff of this.puffs) {
      const progress = puff.age / 1.6,
        eased = 1 - (1 - progress) ** 3,
        reach = 30 + 220 * eased
      const mask = maskContext.createRadialGradient(
        puff.x,
        puff.y,
        Math.max(0, reach - 100),
        puff.x,
        puff.y,
        reach + 100
      )
      mask.addColorStop(0, 'rgba(0,0,0,0)')
      mask.addColorStop(0.5, '#000')
      mask.addColorStop(1, 'rgba(0,0,0,0)')
      masks.push({
        gradient: mask,
        alpha: (1 - progress) * 0.1,
        puff: { x: puff.x, y: puff.y, scale: 1 + 0.05 * eased },
      })
    }
    for (const mask of masks) {
      maskContext.setTransform(scale, 0, 0, scale, 0, 0)
      maskContext.globalCompositeOperation = 'source-over'
      maskContext.clearRect(0, 0, width, height)
      maskContext.save()
      if (mask.puff) {
        maskContext.translate(mask.puff.x, mask.puff.y)
        maskContext.scale(mask.puff.scale, mask.puff.scale)
        maskContext.translate(-mask.puff.x, -mask.puff.y)
      }
      maskContext.drawImage(this.layer, 0, 0, width, height)
      maskContext.restore()
      maskContext.globalCompositeOperation = 'destination-in'
      maskContext.fillStyle = mask.gradient
      maskContext.fillRect(0, 0, width, height)
      target.save()
      target.setTransform(1, 0, 0, 1, 0, 0)
      target.globalAlpha = mask.alpha
      target.drawImage(
        this.masked,
        0,
        0,
        width * pixelRatio,
        height * pixelRatio
      )
      target.restore()
    }
  }
}

export function paintMarkBacking(palette: GalaxyPalette) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 384
  const context = canvas.getContext('2d')
  if (!context) return canvas
  context.fillStyle = rgba(palette.background, 1)
  context.fillRect(0, 0, 384, 384)
  const vignette = context.createRadialGradient(192, 192, 0, 192, 192, 192)
  vignette.addColorStop(0, rgba(palette.foreground, palette.dark ? 0.1 : 0.02))
  vignette.addColorStop(1, rgba(palette.foreground, palette.dark ? 0.02 : 0.28))
  context.fillStyle = vignette
  context.fillRect(0, 0, 384, 384)
  const random = seededRandom(7)
  for (let index = 0; index < 160; index++) {
    const angle = random() * Math.PI * 2,
      radius = 384 * (0.12 + 0.36 * Math.sqrt(random()))
    context.fillStyle = rgba(
      palette.foreground,
      (palette.dark ? 0.75 : 0.5) * (1 - (radius / 184.32) * 0.5)
    )
    context.beginPath()
    context.arc(
      192 + Math.cos(angle) * radius,
      192 + Math.sin(angle) * radius,
      (1.4 + 2.6 * random()) * 0.375,
      0,
      Math.PI * 2
    )
    context.fill()
  }
  return canvas
}
