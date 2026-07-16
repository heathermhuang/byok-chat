export const REASONING_EFFORT_OPTIONS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export const VERBOSITY_OPTIONS = ['low', 'medium', 'high'] as const
export const IMAGE_SIZE_OPTIONS = ['auto', '1024x1024', '1024x1536', '1536x1024'] as const
export const IMAGE_QUALITY_OPTIONS = ['auto', 'low', 'medium', 'high'] as const
export const IMAGE_BACKGROUND_OPTIONS = ['auto', 'transparent', 'opaque'] as const
export const IMAGE_FORMAT_OPTIONS = ['png', 'webp', 'jpeg'] as const
export const VIDEO_SIZE_OPTIONS = ['720x1280', '1280x720', '1024x1792', '1792x1024'] as const
export const VIDEO_SECOND_OPTIONS = ['4', '8', '12'] as const

export type ReasoningEffort = typeof REASONING_EFFORT_OPTIONS[number]
export type Verbosity = typeof VERBOSITY_OPTIONS[number]
export type ImageSize = typeof IMAGE_SIZE_OPTIONS[number]
export type ImageQuality = typeof IMAGE_QUALITY_OPTIONS[number]
export type ImageBackground = typeof IMAGE_BACKGROUND_OPTIONS[number]
export type ImageFormat = typeof IMAGE_FORMAT_OPTIONS[number]
export type VideoSize = typeof VIDEO_SIZE_OPTIONS[number]
export type VideoSeconds = typeof VIDEO_SECOND_OPTIONS[number]

export type GenerationParams = {
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  seed?: number
  reasoningEffort?: ReasoningEffort
  verbosity?: Verbosity
  image?: {
    count?: number
    size?: ImageSize
    quality?: ImageQuality
    background?: ImageBackground
    outputFormat?: ImageFormat
  }
  video?: {
    size?: VideoSize
    seconds?: VideoSeconds
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function stringOption<T extends readonly string[]>(value: unknown, options: T): T[number] | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return options.find((option) => option === normalized) as T[number] | undefined
}

function finiteNumber(value: unknown, min: number, max: number, integer = false): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number) || number < min || number > max) return undefined
  return integer ? Math.round(number) : number
}

function definedObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>
}

function nonEmptyObject<T extends Record<string, unknown>>(value: T): Partial<T> | undefined {
  const defined = definedObject(value)
  return Object.keys(defined).length ? defined : undefined
}

export function normalizeGenerationParams(value: unknown): GenerationParams {
  const raw = objectValue(value) || {}
  const image = objectValue(raw.image) || {}
  const video = objectValue(raw.video) || {}
  return {
    temperature: finiteNumber(raw.temperature, 0, 2),
    maxTokens: finiteNumber(raw.maxTokens ?? raw.max_tokens, 1, 1_000_000, true),
    topP: finiteNumber(raw.topP ?? raw.top_p, 0, 1),
    frequencyPenalty: finiteNumber(raw.frequencyPenalty ?? raw.frequency_penalty, -2, 2),
    presencePenalty: finiteNumber(raw.presencePenalty ?? raw.presence_penalty, -2, 2),
    seed: finiteNumber(raw.seed, 0, Number.MAX_SAFE_INTEGER, true),
    reasoningEffort: stringOption(raw.reasoningEffort ?? raw.reasoning_effort, REASONING_EFFORT_OPTIONS),
    verbosity: stringOption(raw.verbosity, VERBOSITY_OPTIONS),
    image: nonEmptyObject({
      count: finiteNumber(image.count ?? image.n, 1, 4, true),
      size: stringOption(image.size, IMAGE_SIZE_OPTIONS),
      quality: stringOption(image.quality, IMAGE_QUALITY_OPTIONS),
      background: stringOption(image.background, IMAGE_BACKGROUND_OPTIONS),
      outputFormat: stringOption(image.outputFormat ?? image.output_format, IMAGE_FORMAT_OPTIONS),
    }) as GenerationParams['image'],
    video: nonEmptyObject({
      size: stringOption(video.size, VIDEO_SIZE_OPTIONS),
      seconds: stringOption(video.seconds, VIDEO_SECOND_OPTIONS),
    }) as GenerationParams['video'],
  }
}

export function buildOpenAiCompatibleChatOptions(params: GenerationParams | undefined): Record<string, unknown> {
  const normalized = normalizeGenerationParams(params)
  return nonEmptyObject({
    temperature: normalized.temperature,
    max_tokens: normalized.maxTokens,
    top_p: normalized.topP,
    frequency_penalty: normalized.frequencyPenalty,
    presence_penalty: normalized.presencePenalty,
    seed: normalized.seed,
    reasoning_effort: normalized.reasoningEffort,
    verbosity: normalized.verbosity,
  }) || {}
}

export function buildAnthropicMessageOptions(params: GenerationParams | undefined): Record<string, unknown> {
  const normalized = normalizeGenerationParams(params)
  return nonEmptyObject({
    temperature: normalized.temperature,
    max_tokens: normalized.maxTokens,
    top_p: normalized.topP,
  }) || {}
}

export function buildImageGenerationOptions(params: GenerationParams | undefined): Record<string, unknown> {
  const normalized = normalizeGenerationParams(params)
  return {
    n: normalized.image?.count || 1,
    ...(nonEmptyObject({
      size: normalized.image?.size,
      quality: normalized.image?.quality,
      background: normalized.image?.background,
      output_format: normalized.image?.outputFormat,
    }) || {}),
  }
}

export function buildVideoGenerationOptions(params: GenerationParams | undefined): Record<string, unknown> {
  const normalized = normalizeGenerationParams(params)
  return nonEmptyObject({
    size: normalized.video?.size,
    seconds: normalized.video?.seconds,
  }) || {}
}
