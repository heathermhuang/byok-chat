import test from 'node:test'
import assert from 'node:assert/strict'
import { exportProfilesSnapshot, loadProfiles, saveProfiles } from '../src/lib/profiles.ts'

class MemoryStorage {
  store = new Map()

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null
  }

  setItem(key, value) {
    this.store.set(key, String(value))
  }

  removeItem(key) {
    this.store.delete(key)
  }
}

const encryptedApiKey = {
  version: 1,
  algorithm: 'AES-GCM',
  kdf: 'PBKDF2-SHA-256',
  iterations: 1000,
  salt: 'c2FsdA==',
  iv: 'aXY=',
  ciphertext: 'Y2lwaGVydGV4dA==',
  createdAt: '2026-07-06T00:00:00.000Z',
}

function encryptedProfile() {
  return {
    id: 'profile-1',
    name: 'Encrypted OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-should-not-persist',
    encryptedApiKey,
    keyStorage: 'passphrase',
    selectedModel: 'gpt-4o',
    models: [],
  }
}

test('encrypted profiles do not persist plaintext keys', () => {
  globalThis.localStorage = new MemoryStorage()
  saveProfiles([encryptedProfile()], 'profile-1')

  const raw = globalThis.localStorage.getItem('byok.chat.profiles.v1')
  assert.doesNotMatch(raw, /sk-should-not-persist/)

  const loaded = loadProfiles()
  assert.equal(loaded.activeProfileId, 'profile-1')
  assert.equal(loaded.profiles[0].apiKey, '')
  assert.equal(loaded.profiles[0].keyStorage, 'passphrase')
  assert.deepEqual(loaded.profiles[0].encryptedApiKey, encryptedApiKey)
})

test('profile export keeps encrypted keys encrypted', () => {
  const snapshot = exportProfilesSnapshot([encryptedProfile()], 'profile-1')

  assert.doesNotMatch(snapshot, /sk-should-not-persist/)
  assert.match(snapshot, /Encrypted OpenAI/)
  assert.match(snapshot, /ciphertext/)
  assert.match(snapshot, /browserApiKeys/)
  assert.match(snapshot, /redacted/)
})

test('profile export redacts browser-only plaintext keys by default', () => {
  const snapshot = exportProfilesSnapshot([{
    id: 'profile-plain',
    name: 'Browser OpenAI',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-browser-secret',
    keyStorage: 'browser',
    selectedModel: 'gpt-4o',
    models: [],
  }], 'profile-plain')
  const parsed = JSON.parse(snapshot)

  assert.doesNotMatch(snapshot, /sk-browser-secret/)
  assert.equal(parsed.profiles[0].apiKey, '')
  assert.equal(parsed.profiles[0].keyStorage, 'browser')
})

test('profiles persist editable names and default blank names', () => {
  globalThis.localStorage = new MemoryStorage()
  saveProfiles([
    {
      id: 'profile-named',
      name: '  My Grok profile  ',
      provider: 'xai',
      baseUrl: 'https://api.x.ai/v1',
      apiKey: 'test-key',
      keyStorage: 'browser',
      selectedModel: 'grok-4',
      models: [],
    },
    {
      id: 'profile-blank',
      name: '   ',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      keyStorage: 'browser',
      selectedModel: 'gpt-4o',
      models: [],
    },
  ], 'profile-named')

  const loaded = loadProfiles()
  assert.equal(loaded.profiles[0].name, 'My Grok profile')
  assert.equal(loaded.profiles[1].name, 'OpenAI')
})

test('legacy Sub2API profiles migrate to a user-owned custom endpoint', () => {
  globalThis.localStorage = new MemoryStorage()
  globalThis.localStorage.setItem('byok.chat.profiles.v1', JSON.stringify([{
    id: 'profile-legacy-sub2',
    name: 'Sub2API',
    provider: 'sub2api',
    baseUrl: 'https://gateway.example/v1',
    apiKey: 'test-key',
    selectedModel: 'gpt-4o',
    models: [],
  }]))

  const loaded = loadProfiles()
  assert.equal(loaded.profiles[0].provider, 'custom')
  assert.equal(loaded.profiles[0].name, 'Custom endpoint')
  assert.equal(loaded.profiles[0].baseUrl, 'https://gateway.example/v1')
})

test('profiles persist normalized text and media generation controls', () => {
  globalThis.localStorage = new MemoryStorage()
  saveProfiles([{
    id: 'profile-2',
    name: 'Tuned media profile',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-profile-key',
    selectedModel: 'gpt-image-2',
    models: [],
    generationParams: {
      temperature: 0.4,
      maxTokens: 1200,
      topP: 0.8,
      frequencyPenalty: -0.2,
      presencePenalty: 0.3,
      seed: 1234,
      reasoningEffort: 'high',
      verbosity: 'low',
      image: {
        count: 2,
        size: '1536x1024',
        quality: 'high',
        background: 'transparent',
        outputFormat: 'webp',
      },
      video: {
        size: '1280x720',
        seconds: '8',
      },
    },
  }], 'profile-2')

  const loaded = loadProfiles()
  assert.deepEqual(loaded.profiles[0].generationParams, {
    temperature: 0.4,
    maxTokens: 1200,
    topP: 0.8,
    frequencyPenalty: -0.2,
    presencePenalty: 0.3,
    seed: 1234,
    reasoningEffort: 'high',
    verbosity: 'low',
    image: {
      count: 2,
      size: '1536x1024',
      quality: 'high',
      background: 'transparent',
      outputFormat: 'webp',
    },
    video: {
      size: '1280x720',
      seconds: '8',
    },
  })
})
