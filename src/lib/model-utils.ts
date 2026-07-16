export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const GROK_IMAGE_MODEL_IDS = new Set([
  'grok-imagine',
  'grok-imagine-image',
  'grok-imagine-image-quality',
  'grok-imagine-edit',
])

export const GROK_VIDEO_MODEL_IDS = new Set([
  'grok-imagine-video',
  'grok-imagine-video-1.5',
])

export type ModelCapability = 'chat' | 'vision' | 'image_generation' | 'video_generation'

export type ByokModel = {
  id: string
  name: string
  ownedBy?: string
  contextLength?: number
  raw?: unknown
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => typeof item === 'string' ? item.trim().toLowerCase() : '').filter(Boolean)
}

export function normalizeBaseUrl(input: unknown): string {
  const trimmed = String(input || '').trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isLikelyImageGenerationModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  if (!id) return false
  return (
    GROK_IMAGE_MODEL_IDS.has(id) ||
    /(^|[/:-])(?:gpt-)?image(?:-|$)/.test(id) ||
    id.includes('/image-') ||
    id.includes('dall-e') ||
    id.includes('imagen')
  )
}

export function isLikelyVideoGenerationModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  if (!id) return false
  return GROK_VIDEO_MODEL_IDS.has(id) || id.includes('video-generation') || /(^|[/:-])video(?:-|$)/.test(id)
}

export function isLikelyChatCompletionModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  if (!id) return false
  if (isLikelyImageGenerationModelId(id) || isLikelyVideoGenerationModelId(id)) return false
  if (/(^|[/:-])(?:text-)?embedding/.test(id) || id.includes('embedding')) return false
  if (id.includes('dall-e') || id.includes('whisper') || id.includes('tts')) return false
  if (id.includes('moderation') || id.includes('omni-moderation')) return false
  if (id.includes('transcribe') || id.includes('realtime')) return false
  return true
}

function isLikelyEmbeddingModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  return /(^|[/:-])(?:text-)?embedding/.test(id) || id.includes('embedding')
}

function isLikelyAudioModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  return id.includes('whisper') || id.includes('tts') || id.includes('audio') || id.includes('transcribe') || id.includes('realtime')
}

function isLikelyModerationModelId(modelId: unknown): boolean {
  const id = String(modelId || '').trim().toLowerCase()
  return id.includes('moderation') || id.includes('omni-moderation')
}

function splitModalities(value: unknown): string[] {
  return String(value || '')
    .split(/[+,]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function modelModalities(model: ByokModel): { input: string[]; output: string[] } {
  const raw = objectValue(model.raw) || {}
  const architecture = objectValue(raw.architecture) || {}
  const input = new Set(stringArray(architecture.input_modalities))
  const output = new Set(stringArray(architecture.output_modalities))
  const modality = stringValue(architecture.modality).toLowerCase()

  if (modality.includes('->')) {
    const [inputSide, outputSide] = modality.split('->')
    splitModalities(inputSide).forEach((item) => input.add(item))
    splitModalities(outputSide).forEach((item) => output.add(item))
  }

  return { input: Array.from(input), output: Array.from(output) }
}

export function getModelCapabilities(model: ByokModel): ModelCapability[] {
  const capabilities = new Set<ModelCapability>()
  const modalities = modelModalities(model)
  const outputsImage = modalities.output.includes('image') || isLikelyImageGenerationModelId(model.id)
  const outputsVideo = modalities.output.includes('video') || isLikelyVideoGenerationModelId(model.id)
  const hasOutputMetadata = modalities.output.length > 0
  const outputsText = modalities.output.includes('text')

  if (outputsImage) capabilities.add('image_generation')
  if (outputsVideo) capabilities.add('video_generation')
  if (!outputsImage && !outputsVideo && isLikelyChatCompletionModelId(model.id) && (!hasOutputMetadata || outputsText)) {
    capabilities.add('chat')
  }
  if (capabilities.has('chat') && modalities.input.includes('image')) capabilities.add('vision')

  return Array.from(capabilities)
}

export function getEffectiveModelCapabilities(
  model: ByokModel,
  _options: { provider?: string; baseUrl?: unknown } = {},
): ModelCapability[] {
  return getModelCapabilities(model)
}

export function getUnsupportedModelReason(
  model: ByokModel,
  _options: { provider?: string; baseUrl?: unknown } = {},
): string {
  if (getModelCapabilities(model).length) return ''
  const modalities = modelModalities(model)
  if (isLikelyEmbeddingModelId(model.id)) return 'Embeddings are not chat models.'
  if (isLikelyAudioModelId(model.id)) return 'Audio and realtime models are not supported in this text-first chat.'
  if (isLikelyModerationModelId(model.id)) return 'Moderation models are not runnable chat or media models.'
  if (modalities.output.includes('audio')) return 'Audio output is not supported in BYOK Chat.'
  if (modalities.output.length && !modalities.output.some((item) => ['text', 'image', 'video'].includes(item))) {
    return `Unsupported output modality: ${modalities.output.join(', ')}.`
  }
  if (modalities.input.length || modalities.output.length) return 'No chat, image, or video output capability was detected.'
  return ''
}

export function parseModelList(payload: unknown): ByokModel[] {
  const root = objectValue(payload)
  const data = Array.isArray(root?.data) ? root.data : Array.isArray(payload) ? payload : []
  const models: ByokModel[] = []
  for (const item of data) {
      const raw = objectValue(item)
      if (!raw) continue
      const id = stringValue(raw.id) || stringValue(raw.name)
      if (!id) continue
      const topProvider = objectValue(raw.top_provider) || {}
      models.push({
        id,
        name: stringValue(raw.name) || stringValue(raw.display_name) || id,
        ownedBy: stringValue(raw.owned_by) || stringValue(raw.ownedBy),
        contextLength: numberValue(raw.context_length) || numberValue(raw.contextLength) || numberValue(topProvider.context_length),
        raw,
      })
  }
  return models
    .sort((a, b) => a.id.localeCompare(b.id))
}

export function capabilityLabel(capability: ModelCapability): string {
  switch (capability) {
    case 'chat': return 'Chat'
    case 'vision': return 'Vision'
    case 'image_generation': return 'Image'
    case 'video_generation': return 'Video'
    default: return capability
  }
}
