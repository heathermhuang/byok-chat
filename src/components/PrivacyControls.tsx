import { Check, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  applyAnalyticsConsent,
  PRIVACY_SETTINGS_EVENT,
  readConsentPreferences,
  saveConsentPreferences,
  type ConsentPreferences,
} from '../lib/privacy'

type ConsentView = 'closed' | 'banner' | 'preferences'

export function PrivacyControls() {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(() => readConsentPreferences())
  const [view, setView] = useState<ConsentView>(() => preferences ? 'closed' : 'banner')
  const [analytics, setAnalytics] = useState(Boolean(preferences?.analytics))

  useEffect(() => {
    void applyAnalyticsConsent(Boolean(preferences?.analytics))
  }, [preferences])

  useEffect(() => {
    const open = () => {
      setAnalytics(Boolean(readConsentPreferences()?.analytics))
      setView('preferences')
    }
    globalThis.addEventListener(PRIVACY_SETTINGS_EVENT, open)
    return () => globalThis.removeEventListener(PRIVACY_SETTINGS_EVENT, open)
  }, [])

  function choose(nextAnalytics: boolean) {
    const next = saveConsentPreferences(nextAnalytics)
    setAnalytics(nextAnalytics)
    setPreferences(next)
    setView('closed')
  }

  if (view === 'closed') return null

  if (view === 'banner') {
    return (
      <section className="consent-banner" aria-label="Cookie consent" role="region">
        <div className="consent-icon" aria-hidden="true"><ShieldCheck size={20} /></div>
        <div className="consent-copy">
          <strong>Your workspace stays browser-local.</strong>
          <p>Required storage saves profiles, threads, and this choice. Optional analytics counts page visits; it never receives prompts, thread content, or API keys.</p>
          <div className="consent-links">
            <a href="/cookies">Cookie policy</a>
            <a href="/privacy">Privacy policy</a>
            <button type="button" onClick={() => setView('preferences')}>Manage choices</button>
          </div>
        </div>
        <div className="consent-actions">
          <button className="button secondary" type="button" onClick={() => choose(false)}>Necessary only</button>
          <button className="button secondary consent-allow" type="button" onClick={() => choose(true)}>Allow analytics</button>
        </div>
      </section>
    )
  }

  return (
    <div className="consent-scrim" role="presentation">
      <section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-settings-title">
        <header>
          <div>
            <span className="eyebrow">Privacy controls</span>
            <h2 id="privacy-settings-title">Choose what this site may store.</h2>
          </div>
          {preferences ? (
            <button className="icon-button compact" type="button" title="Close privacy settings" onClick={() => setView('closed')}><X size={15} /></button>
          ) : null}
        </header>

        <div className="consent-option always-on">
          <span className="consent-option-mark"><Check size={16} /></span>
          <span>
            <strong>Necessary browser storage</strong>
            <small>Always on. Saves profiles, threads, encrypted-key records, and this privacy choice on your device.</small>
          </span>
        </div>

        <label className="consent-option">
          <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} />
          <span>
            <strong>Google Analytics</strong>
            <small>Optional page-view measurement. Advertising storage, signals, and personalization stay disabled.</small>
          </span>
        </label>

        <p className="consent-detail">Analytics is blocked until you opt in. You can return here from the sidebar or any legal page and withdraw consent at any time.</p>
        <div className="consent-dialog-actions">
          <button className="button secondary" type="button" onClick={() => choose(false)}>Use necessary only</button>
          <button className="button primary" type="button" onClick={() => choose(analytics)}>Save choices</button>
        </div>
      </section>
    </div>
  )
}
