import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CONSENT_STORAGE_KEY,
  applyAnalyticsConsent,
  analyticsIsConfigured,
  readConsentPreferences,
  saveConsentPreferences,
} from '../src/lib/privacy.ts'

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }
}

test('stores an explicit versioned analytics choice and reads it back', () => {
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = new MemoryStorage()
  try {
    const saved = saveConsentPreferences(false)
    assert.equal(saved.version, 1)
    assert.equal(saved.essential, true)
    assert.equal(saved.analytics, false)
    assert.deepEqual(readConsentPreferences(), saved)
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  }
})

test('expires stale consent so the visitor is asked again', () => {
  const originalLocalStorage = globalThis.localStorage
  globalThis.localStorage = new MemoryStorage()
  try {
    globalThis.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: 1,
      essential: true,
      analytics: true,
      updatedAt: '2025-01-01T00:00:00.000Z',
    }))
    assert.equal(readConsentPreferences(), null)
  } finally {
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  }
})

test('keeps Google Analytics out of static HTML and gates tag loading in the consent module', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  const privacySource = readFileSync(new URL('../src/lib/privacy.ts', import.meta.url), 'utf8')

  assert.doesNotMatch(html, /googletagmanager|google-analytics|gtag\(/i)
  assert.match(privacySource, /G-GJRR7KP2G1/)
  assert.match(privacySource, /if \(!analyticsAllowed\)/)
  assert.match(privacySource, /await loadGoogleTag\(\)/)
  assert.match(privacySource, /ad_storage: 'denied'/)
  assert.match(privacySource, /ad_user_data: 'denied'/)
  assert.match(privacySource, /ad_personalization: 'denied'/)
  assert.match(privacySource, /allow_google_signals: false/)
  assert.match(privacySource, /cookie_domain: window\.location\.hostname/)
  assert.match(privacySource, /hostname\.endsWith\('\.byok\.chat'\)/)
  assert.match(privacySource, /window\.location\.pathname/)
  assert.doesNotMatch(privacySource, /window\.location\.search/)
})

test('enables the built-in GA4 property only on production hosts', () => {
  const originalLocation = globalThis.location
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'byok.chat' } })
    assert.equal(analyticsIsConfigured(), true)
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'staging.byok.chat' } })
    assert.equal(analyticsIsConfigured(), false)
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hostname: 'localhost' } })
    assert.equal(analyticsIsConfigured(), false)
  } finally {
    if (originalLocation === undefined) delete globalThis.location
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: originalLocation })
  }
})

test('withdrawing consent on www clears legacy parent-domain GA cookies', async () => {
  const cookieWrites = []
  const location = { hostname: 'www.byok.chat' }
  const document = {
    get cookie() {
      return '_ga=legacy; _ga_GJRR7KP2G1=session'
    },
    set cookie(value) {
      cookieWrites.push(value)
    },
  }
  const originals = {
    window: globalThis.window,
    document: globalThis.document,
    location: globalThis.location,
  }
  try {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location } })
    Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
    Object.defineProperty(globalThis, 'location', { configurable: true, value: location })

    await applyAnalyticsConsent(false)

    for (const name of ['_ga', '_ga_GJRR7KP2G1']) {
      assert.ok(cookieWrites.some((value) => value.startsWith(`${name}=`) && value.includes('domain=.byok.chat')))
    }
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]
      else Object.defineProperty(globalThis, key, { configurable: true, value })
    }
  }
})

test('ships direct legal routes and production discovery files', () => {
  const legalSource = readFileSync(new URL('../src/components/LegalPage.tsx', import.meta.url), 'utf8')
  const sitemap = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
  const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')

  for (const path of ['/privacy', '/terms', '/cookies']) {
    assert.match(legalSource, new RegExp(path))
    assert.match(sitemap, new RegExp(`https://byok\\.chat${path}`))
  }
  assert.match(robots, /Sitemap: https:\/\/byok\.chat\/sitemap\.xml/)
})
