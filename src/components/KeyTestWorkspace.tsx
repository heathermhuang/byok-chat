import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, RotateCcw, ShieldCheck, Unlock } from 'lucide-react'
import type { ByokModel } from '../lib/model-utils'
import { getEffectiveModelCapabilities } from '../lib/model-utils'
import { getProviderPreset, PROVIDER_PRESETS, providerSupportsModelList } from '../lib/providers'
import type { ByokProfile, ProviderId } from '../lib/profiles'
import type { ProviderTest } from '../hooks/useProviderTest'

type Props = {
  profile: ByokProfile
  selectedMode: string
  test: ProviderTest
  fetchState: 'idle' | 'loading' | 'error'
  saving: boolean
  status: string
  onChange: (patch: Partial<ByokProfile>) => void
  onKeyChange: (key: string) => void
  onProviderChange: (provider: ProviderId) => void
  onFetchModels: () => Promise<void>
  onStartWorkspace: () => Promise<void>
  showKey: boolean
  onToggleKey: () => void
  keyStorage: 'browser' | 'passphrase'
  onKeyStorageChange: (encrypted: boolean) => void
  passphrase: string
  onPassphraseChange: (value: string) => void
  canEncrypt: boolean
  locked: boolean
  unlockPassphrase: string
  onUnlockPassphraseChange: (value: string) => void
  onUnlock: () => Promise<void>
}

export function KeyTestWorkspace(p: Props) {
  const preset = getProviderPreset(p.profile.provider)
  const listsModels = providerSupportsModelList(p.profile.provider)
  const busy = p.saving || p.test.busy || p.fetchState === 'loading'
  const models = p.profile.models
  const knownModel = models.some(model => model.id === p.profile.selectedModel)
  const chatModel = p.selectedMode === 'chat'
  const canTest = Boolean(p.profile.apiKey.trim() && p.profile.baseUrl.trim() && p.profile.selectedModel.trim() && chatModel && !p.locked)
  const primaryChecks = p.test.result?.checks.filter(check => check.label === 'Models endpoint' || check.label === 'Chat endpoint') || []
  const configurationChecks = p.test.result?.checks.filter(check => check.label !== 'Models endpoint' && check.label !== 'Chat endpoint') || []
  const modelCapabilities = (model: ByokModel) => getEffectiveModelCapabilities(model, { provider: p.profile.provider, baseUrl: p.profile.baseUrl })

  return <div className="key-test-workspace" aria-label="Test key then chat">
    <section className="key-test-settings" aria-labelledby="key-settings-title">
      <h2 id="key-settings-title">Endpoint settings</h2>
      <label className="field"><span>Provider</span><select aria-label="Provider" value={p.profile.provider} disabled={busy} onChange={event => p.onProviderChange(event.target.value as ProviderId)}>{PROVIDER_PRESETS.map(provider => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
      <label className="field"><span>Base URL</span><input value={p.profile.baseUrl} disabled={busy} placeholder="https://api.example.com/v1" onChange={event => p.onChange({ baseUrl: event.target.value })} spellCheck={false} /></label>
      <label className="field"><span>API key</span><div className="secret-field"><input value={p.profile.apiKey} disabled={busy || p.locked} type={p.showKey ? 'text' : 'password'} autoComplete="off" placeholder={p.locked ? 'Encrypted key locked' : 'Paste your API key'} onChange={event => p.onKeyChange(event.target.value)} /><button type="button" title={p.showKey ? 'Hide key' : 'Show key'} onClick={p.onToggleKey}>{p.showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      {p.locked ? <div className="key-test-unlock"><label className="field"><span>Unlock passphrase</span><input type="password" value={p.unlockPassphrase} onChange={event => p.onUnlockPassphraseChange(event.target.value)} /></label><button className="button secondary" type="button" disabled={busy} onClick={() => { void p.onUnlock() }}><Unlock size={16} /> Unlock</button></div> : null}
      {listsModels ? <div className="key-test-fetch"><button className="button secondary" type="button" disabled={busy || !p.profile.apiKey.trim() || !p.profile.baseUrl.trim()} onClick={() => { void p.onFetchModels() }}>{p.fetchState === 'loading' ? <Loader2 className="spin" size={16} /> : <RotateCcw size={16} />}{p.fetchState === 'loading' ? 'Fetching models…' : 'Fetch models'}</button>{models.length ? <span>{models.length} models in saved list</span> : null}</div> : <p className="key-test-note">{preset.label} uses a model ID entered below. A model-list endpoint is not required for the chat test.</p>}
      {models.length ? <label className="field"><span>Model</span><select aria-label="Model" value={knownModel ? p.profile.selectedModel : ''} disabled={busy} onChange={event => p.onChange({ selectedModel: event.target.value })}><option value="">Enter a model ID manually</option>{models.map(model => <option key={model.id} value={model.id} disabled={!modelCapabilities(model).length}>{model.id}{modelCapabilities(model).length ? '' : ' / Unsupported'}</option>)}</select></label> : null}
      {!knownModel ? <label className="field"><span>Model ID</span><input value={p.profile.selectedModel} disabled={busy} placeholder={preset.modelPlaceholder} onChange={event => p.onChange({ selectedModel: event.target.value })} spellCheck={false} /></label> : null}
      <p className="key-test-note">A listed model is not proof of chat access. Run the chat test for the model you select.</p>
      <details className="key-test-storage"><summary><Lock size={15} /> Profile and storage options</summary><label className="field"><span>Profile name</span><input value={p.profile.name} disabled={busy} onChange={event => p.onChange({ name: event.target.value })} /></label><label className="toggle-row"><input type="checkbox" disabled={busy || !p.canEncrypt && p.keyStorage !== 'passphrase'} checked={p.keyStorage === 'passphrase'} onChange={event => p.onKeyStorageChange(event.target.checked)} /><span>Encrypt saved key with a passphrase</span></label>{p.keyStorage === 'passphrase' && !p.locked ? <label className="field"><span>Passphrase</span><input type="password" value={p.passphrase} onChange={event => p.onPassphraseChange(event.target.value)} placeholder="Required for a new or changed key" /></label> : null}</details>
      <div className="key-test-trust"><ShieldCheck size={18} /><span>Profiles, keys and threads are saved in this browser. Active requests pass through the BYOK Chat Worker to your provider. <a href="/privacy">Privacy details</a></span></div>
      <p className="key-test-save-status" role="status" aria-live="polite">{p.status}</p>
    </section>
    <section className="key-test-diagnostics" aria-labelledby="key-diagnostics-title" aria-busy={p.test.busy}>
      <div className="key-test-panel-head"><h2 id="key-diagnostics-title">Diagnostics</h2><button className="button primary" type="button" disabled={!canTest || busy} onClick={() => { void p.test.run() }}>{p.test.busy ? <Loader2 className="spin" size={16} /> : null}{p.test.busy ? 'Checking…' : p.test.result || p.test.error ? 'Run test again' : 'Test key'}</button></div>
      <p className="key-test-note">Checks model discovery and sends a tiny 8-token chat probe. Your provider may charge for the request.</p>
      <dl className="key-test-model"><dt>Selected model</dt><dd>{p.profile.selectedModel || 'Not selected'}</dd></dl>
      {!chatModel && p.profile.selectedModel ? <p className="key-test-warning">Choose a chat model to test chat access.{p.selectedMode ? ' This selection can open its own media workspace without a chat-test claim.' : ' This model has no supported request mode.'}</p> : null}
      <div className="key-test-checks" aria-live="polite">
        {p.test.busy ? <p className="key-test-note"><Loader2 className="spin" size={16} /> Checking provider…</p> : null}
        {primaryChecks.length ? primaryChecks.map(check => <div className={`diagnostic-row ${check.status}`} key={check.label}><strong>{check.status === 'ok' ? <CheckCircle2 size={18} /> : null}{check.label}</strong><span>{check.message}</span></div>) : !p.test.busy ? <><div className="diagnostic-row"><strong>Models endpoint</strong><span>Not tested yet</span></div><div className="diagnostic-row"><strong>Chat endpoint</strong><span>Not tested yet</span></div></> : null}
      </div>
      {p.test.error ? <p className="key-test-error" role="alert">{p.test.error}</p> : null}
      {p.test.passed ? <><div className="key-test-success" role="status"><CheckCircle2 size={22} /><div><strong>Chat probe passed</strong><span>For this key, endpoint and selected model.</span></div></div><button className="button primary key-test-open-chat" type="button" disabled={busy} onClick={() => { void p.onStartWorkspace() }}>Chat with {p.profile.selectedModel}<ArrowRight size={17} /></button></> : p.test.result ? <p className="key-test-warning" role="status">The chat test did not pass. Check the result above, adjust your key or model, then try again.</p> : <p className="key-test-note">Enter your key, choose a model, then test before starting this chat.</p>}
      {p.selectedMode && !chatModel ? <button className="button secondary" type="button" disabled={busy} onClick={() => { void p.onStartWorkspace() }}>Open {p.selectedMode === 'image_generation' ? 'image' : 'video'} workspace<ArrowRight size={17} /></button> : null}
      {configurationChecks.length ? <details className="key-test-details"><summary>Configuration details</summary>{configurationChecks.map(check => <div className={`diagnostic-row ${check.status}`} key={check.label}><strong>{check.label}</strong><span>{check.message}</span></div>)}</details> : null}
    </section>
  </div>
}
