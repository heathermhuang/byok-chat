import { type ByokModel, normalizeBaseUrl } from './model-utils.ts'
import { normalizeGenerationParams, type GenerationParams } from './generation-options.ts'
import { getProviderDefaultModel, getProviderPreset, type ProviderId } from './providers.ts'
import { secureRandomId } from './random-id.ts'
import type { EncryptedSecret } from './secure-storage.ts'
import { normalizeToolDefaults, type ToolDefaults } from './tools.ts'

export type { ProviderId } from './providers'

export type ByokProfile = {
  id: string
  name: string
  provider: ProviderId
  baseUrl: string
  apiKey: string
  encryptedApiKey?: EncryptedSecret
  keyStorage?: 'browser' | 'passphrase'
  searchApiKey?: string
  selectedModel: string
  models: ByokModel[]
  lastFetchedAt?: string
  systemPrompt?: string
  defaultTools?: ToolDefaults
  generationParams?: GenerationParams
  notes?: string
  tags?: string[]
}

type SerializeProfileOptions = {
  includePlaintextApiKeys?: boolean
}

const PROFILE_KEY = 'byok.chat.profiles.v1'
const ACTIVE_KEY = 'byok.chat.activeProfile.v1'
const LEGACY_PROFILE_KEY = 'standalone.llmTester.profiles.v1'
const LEGACY_ACTIVE_KEY = 'standalone.llmTester.activeProfile.v1'

function migrateStorageKey(key: string, legacyKey: string): void {
  if (localStorage.getItem(key) !== null) return
  const legacyValue = localStorage.getItem(legacyKey)
  if (legacyValue !== null) localStorage.setItem(key, legacyValue)
}

function createId(): string {
  return secureRandomId('profile')
}

export function defaultProfile(): ByokProfile {
  const preset = getProviderPreset('openrouter')
  return {
    id: createId(),
    name: preset.profileName,
    provider: preset.id,
    baseUrl: preset.baseUrl,
    apiKey: '',
    selectedModel: preset.defaultModel,
    models: [],
  }
}

function normalizeProfile(profile: ByokProfile): ByokProfile {
  const provider: ProviderId = profile.provider === 'sub2api' ? 'custom' : profile.provider
  const encryptedApiKey = profile.encryptedApiKey && typeof profile.encryptedApiKey === 'object'
    ? profile.encryptedApiKey
    : undefined
  const keyStorage = encryptedApiKey ? 'passphrase' : profile.keyStorage === 'passphrase' ? 'passphrase' : 'browser'
  return {
    ...profile,
    provider,
    name: typeof profile.name === 'string' && profile.name.trim() && profile.name.trim() !== 'Sub2API'
      ? profile.name.trim()
      : getProviderPreset(provider).profileName,
    baseUrl: normalizeBaseUrl(profile.baseUrl),
    apiKey: typeof profile.apiKey === 'string' ? profile.apiKey : '',
    encryptedApiKey,
    keyStorage,
    selectedModel: profile.selectedModel || getProviderDefaultModel(provider),
    models: Array.isArray(profile.models) ? profile.models : [],
    defaultTools: normalizeToolDefaults(profile.defaultTools),
    generationParams: normalizeGenerationParams(profile.generationParams),
    notes: typeof profile.notes === 'string' ? profile.notes : '',
    tags: Array.isArray(profile.tags) ? profile.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim()) : [],
  }
}

function serializeProfile(profile: ByokProfile, options: SerializeProfileOptions = { includePlaintextApiKeys: true }): ByokProfile {
  const normalized = normalizeProfile(profile)
  if (normalized.keyStorage === 'passphrase' && normalized.encryptedApiKey) {
    return { ...normalized, apiKey: '' }
  }
  if (!options.includePlaintextApiKeys) {
    return { ...normalized, apiKey: '', encryptedApiKey: undefined, keyStorage: 'browser' }
  }
  return { ...normalized, encryptedApiKey: undefined, keyStorage: 'browser' }
}

export function loadProfiles(): { profiles: ByokProfile[]; activeProfileId: string } {
  migrateStorageKey(PROFILE_KEY, LEGACY_PROFILE_KEY)
  migrateStorageKey(ACTIVE_KEY, LEGACY_ACTIVE_KEY)
  try {
    const profiles = (JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]') as ByokProfile[]).map(normalizeProfile)
    const activeProfileId = localStorage.getItem(ACTIVE_KEY) || profiles[0]?.id || ''
    return { profiles, activeProfileId }
  } catch {
    return { profiles: [], activeProfileId: '' }
  }
}

export function saveProfiles(profiles: ByokProfile[], activeProfileId: string): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles.map((profile) => serializeProfile(profile))))
  localStorage.setItem(ACTIVE_KEY, activeProfileId)
}

export function upsertProfile(profiles: ByokProfile[], profile: ByokProfile): ByokProfile[] {
  const normalized = normalizeProfile(profile)
  const index = profiles.findIndex((item) => item.id === normalized.id)
  if (index < 0) return [normalized, ...profiles]
  const next = [...profiles]
  next[index] = normalized
  return next
}

export function cloneProfile(provider: ProviderId): ByokProfile {
  const preset = getProviderPreset(provider)
  const profile = defaultProfile()
  profile.provider = preset.id
  profile.name = preset.profileName
  profile.baseUrl = preset.baseUrl
  profile.selectedModel = preset.defaultModel
  return profile
}

export function exportProfilesSnapshot(profiles: ByokProfile[], activeProfileId: string): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    app: 'BYOK Chat',
    secrets: {
      browserApiKeys: 'redacted',
      encryptedApiKeys: 'preserved',
    },
    activeProfileId,
    profiles: profiles.map((profile) => serializeProfile(profile, { includePlaintextApiKeys: false })),
  }, null, 2)
}
