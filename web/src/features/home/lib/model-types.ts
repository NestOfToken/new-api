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
import type { PricingModel } from '@/features/pricing/types'

export type LandingModelType =
  | 'text'
  | 'image'
  | 'video'
  | 'speech'
  | 'transcription'
  | 'embeddings'
  | 'rerank'
  | 'audio'
  | 'other'

/** Catalog output metadata wins; protocol and explicit media identifiers fill gaps. */
export function getLandingModelTypes(model: PricingModel): LandingModelType[] {
  const endpoints = new Set(model.supported_endpoint_types ?? [])
  if (endpoints.has('embeddings')) return ['embeddings']
  if (endpoints.has('jina-rerank')) return ['rerank']

  const name = model.model_name.toLowerCase()
  const speech =
    endpoints.has('audio-speech') ||
    /(?:^|[/_.-])(?:tts|speech)(?:\d|[/_.-]|$)/.test(name)
  const transcription =
    endpoints.has('audio-transcription') ||
    /(?:^|[/_.-])(?:whisper|transcription|transcribe)(?:\d|[/_.-]|$)/.test(name)
  if (model.output_modalities?.length) {
    const types = new Set<LandingModelType>()
    for (const modality of model.output_modalities) {
      if (modality === 'text') {
        types.add(transcription ? 'transcription' : 'text')
      } else if (modality === 'audio') {
        types.add(speech ? 'speech' : 'audio')
      } else if (modality === 'image' || modality === 'video') {
        types.add(modality)
      }
    }
    return types.size ? [...types] : ['other']
  }

  const types = new Set<LandingModelType>()
  if (endpoints.has('image-generation')) types.add('image')
  if (endpoints.has('openai-video')) types.add('video')
  if (speech) types.add('speech')
  if (transcription) types.add('transcription')
  if (types.size) return [...types]

  // Some existing catalog entries expose only a generic chat protocol.
  // Match explicit type tokens, never provider identity or input-only vision.
  if (/(?:^|[/_.-])video(?:\d|[/_.-]|$)/.test(name)) return ['video']
  if (/(?:^|[/_.-])(?:image|dall-e)(?:\d|[/_.-]|$)/.test(name)) return ['image']
  if (/(?:^|[/_.-])(?:embedding|embeddings|embed)(?:\d|[/_.-]|$)/.test(name)) {
    return ['embeddings']
  }
  if (/(?:^|[/_.-])rerank(?:\d|[/_.-]|$)/.test(name)) return ['rerank']
  if (/(?:^|[/_.-])audio(?:\d|[/_.-]|$)/.test(name)) return ['audio']
  if (
    ['openai', 'openai-response', 'anthropic', 'gemini'].some((endpoint) =>
      endpoints.has(endpoint)
    )
  ) {
    return ['text']
  }
  return ['other']
}
