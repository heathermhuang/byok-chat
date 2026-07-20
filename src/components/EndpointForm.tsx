import { Download, Eye, EyeOff, Lock, Plus, RotateCcw, Save, Search, ShieldCheck, Trash2, Unlock } from 'lucide-react'
import type { Dispatch, SetStateAction } from 'react'
import {
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  VIDEO_SIZE_OPTIONS,
} from '../lib/generation-options'
import { capabilityLabel, getUnsupportedModelReason, type ByokModel, type ModelCapability } from '../lib/model-utils'
import { PROVIDER_PRESETS, providerSupportsModelList, type ProviderPreset } from '../lib/providers'
import type { ByokProfile, ProviderId } from '../lib/profiles'
import { updateToolDefault } from '../lib/tools'
import { ProviderIcon } from './ProviderIcon'

type EndpointFormProps = {
  activeProvider: ProviderPreset
  activeProfileId: string
  canRun: boolean
  draft: ByokProfile
  fetchState: 'idle' | 'loading' | 'error'
  filteredModels: ByokModel[]
  keyIsLocked: boolean
  keyStorage: 'browser' | 'passphrase'
  modelHint: string
  modelQuery: string
  passphrase: string
  profiles: ByokProfile[]
  providerQuickPick: ProviderPreset[]
  secretBusy: boolean
  secretDirty: boolean
  secureStorageAvailable: boolean
  selectedMode: string
  selectedModelKnown: boolean
  showRunControls: boolean
  isSetupFlow: boolean
  showKey: boolean
  status: string
  toolsAvailable: boolean
  unlockPassphrase: string
  deleteStoredKey: () => void
  exportProfiles: () => void
  handleApiKeyChange: (value: string) => void
  modelCapabilities: (model: ByokModel) => ModelCapability[]
  newProfile: (provider?: ProviderId) => void
  refreshModels: () => void
  saveDraft: () => Promise<boolean>
  selectProfile: (profile: ByokProfile) => void
  setKeyStorage: Dispatch<SetStateAction<'browser' | 'passphrase'>>
  setModelQuery: (value: string) => void
  setPassphrase: (value: string) => void
  setProvider: (provider: ProviderId) => void
  setSecretDirty: (value: boolean) => void
  setShowKey: Dispatch<SetStateAction<boolean>>
  setUnlockPassphrase: (value: string) => void
  unlockStoredKey: () => Promise<void>
  updateDraft: (patch: Partial<ByokProfile>) => void
}

export function EndpointForm({
  activeProvider,
  activeProfileId,
  canRun,
  deleteStoredKey,
  draft,
  exportProfiles,
  fetchState,
  filteredModels,
  handleApiKeyChange,
  keyIsLocked,
  keyStorage,
  modelCapabilities,
  modelHint,
  modelQuery,
  newProfile,
  passphrase,
  profiles,
  providerQuickPick,
  refreshModels,
  saveDraft,
  secretBusy,
  secretDirty,
  secureStorageAvailable,
  selectProfile,
  selectedMode,
  selectedModelKnown,
  showRunControls,
  isSetupFlow,
  setKeyStorage,
  setModelQuery,
  setPassphrase,
  setProvider,
  setSecretDirty,
  setShowKey,
  setUnlockPassphrase,
  showKey,
  status,
  toolsAvailable,
  unlockPassphrase,
  unlockStoredKey,
  updateDraft,
}: EndpointFormProps) {
  const generationParams = draft.generationParams || {}
  const imageParams = generationParams.image || {}
  const videoParams = generationParams.video || {}
  const supportsModelList = providerSupportsModelList(activeProvider.id)
  const showAdvancedFields = !isSetupFlow
  const showManualModel = showRunControls && (!isSetupFlow || !supportsModelList)
  const showFetchedModels = showRunControls && showAdvancedFields

  function modelOptionLabel(model: ByokModel): string {
    const capabilities = modelCapabilities(model)
    if (capabilities.length) return `${model.id} / ${capabilities.map(capabilityLabel).join(' / ')}`
    return getUnsupportedModelReason(model, { provider: draft.provider, baseUrl: draft.baseUrl })
      ? `${model.id} / Unsupported`
      : model.id
  }

  function optionalNumber(value: string): number | undefined {
    return value === '' ? undefined : Number(value)
  }

  function updateGenerationParams(patch: Partial<NonNullable<ByokProfile['generationParams']>>) {
    updateDraft({ generationParams: { ...generationParams, ...patch } })
  }

  function updateImageParams(patch: Partial<NonNullable<NonNullable<ByokProfile['generationParams']>['image']>>) {
    updateGenerationParams({ image: { ...imageParams, ...patch } })
  }

  function updateVideoParams(patch: Partial<NonNullable<NonNullable<ByokProfile['generationParams']>['video']>>) {
    updateGenerationParams({ video: { ...videoParams, ...patch } })
  }

  return (
    <div className="endpoint-form">
      <div className="form-intro endpoint-wide">
        <p className="eyebrow">Bring Your Own Key</p>
        <strong>Connect {activeProvider.label}</strong>
        <span>Use a key from your own provider account. BYOK Chat does not sell or resell model access.</span>
      </div>

      {profiles.length ? (
        <label className="field endpoint-wide saved-profile-field">
          <span>Saved profile</span>
          <select value={activeProfileId} onChange={(event) => {
            const profile = profiles.find((item) => item.id === event.target.value)
            if (profile) selectProfile(profile)
          }}>
            <option value="" disabled>Select saved profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="field endpoint-wide profile-name-field">
        <span>Profile name</span>
        <input value={draft.name} placeholder={activeProvider.profileName} onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>

      <div className="provider-picker" aria-label="Provider quick picks">
        {providerQuickPick.map((provider) => (
          <button
            className={`provider-chip ${provider.id === activeProvider.id ? 'active' : ''}`}
            key={provider.id}
            type="button"
            onClick={() => setProvider(provider.id)}
          >
            <span className="provider-glyph"><ProviderIcon provider={provider.id} size={17} /></span>
            <span className="provider-copy">
              <strong>{provider.label}</strong>
              <small>{providerSupportsModelList(provider.id) ? 'Models API' : 'Manual model'}</small>
            </span>
          </button>
        ))}
      </div>

      {showAdvancedFields ? (
        <div className="field-divider endpoint-wide connection-divider">
          <span>Connection</span>
          <small>{canRun ? 'Ready' : 'Required'}</small>
        </div>
      ) : null}

      <label className="field provider-field">
        <span>Provider</span>
        <select value={activeProvider.id} onChange={(event) => setProvider(event.target.value as ProviderId)}>
          {PROVIDER_PRESETS.map((provider) => (
            <option key={provider.id} value={provider.id}>{provider.label}</option>
          ))}
        </select>
      </label>

      <label className="field base-url-field">
        <span>Base URL</span>
        <input value={draft.baseUrl} placeholder={activeProvider.baseUrl || 'https://api.example.com'} onChange={(event) => updateDraft({ baseUrl: event.target.value })} />
      </label>

      <label className="field api-key-field">
        <span>API key</span>
        <div className="secret-field">
          <input value={draft.apiKey} type={showKey ? 'text' : 'password'} placeholder={keyIsLocked ? 'Encrypted key locked' : 'sk-...'} onChange={(event) => handleApiKeyChange(event.target.value)} />
          <button type="button" title={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((value) => !value)}>
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>

      <div className="key-trust-note endpoint-wide">
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>Your key stays under your control.</strong>
          <p>Stored in this browser; active requests pass through the BYOK Chat Cloudflare Worker in memory. We do not intentionally keep a server-side chat archive.</p>
          <a href="/privacy">See exactly how data moves</a>
        </div>
      </div>

      {showAdvancedFields ? (
        <label className="toggle-row endpoint-wide trust-row">
          <input
            type="checkbox"
            checked={keyStorage === 'passphrase'}
            disabled={!secureStorageAvailable && keyStorage !== 'passphrase'}
            onChange={(event) => {
              setKeyStorage(event.target.checked ? 'passphrase' : 'browser')
              setSecretDirty(Boolean(event.target.checked && draft.apiKey && !draft.encryptedApiKey))
            }}
          />
          <span>
            <strong>{keyStorage === 'passphrase' ? 'Passphrase-encrypted key' : 'Browser-only key'}</strong>
            <small>{secureStorageAvailable ? 'Passphrase is never saved.' : 'Web Crypto unavailable here.'}</small>
          </span>
        </label>
      ) : null}

      {keyIsLocked ? (
        <div className="key-unlock-row endpoint-wide">
          <label className="field unlock-passphrase-field">
            <span>Unlock passphrase</span>
            <input value={unlockPassphrase} type="password" placeholder="Passphrase" onChange={(event) => setUnlockPassphrase(event.target.value)} />
          </label>
          <button className="button secondary" type="button" onClick={() => { void unlockStoredKey() }} disabled={secretBusy}>
            <Unlock size={16} /> Unlock
          </button>
        </div>
      ) : keyStorage === 'passphrase' ? (
        <label className="field endpoint-wide passphrase-field">
          <span>Passphrase</span>
          <input value={passphrase} type="password" placeholder={draft.encryptedApiKey && !secretDirty ? 'Required only to replace key' : 'Required to save encrypted key'} onChange={(event) => setPassphrase(event.target.value)} />
        </label>
      ) : null}

      {showRunControls && showAdvancedFields ? (
        <>
          <label className="field endpoint-wide workspace-system-field">
            <span>System prompt</span>
            <textarea rows={3} value={draft.systemPrompt || ''} placeholder="Optional workspace instruction" onChange={(event) => updateDraft({ systemPrompt: event.target.value })} />
          </label>

          <div className="field-divider endpoint-wide">
            <span>Text controls</span>
            <small>{selectedMode === 'chat' ? 'Active' : 'Saved'}</small>
          </div>

          <div className="workspace-param-grid endpoint-wide">
            <label className="field">
              <span>Temperature</span>
              <input type="number" min="0" max="2" step="0.1" value={generationParams.temperature ?? ''} placeholder="Provider default" onChange={(event) => updateGenerationParams({ temperature: optionalNumber(event.target.value) })} />
            </label>
            <label className="field">
              <span>Max tokens</span>
              <input type="number" min="1" step="1" value={generationParams.maxTokens ?? ''} placeholder="4096" onChange={(event) => updateGenerationParams({ maxTokens: optionalNumber(event.target.value) })} />
            </label>
            <label className="field">
              <span>Reasoning effort</span>
              <select value={generationParams.reasoningEffort || ''} onChange={(event) => updateGenerationParams({ reasoningEffort: event.target.value as NonNullable<ByokProfile['generationParams']>['reasoningEffort'] || undefined })}>
                <option value="">Provider default</option>
                {REASONING_EFFORT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Image size</span>
              <select value={imageParams.size || ''} onChange={(event) => updateImageParams({ size: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['size'] || undefined })}>
                <option value="">Provider default</option>
                {IMAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Image quality</span>
              <select value={imageParams.quality || ''} onChange={(event) => updateImageParams({ quality: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['quality'] || undefined })}>
                <option value="">Provider default</option>
                {IMAGE_QUALITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Video size</span>
              <select value={videoParams.size || ''} onChange={(event) => updateVideoParams({ size: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['video']>['size'] || undefined })}>
                <option value="">Provider default</option>
                {VIDEO_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </>
      ) : null}

      {showAdvancedFields ? (
        <>
          <label className="field endpoint-wide workspace-notes-field">
            <span>Notes</span>
            <textarea rows={2} value={draft.notes || ''} placeholder="Why this workspace exists" onChange={(event) => updateDraft({ notes: event.target.value })} />
          </label>

          <label className="field endpoint-wide workspace-tags-field">
            <span>Tags</span>
            <input value={(draft.tags || []).join(', ')} placeholder="research, coding" onChange={(event) => updateDraft({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
          </label>
        </>
      ) : null}

      {showManualModel ? (
        <>
          <label className="field model-select typed-model-field">
            <span>Model</span>
            <input value={draft.selectedModel} placeholder={activeProvider.modelPlaceholder} onChange={(event) => updateDraft({ selectedModel: event.target.value })} />
          </label>
        </>
      ) : null}

      {showFetchedModels ? (
        <>
          <div className="model-fetch-row">
            <label className="field model-select">
              <span>Fetched models</span>
              <select value={draft.selectedModel} onChange={(event) => updateDraft({ selectedModel: event.target.value })}>
                {!selectedModelKnown && draft.selectedModel.trim() ? (
                  <option value={draft.selectedModel}>Use typed model: {draft.selectedModel}</option>
                ) : (
                  <option value="">{selectedModelKnown ? 'Select a model' : 'Use typed model ID'}</option>
                )}
                {filteredModels.map((model) => (
                  <option key={model.id} value={model.id} disabled={!modelCapabilities(model).length}>{modelOptionLabel(model)}</option>
                ))}
              </select>
            </label>
            <button className="button secondary fetch-button" type="button" onClick={refreshModels} disabled={fetchState === 'loading'}>
              <RotateCcw size={16} /> {fetchState === 'loading' ? 'Fetching' : 'Fetch models'}
            </button>
          </div>

          {draft.models.length ? (
            <label className="field endpoint-wide model-filter-field">
              <span>Filter fetched models</span>
              <div className="search-field">
                <Search size={15} />
                <input value={modelQuery} placeholder="Search models" onChange={(event) => setModelQuery(event.target.value)} />
              </div>
            </label>
          ) : null}

          <p className={`model-hint endpoint-wide ${selectedMode ? 'ready' : 'warn'}`}>{modelHint}</p>
        </>
      ) : null}

      {showAdvancedFields ? (
        <div className="endpoint-wide endpoint-toggle-stack">
          <label className="field">
            <span>Internet search API key</span>
            <input
              type="password"
              autoComplete="new-password"
              value={draft.searchApiKey || ''}
              placeholder="Jina or compatible search key"
              onChange={(event) => updateDraft({ searchApiKey: event.target.value })}
            />
            <small>Required for web search and public URL reading.</small>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={toolsAvailable && Boolean(draft.defaultTools?.webSearch)}
              disabled={!toolsAvailable || !draft.searchApiKey?.trim()}
              onChange={(event) => updateDraft({
                defaultTools: updateToolDefault(
                  updateToolDefault(draft.defaultTools, 'webSearch', { enabled: event.target.checked, permission: event.target.checked ? 'allow' : 'deny' }),
                  'readUrl',
                  { enabled: event.target.checked, permission: event.target.checked ? 'allow' : 'deny' },
                ),
              })}
            />
            <span>
              <strong>Internet access</strong>
              <small>{!draft.searchApiKey?.trim() ? 'Add a search API key first' : toolsAvailable ? 'Search the web and read public URLs' : activeProvider.supportsTools ? 'Select a chat model first' : 'Not supported by this preset'}</small>
            </span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={draft.defaultTools?.memory !== false}
              onChange={(event) => updateDraft({ defaultTools: { ...draft.defaultTools, memory: event.target.checked } })}
            />
            <span>
              <strong>Conversation memory</strong>
              <small>Use earlier messages from the current thread as context</small>
            </span>
          </label>
        </div>
      ) : null}

      <div className="endpoint-actions">
        {showAdvancedFields ? (
          <>
            <p className="export-safe-note">Profile export omits browser API keys. Encrypted keys stay encrypted.</p>
            <button className="button secondary" type="button" onClick={exportProfiles}>
              <Download size={16} /> Export
            </button>
            <button className="button secondary danger" type="button" onClick={deleteStoredKey} disabled={!draft.apiKey && !draft.encryptedApiKey}>
              <Trash2 size={16} /> Delete key
            </button>
            <button className="button secondary" type="button" onClick={() => newProfile()}>
              <Plus size={16} /> New
            </button>
          </>
        ) : null}
        <button className="button primary" type="button" onClick={() => { void saveDraft() }} disabled={secretBusy}>
          {keyStorage === 'passphrase' ? <Lock size={16} /> : <Save size={16} />} {secretBusy ? (isSetupFlow ? 'Connecting…' : 'Saving…') : (isSetupFlow ? 'Save & connect' : 'Save changes')}
        </button>
      </div>

      <p className="endpoint-status" role="status" aria-live="polite">{status}</p>
    </div>
  )
}
