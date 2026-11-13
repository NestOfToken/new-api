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
import { describe, expect, it } from 'vitest'

import type { PricingModel } from '@/features/pricing/types'

import { getLandingModelTypes } from '../lib/model-types'

describe('homepage model types', () => {
  it.each<{
    name: string
    metadata: Partial<PricingModel>
    expected: string[]
  }>([
    {
      name: 'generic chat',
      metadata: { supported_endpoint_types: ['openai'] },
      expected: ['text'],
    },
    {
      name: 'image input is not image generation',
      metadata: { input_modalities: ['image'], output_modalities: ['text'] },
      expected: ['text'],
    },
    {
      name: 'mixed outputs appear in each matching type once',
      metadata: { output_modalities: ['text', 'image', 'image'] },
      expected: ['text', 'image'],
    },
    {
      name: 'output metadata overrides misleading names',
      metadata: { model_name: 'custom-video', output_modalities: ['text'] },
      expected: ['text'],
    },
    {
      name: 'image endpoint',
      metadata: { supported_endpoint_types: ['openai', 'image-generation'] },
      expected: ['image'],
    },
    {
      name: 'video endpoint',
      metadata: { supported_endpoint_types: ['openai-video'] },
      expected: ['video'],
    },
    {
      name: 'video served through a generic protocol',
      metadata: {
        model_name: 'wan3.0-video',
        supported_endpoint_types: ['openai'],
      },
      expected: ['video'],
    },
    {
      name: 'speech output',
      metadata: { model_name: 'tts-1', output_modalities: ['audio'] },
      expected: ['speech'],
    },
    {
      name: 'transcription output',
      metadata: { model_name: 'whisper-1', output_modalities: ['text'] },
      expected: ['transcription'],
    },
    {
      name: 'general audio output',
      metadata: { output_modalities: ['audio'] },
      expected: ['audio'],
    },
    {
      name: 'embeddings endpoint',
      metadata: { supported_endpoint_types: ['openai', 'embeddings'] },
      expected: ['embeddings'],
    },
    {
      name: 'rerank endpoint',
      metadata: { supported_endpoint_types: ['jina-rerank'] },
      expected: ['rerank'],
    },
    {
      name: 'unconfigured type stays unknown',
      metadata: {},
      expected: ['other'],
    },
    {
      name: 'unrecognized output stays unknown',
      metadata: { output_modalities: ['file'] },
      expected: ['other'],
    },
    {
      name: 'substring does not invent a video type',
      metadata: {
        model_name: 'videographer-chat',
        supported_endpoint_types: ['openai'],
      },
      expected: ['text'],
    },
  ])('$name', ({ metadata, expected }) => {
    expect(
      getLandingModelTypes({
        model_name: 'custom-model',
        ...metadata,
      } as PricingModel)
    ).toEqual(expected)
  })
})
