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
import {
  CanvasTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'

import { paintMarkBacking } from './atmosphere'
import type { GalaxyPalette } from './layout'
import { REFERENCE_MARK_PATH } from './shape'

// Geometric silhouette of the reference mark, supplied in the owner's reference.
export const MARK_BACKING_RATIO = 4.2 / (13 * Math.tan((14 * Math.PI) / 180))
export interface GalaxyMarkFrame {
  pixels: number
  time: number
  faceX: number
  faceY: number
  spinX: number
  spinY: number
  palette: GalaxyPalette
  paint: (context: CanvasRenderingContext2D, size: number) => void
}
export interface GalaxyMark {
  canvas: HTMLCanvasElement
  render: (frame: GalaxyMarkFrame) => void
  dispose: () => void
}
export interface GalaxyMarkShape {
  path: string
  bevel?: number
  scale?: number
}

/** Refractive dielectric, with the actual scene behind the transmission buffer. */
export function createGalaxyMark(shape?: GalaxyMarkShape): GalaxyMark {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  const renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    failIfMajorPerformanceCaveat: true,
  })
  renderer.setPixelRatio(1)
  renderer.transmissionResolutionScale = 0.5
  renderer.toneMapping = NeutralToneMapping
  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.02)
  scene.environment = environment.texture
  room.dispose()
  const camera = new PerspectiveCamera(28, 1, 0.1, 20)
  camera.position.set(0, 0, 5.4)
  const material = new MeshPhysicalMaterial({
    transmission: 1,
    thickness: 1.4,
    ior: 2,
    roughness: 0.02,
    color: 0xffffff,
    attenuationColor: 0xf2f6ff,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    iridescence: 0.2,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
    attenuationDistance: 2.5,
    specularIntensity: 1,
    envMapIntensity: 1.5,
    dispersion: 24,
    transparent: true,
    opacity: 0.72,
  })
  const svg = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 424"><path fill="#000" fill-rule="evenodd" d="${shape?.path ?? REFERENCE_MARK_PATH}"/></svg>`
  )
  const extruded = new ExtrudeGeometry(
    svg.paths.flatMap((path) => path.toShapes()),
    {
      depth: 0.3 * 424,
      curveSegments: 64,
      bevelEnabled: true,
      bevelThickness: (shape?.bevel ?? 0.06) * 424,
      bevelSize: (shape?.bevel ?? 0.06) * 424,
      bevelOffset: -(shape?.bevel ?? 0.06) * 424,
      bevelSegments: 12,
    }
  )
  const geometry = toCreasedNormals(extruded, Math.PI / 6)
  if (geometry !== extruded) extruded.dispose()
  const scale = (shape?.scale ?? 1) / 424
  geometry.scale(scale, scale, scale)
  geometry.rotateX(Math.PI)
  geometry.center()
  const body = new Mesh(geometry, material)
  scene.add(body)
  const backing = document.createElement('canvas')
  backing.width = backing.height = 384
  const backingContext = backing.getContext('2d')
  const texture = new CanvasTexture(backing)
  texture.colorSpace = SRGBColorSpace
  const planeMaterial = new MeshBasicMaterial({
    map: texture,
    toneMapped: false,
  })
  const plane = new Mesh(new PlaneGeometry(4.2, 4.2), planeMaterial)
  plane.position.z = -1.1
  plane.onBeforeRender = (activeRenderer) =>
    plane.geometry.setDrawRange(
      0,
      activeRenderer.getRenderTarget() ? Infinity : 0
    )
  scene.add(plane)
  const key = new PointLight(0xffffff, 6, 10)
  key.position.set(1.8, 1.6, 3.4)
  const fill = new PointLight(0xffffff, 3, 10)
  fill.position.set(-2, -1, 3)
  const rim = new DirectionalLight(0xffffff, 1.5)
  rim.position.set(-3, 1, -2)
  scene.add(key, fill, rim)
  let dark: boolean | undefined
  let base: HTMLCanvasElement | undefined
  let size = 0,
    frames = 0
  return {
    canvas,
    render(frame) {
      const nextSize = Math.max(64, 64 * Math.ceil(frame.pixels / 64))
      if (size !== nextSize) {
        size = nextSize
        renderer.setSize(size, size, false)
      }
      if (frame.palette.dark !== dark) {
        dark = frame.palette.dark
        base = paintMarkBacking(frame.palette)
        backingContext?.drawImage(base, 0, 0)
        texture.needsUpdate = true
        material.attenuationColor.set(dark ? 0xf2f6ff : 0xd6dde8)
        material.attenuationDistance = dark ? 3 : 1.3
        material.opacity = dark ? 0.88 : 0.96
        material.envMapIntensity = dark ? 1.6 : 1.2
        key.intensity = dark ? 5 : 3
        fill.intensity = dark ? 2 : 1.2
        rim.intensity = dark ? 2 : 0.8
      }
      const turn = frame.time * 0.5
      body.rotation.set(
        0.04 + frame.faceY * 0.3 + frame.spinX,
        -0.06 + frame.faceX * 0.5 + Math.cos(turn) * 0.14 + frame.spinY,
        Math.sin(turn) * 0.08
      )
      frames++
      if (base && backingContext && frames % 2 === 0) {
        backingContext.drawImage(base, 0, 0)
        frame.paint(backingContext, 384)
        texture.needsUpdate = true
      }
      renderer.render(scene, camera)
    },
    dispose() {
      texture.dispose()
      planeMaterial.dispose()
      plane.geometry.dispose()
      geometry.dispose()
      material.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    },
  }
}
