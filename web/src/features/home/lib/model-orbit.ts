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

/** One camera for the orbit paths, provider controls and model satellites. */
export function projectModelOrbit(
  width: number,
  height: number,
  radius: number,
  angle: number,
  camera: { x: number; y: number },
  elevation = 0
) {
  const x = Math.cos(angle) * radius
  const z = Math.sin(angle) * radius
  return projectModelPosition(width, height, x, z, elevation, camera)
}

/** Project each model independently, including its elevation and camera depth. */
export function projectModelPosition(
  width: number,
  height: number,
  x: number,
  z: number,
  elevation: number,
  camera: { x: number; y: number }
) {
  const compact = width < 700
  const perspective = Math.max(width * 0.95, 650)
  const depth = z * 0.91 - elevation * 0.3
  const scale = perspective / (perspective - depth)
  const roll = -0.075 + camera.x * 0.025
  const planeY = z * (0.29 + camera.y * 0.035) + elevation
  return {
    x: width * (compact ? 0.5 : 0.695) + (x - planeY * roll) * scale,
    y: height * 0.45 + (planeY + x * roll) * scale,
    scale,
    depth,
  }
}

/** Provider clusters occupy separate planes; slow angular drift keeps targets usable. */
export const providerOrbits = [
  { radius: 0.17, angle: -1.9 },
  { radius: 0.28, angle: -1.0 },
  { radius: 0.16, angle: 0.1 },
  { radius: 0.18, angle: 1.8 },
  { radius: 0.15, angle: 3.07 },
  { radius: 0.28, angle: 3.7 },
  { radius: 0.4, angle: 0.95 },
  { radius: 0.45, angle: 2.15 },
  { radius: 0.21, angle: -0.95 },
  { radius: 0.46, angle: -2.6 },
  { radius: 0.49, angle: 0.15 },
  { radius: 0.2, angle: 2.3 },
]
