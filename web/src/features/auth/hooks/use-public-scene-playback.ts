/* Copyright (C) 2023-2026 QuantumNous. SPDX-License-Identifier: AGPL-3.0-or-later */
import { createContext, useContext } from 'react'

import type { PublicGalaxyAnchor } from '../lib/public-galaxy-transfer'

export const PublicScenePlayback = createContext<{
  paused: boolean
  toggle: () => void
  register?: (anchor: PublicGalaxyAnchor) => () => void
  dismiss?: () => void
}>({
  paused: false,
  toggle: () => {},
})
export const usePublicScenePlayback = () => useContext(PublicScenePlayback)
