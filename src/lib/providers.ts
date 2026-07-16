import { OPENROUTER_BASE_URL } from './model-utils.ts'

export type ProviderId =
  | 'openrouter'
  | 'sub2api'
  | 'openai'
  | 'claude'
  | 'minimax'
  | 'zai'
  | 'deepseek'
  | 'gemini'
  | 'xai'
  | 'custom'

export type ProviderApiFormat = 'openai-compatible' | 'anthropic-messages' | 'minimax-chatcompletion-v2'
export type ProviderEndpointKind = 'models' | 'chat' | 'images' | 'videos'

export type ProviderPreset = {
  id: ProviderId
  label: string
  profileName: string
  baseUrl: string
  apiFormat: ProviderApiFormat
  appendV1ForBareBase?: boolean
  supportsTools: boolean
  defaultModel: string
  modelPlaceholder: string
  paths: Partial<Record<ProviderEndpointKind, string>>
}

export const DEFAULT_OPENAI_COMPATIBLE_PATHS: Record<ProviderEndpointKind, string> = {
  models: 'models',
  chat: 'chat/completions',
  images: 'images/generations',
  videos: 'videos/generations',
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    profileName: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'openai/gpt-4o',
    modelPlaceholder: 'openai/gpt-4o',
    paths: DEFAULT_OPENAI_COMPATIBLE_PATHS,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    profileName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'gpt-4o',
    modelPlaceholder: 'gpt-4o',
    paths: {
      models: 'models',
      chat: 'chat/completions',
      images: 'images/generations',
      videos: 'videos',
    },
  },
  {
    id: 'claude',
    label: 'Claude',
    profileName: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    apiFormat: 'anthropic-messages',
    supportsTools: false,
    defaultModel: 'claude-sonnet-4-5',
    modelPlaceholder: 'claude-sonnet-4-5',
    paths: {
      models: 'models',
      chat: 'messages',
    },
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    profileName: 'MiniMax',
    baseUrl: 'https://api.minimaxi.chat/v1',
    apiFormat: 'minimax-chatcompletion-v2',
    supportsTools: false,
    defaultModel: 'MiniMax-M1',
    modelPlaceholder: 'MiniMax-M1',
    paths: {
      chat: 'text/chatcompletion_v2',
    },
  },
  {
    id: 'zai',
    label: 'Z.ai',
    profileName: 'Z.ai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'glm-4.5',
    modelPlaceholder: 'glm-4.5',
    paths: {
      chat: 'chat/completions',
      images: 'images/generations',
      videos: 'videos/generations',
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    profileName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'deepseek-chat',
    modelPlaceholder: 'deepseek-chat',
    paths: {
      models: 'models',
      chat: 'chat/completions',
    },
  },
  {
    id: 'gemini',
    label: 'Gemini',
    profileName: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'gemini-2.5-flash',
    modelPlaceholder: 'gemini-2.5-flash',
    paths: {
      models: 'models',
      chat: 'chat/completions',
    },
  },
  {
    id: 'xai',
    label: 'xAI',
    profileName: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    apiFormat: 'openai-compatible',
    supportsTools: true,
    defaultModel: 'grok-4',
    modelPlaceholder: 'grok-4',
    paths: DEFAULT_OPENAI_COMPATIBLE_PATHS,
  },
  {
    id: 'custom',
    label: 'Custom',
    profileName: 'Custom endpoint',
    baseUrl: '',
    apiFormat: 'openai-compatible',
    appendV1ForBareBase: true,
    supportsTools: true,
    defaultModel: '',
    modelPlaceholder: 'model-id',
    paths: DEFAULT_OPENAI_COMPATIBLE_PATHS,
  },
]

export function getProviderPreset(provider: string | undefined): ProviderPreset {
  if (provider === 'sub2api') return PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
  return PROVIDER_PRESETS.find((preset) => preset.id === provider) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
}

export function providerSupportsModelList(provider: string | undefined): boolean {
  return Boolean(getProviderPreset(provider).paths.models)
}

export function getProviderDefaultModel(provider: string | undefined): string {
  return getProviderPreset(provider).defaultModel
}
