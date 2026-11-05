import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  applyAnalyticsConsent,
  PRIVACY_SETTINGS_EVENT,
  readConsentPreferences,
  saveConsentPreferences,
  type ConsentPreferences,
} from '../lib/privacy'

type ConsentView = 'closed' | 'preferences'

export function PrivacyControls() {
  const [preferences, setPreferences] = useState<ConsentPreferences | null>(() => readConsentPreferences())
  const [view, setView] = useState<ConsentView>('closed')
  const [analytics, setAnalytics] = useState(preferences?.analytics !== false)

  useEffect(() => {
    void applyAnalyticsConsent(preferences?.analytics !== false)
  }, [preferences])

  useEffect(() => {
    const open = () => {
      setAnalytics(readConsentPreferences()?.analytics !== false)
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


  return (
    <div className="consent-scrim" role="presentation">
      <section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-settings-title">
        <header>
          <div>
            <span className="eyebrow">Privacy controls</span>
            <h2 id="privacy-settings-title">Choose what this site may store.</h2>
          </div>
          <button className="icon-button compact" type="button" title="Close privacy settings" onClick={() => setView('closed')}><X size={15} /></button>
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

        <p className="consent-detail">Page-view analytics starts automatically. You can return here from the sidebar or any legal page and turn it off at any time.</p>
        <div className="consent-dialog-actions">
          <button className="button secondary" type="button" onClick={() => choose(false)}>Use necessary only</button>
          <button className="button primary" type="button" onClick={() => choose(analytics)}>Save choices</button>
        </div>
      </section>
    </div>
  )
}
