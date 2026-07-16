export type ConsentPreferences = {
  version: 1
  essential: true
  analytics: boolean
  updatedAt: string
}

declare global {
  interface Window {
    dataLayer?: unknown[][]
    gtag?: (...args: unknown[]) => void
  }
}

export const CONSENT_STORAGE_KEY = 'byok.chat.consent.v1'
export const PRIVACY_SETTINGS_EVENT = 'byok:open-privacy-settings'

const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
const GOOGLE_TAG_ID = 'byok-google-analytics'
const PRODUCTION_GA_MEASUREMENT_ID = 'G-GJRR7KP2G1'
const ENV_GA_MEASUREMENT_ID = import.meta.env?.VITE_GA_MEASUREMENT_ID?.trim() || ''
const GA_MEASUREMENT_ID = ENV_GA_MEASUREMENT_ID || PRODUCTION_GA_MEASUREMENT_ID
const PRODUCTION_ANALYTICS_HOSTS = new Set(['byok.chat', 'www.byok.chat'])

let analyticsConfigured = false
let tagLoadPromise: Promise<void> | undefined
let lastTrackedPage = ''

function isValidMeasurementId(value: string) {
  return /^G-[A-Z0-9]+$/i.test(value)
}

export function analyticsIsConfigured() {
  const hostname = globalThis.location?.hostname || ''
  return isValidMeasurementId(GA_MEASUREMENT_ID) && (
    Boolean(ENV_GA_MEASUREMENT_ID) || PRODUCTION_ANALYTICS_HOSTS.has(hostname)
  )
}

export function readConsentPreferences(): ConsentPreferences | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const parsed = JSON.parse(localStorage.getItem(CONSENT_STORAGE_KEY) || 'null') as Partial<ConsentPreferences> | null
    if (!parsed || parsed.version !== 1 || parsed.essential !== true || typeof parsed.analytics !== 'boolean' || !parsed.updatedAt) return null
    const updatedAt = new Date(parsed.updatedAt).getTime()
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > CONSENT_MAX_AGE_MS) return null
    return parsed as ConsentPreferences
  } catch {
    return null
  }
}

export function saveConsentPreferences(analytics: boolean): ConsentPreferences {
  const preferences: ConsentPreferences = {
    version: 1,
    essential: true,
    analytics,
    updatedAt: new Date().toISOString(),
  }
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences))
  return preferences
}

export function openPrivacySettings() {
  globalThis.dispatchEvent(new Event(PRIVACY_SETTINGS_EVENT))
}

function ensureGtag() {
  window.dataLayer ||= []
  window.gtag ||= (...args: unknown[]) => {
    window.dataLayer?.push(args)
  }
  return window.gtag
}

function consentState(analytics: 'granted' | 'denied') {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: analytics,
    functionality_storage: 'granted',
    personalization_storage: 'denied',
    security_storage: 'granted',
  }
}

function safePageLocation() {
  return `${window.location.origin}${window.location.pathname}`
}

function clearGoogleAnalyticsCookies() {
  const cookieNames = document.cookie
    .split(';')
    .map((cookie) => cookie.split('=')[0]?.trim())
    .filter((name): name is string => Boolean(name && (name === '_ga' || name.startsWith('_ga_'))))
  const hostname = window.location.hostname
  const domains = new Set<string>()
  if (hostname && hostname !== 'localhost') {
    domains.add(hostname)
    domains.add(`.${hostname}`)
    if (hostname === 'byok.chat' || hostname.endsWith('.byok.chat')) {
      domains.add('byok.chat')
      domains.add('.byok.chat')
    }
  }
  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}; SameSite=Lax; Secure`
    }
  }
}

function loadGoogleTag() {
  if (tagLoadPromise) return tagLoadPromise
  tagLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_TAG_ID) as HTMLScriptElement | null
    if (existing?.dataset.loaded === 'true') {
      resolve()
      return
    }
    const script = existing || document.createElement('script')
    script.id = GOOGLE_TAG_ID
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error('Google Analytics failed to load.')), { once: true })
    if (!existing) document.head.appendChild(script)
  })
  return tagLoadPromise
}

export async function applyAnalyticsConsent(analyticsAllowed: boolean) {
  if (typeof window === 'undefined') return
  if (!analyticsIsConfigured()) return

  const gtag = ensureGtag()
  gtag('consent', 'default', consentState('denied'))

  if (!analyticsAllowed) {
    gtag('consent', 'update', consentState('denied'))
    clearGoogleAnalyticsCookies()
    lastTrackedPage = ''
    return
  }

  gtag('consent', 'update', consentState('granted'))
  await loadGoogleTag()
  if (!analyticsConfigured) {
    const pageLocation = safePageLocation()
    gtag('js', new Date())
    gtag('config', GA_MEASUREMENT_ID, {
      allow_ad_personalization_signals: false,
      allow_google_signals: false,
      cookie_domain: window.location.hostname,
      cookie_expires: 31_536_000,
      cookie_update: false,
      page_location: pageLocation,
      page_referrer: '',
      send_page_view: false,
    })
    analyticsConfigured = true
  }
  const pageLocation = safePageLocation()
  if (lastTrackedPage === pageLocation) return
  lastTrackedPage = pageLocation
  gtag('event', 'page_view', {
    page_location: pageLocation,
    page_path: window.location.pathname,
    page_referrer: '',
    page_title: document.title.slice(0, 120),
  })
}
