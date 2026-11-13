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
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  ExtrudeGeometry,
  EquirectangularReflectionMapping,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  Shape,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'

export interface ModelCoreRenderer {
  render: (phase: number, pointer: { x: number; y: number }) => void
  resize: (size: number) => void
  dispose: () => void
}

/** The existing brand-mark.svg silhouette, extruded with rounded metal edges. */
export function createModelCoreRenderer(host: HTMLElement): ModelCoreRenderer {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95
  renderer.domElement.setAttribute('aria-hidden', 'true')
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  const camera = new OrthographicCamera(-2.6, 2.6, 2.6, -2.6, 0.1, 30)
  camera.position.set(0, 0, 8)
  // A large photographic-studio reflection field, authored as geometry's lighting.
  // Broad panels become cool highlights across the curved face, not just its rim.
  const studio = document.createElement('canvas')
  studio.width = 1024
  studio.height = 512
  const painting = studio.getContext('2d')
  if (!painting) {
    renderer.dispose()
    renderer.domElement.remove()
    throw new Error('Studio lighting canvas unavailable')
  }
  const panels = painting.createLinearGradient(0, 0, 1024, 0)
  for (const [stop, color] of [
    [0, '#b9c3d4'],
    [0.16, '#ffffff'],
    [0.26, '#d9e6f2'],
    [0.37, '#424957'],
    [0.47, '#f5f7ff'],
    [0.6, '#ffffff'],
    [0.65, '#8395ac'],
    [0.69, '#f5faff'],
    [0.76, '#6887aa'],
    [0.81, '#d9e8f8'],
    [0.85, '#91a6c5'],
    [0.9, '#ffffff'],
    [0.95, '#c4b5ca'],
    [1, '#e7f0fa'],
  ] as const) {
    panels.addColorStop(stop, color)
  }
  painting.fillStyle = panels
  painting.fillRect(0, 0, 1024, 512)
  const ceiling = painting.createLinearGradient(0, 0, 0, 512)
  ceiling.addColorStop(0, '#f4f9ff')
  ceiling.addColorStop(0.28, '#f5f7ff')
  ceiling.addColorStop(0.39, '#93acca')
  ceiling.addColorStop(0.46, '#e3edfa')
  ceiling.addColorStop(0.53, '#829dbf')
  ceiling.addColorStop(0.59, '#cdbbce')
  ceiling.addColorStop(0.67, '#e6f3fb')
  ceiling.addColorStop(1, '#c8d4e4')
  painting.globalCompositeOperation = 'multiply'
  painting.fillStyle = ceiling
  painting.fillRect(0, 0, 1024, 512)
  const studioTexture = new CanvasTexture(studio)
  studioTexture.mapping = EquirectangularReflectionMapping
  studioTexture.colorSpace = SRGBColorSpace
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromEquirectangular(studioTexture)
  scene.environment = environment.texture
  studioTexture.dispose()
  pmrem.dispose()
  const key = new DirectionalLight(0xe6edff, 0.6)
  key.position.set(-3, 4, 5)
  scene.add(key)
  const rim = new DirectionalLight(0xc8c1ef, 0.45)
  rim.position.set(3, -2, 2)
  scene.add(rim)

  const material = new MeshPhysicalMaterial({
    color: 0xe4e9f0,
    metalness: 1,
    roughness: 0.25,
    iridescence: 0.18,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [180, 350],
    clearcoat: 0.5,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.95,
  })
  const frame = new Shape()
  frame.moveTo(18.5, 16)
  frame.lineTo(18.5, 45.5)
  frame.lineTo(48, 45.5)
  frame.absarc(48, 48, 2.5, -Math.PI / 2, Math.PI / 2, false)
  frame.lineTo(16, 50.5)
  frame.quadraticCurveTo(13.5, 50.5, 13.5, 48)
  frame.lineTo(13.5, 16)
  frame.absarc(16, 16, 2.5, Math.PI, 0, false)
  frame.closePath()
  const arrow = new Shape()
  arrow.moveTo(32, 13.5)
  arrow.lineTo(48, 13.5)
  arrow.quadraticCurveTo(50.5, 13.5, 50.5, 16)
  arrow.lineTo(50.5, 32)
  arrow.absarc(48, 32, 2.5, 0, Math.PI, false)
  arrow.lineTo(45.5, 22.04)
  arrow.lineTo(27.768, 39.768)
  arrow.absarc(26, 38, 2.5, Math.PI / 4, (Math.PI * 5) / 4, false)
  arrow.lineTo(41.96, 18.5)
  arrow.lineTo(32, 18.5)
  arrow.absarc(32, 16, 2.5, Math.PI / 2, (Math.PI * 3) / 2, false)
  arrow.closePath()
  const geometry = new ExtrudeGeometry([frame, arrow], {
    depth: 5.5,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 2.2,
    bevelSize: 2.1,
    bevelSegments: 8,
    curveSegments: 12,
  })
  geometry.translate(-32, -32, -2.75)
  geometry.scale(0.068, 0.068, 0.068)
  // Bow the cast surface gently: even the broad faces reflect different panels.
  // Transform normals with the surface Jacobian to keep the reflection continuous.
  const positions = geometry.getAttribute('position')
  const normals = geometry.getAttribute('normal')
  const normal = new Vector3()
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index)
    const y = positions.getY(index)
    positions.setZ(index, positions.getZ(index) + 0.15 * (x * x + y * y))
    normal
      .set(
        normals.getX(index) - normals.getZ(index) * 0.3 * x,
        normals.getY(index) - normals.getZ(index) * 0.3 * y,
        normals.getZ(index)
      )
      .normalize()
    normals.setXYZ(index, normal.x, normal.y, normal.z)
  }
  geometry.computeBoundingSphere()
  const mark = new Group()
  const body = new Mesh(geometry, material)
  // Mirror the SVG Y axis on the object, so the renderer also reverses frontFace.
  // Mirroring BufferGeometry alone reverses winding but leaves its normals behind.
  body.scale.y = -1
  mark.add(body)
  scene.add(mark)
  host.dataset.rendered = 'true'

  return {
    render(phase, pointer) {
      mark.rotation.set(
        -0.16 + Math.sin(phase * 0.6) * 0.035 + pointer.y * 0.07,
        -0.35 + Math.sin(phase * 0.45) * 0.08 + pointer.x * 0.1,
        0.11 + Math.sin(phase * 0.35) * 0.025
      )
      mark.position.y = Math.sin(phase * 0.75) * 0.065
      renderer.render(scene, camera)
    },
    resize(size) {
      renderer.setSize(size, size)
    },
    dispose() {
      delete host.dataset.rendered
      geometry.dispose()
      material.dispose()
      environment.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
