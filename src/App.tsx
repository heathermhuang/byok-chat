import { Check, Download, FolderDown, KeyRound, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { EndpointForm } from './components/EndpointForm'
import { ProviderIcon } from './components/ProviderIcon'
import { fetchModels, type MediaMode } from './lib/api'
import { capabilityLabel, getEffectiveModelCapabilities, getUnsupportedModelReason, normalizeBaseUrl, type ByokModel } from './lib/model-utils'
import { getProviderPreset, PROVIDER_PRESETS, providerSupportsModelList } from './lib/providers'
import { openPrivacySettings } from './lib/privacy'
import { cloneProfile, defaultProfile, exportProfilesSnapshot, loadProfiles, saveProfiles, upsertProfile, type ByokProfile, type ProviderId } from './lib/profiles'
import { canUseEncryptedStorage, decryptSecret, encryptSecret } from './lib/secure-storage'
import { createThread, exportThreadsSnapshot, loadThreadState, mergeImportedThreads, mergeThreadUpdate, parseThreadsImport, saveThreadState, searchThreads, sortThreads, upsertThread, type ByokThread } from './lib/threads'

const ByokAssistant = lazy(() => import('./components/ByokAssistant').then((module) => ({ default: module.ByokAssistant })))

function deploymentState(hostname: string) {
  if (hostname === 'byok.chat') return { label: 'Production', kind: 'production' }
  if (hostname === 'staging.byok.chat') return { label: 'Staging', kind: 'staging' }
  return { label: 'Local', kind: 'local' }
}

function profileModelCapabilities(profile: ByokProfile, model: ByokModel) {
  return getEffectiveModelCapabilities(model, { provider: profile.provider, baseUrl: profile.baseUrl })
}

function profileSelectedModel(profile: ByokProfile): ByokModel | undefined {
  const fetched = profile.models.find((item) => item.id === profile.selectedModel)
  if (fetched) return fetched
  const id = profile.selectedModel.trim()
  return id ? { id, name: id } : undefined
}

function profileCanRun(profile: ByokProfile) {
  const model = profileSelectedModel(profile)
  return Boolean(profile.baseUrl && profile.apiKey && model && profileModelCapabilities(profile, model).length > 0)
}

function selectFetchedModel(profile: ByokProfile, compatibleModels: ByokModel[]) {
  if (compatibleModels.some((model) => model.id === profile.selectedModel)) return profile.selectedModel
  return (
    compatibleModels.find((model) => profileModelCapabilities(profile, model).includes('chat')) ||
    compatibleModels[0]
  )?.id || profile.selectedModel
}

export function App() {
  const [{ profiles, activeProfileId }, setProfileState] = useState(loadProfiles)
  const [{ threads, activeThreadId }, setThreadState] = useState(loadThreadState)
  const [draft, setDraft] = useState<ByokProfile>(() => profiles.find((item) => item.id === activeProfileId) || profiles[0] || defaultProfile())
  const [showKey, setShowKey] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [status, setStatus] = useState('Profiles stay in this browser.')
  const [configOpen, setConfigOpen] = useState(false)
  const [keyStorage, setKeyStorage] = useState<'browser' | 'passphrase'>(() => draft.encryptedApiKey ? 'passphrase' : 'browser')
  const [passphrase, setPassphrase] = useState('')
  const [unlockPassphrase, setUnlockPassphrase] = useState('')
  const [secretBusy, setSecretBusy] = useState(false)
  const [secretDirty, setSecretDirty] = useState(false)
  const [threadQuery, setThreadQuery] = useState('')
  const [threadUndo, setThreadUndo] = useState<{ label: string; restore: () => void } | undefined>()
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const secureStorageAvailable = canUseEncryptedStorage()
  const deployment = deploymentState(globalThis.location?.hostname || 'local')

  useEffect(() => {
    saveProfiles(profiles, activeProfileId)
  }, [profiles, activeProfileId])

  useEffect(() => {
    try {
      saveThreadState(threads, activeThreadId)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save chat history.')
    }
  }, [threads, activeThreadId])

  useEffect(() => {
    if (!draft.id || threads.length) return
    const thread = createThread(draft.id)
    setThreadState({ threads: [thread], activeThreadId: thread.id })
  }, [draft.id, threads.length])

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase()
    if (!query) return draft.models
    return draft.models.filter((model) => [model.id, model.name, model.ownedBy].some((value) => String(value || '').toLowerCase().includes(query)))
  }, [draft.models, modelQuery])

  const activeProvider = getProviderPreset(draft.provider)
  const selectedModel = useMemo<ByokModel | undefined>(() => {
    const fetched = draft.models.find((item) => item.id === draft.selectedModel)
    if (fetched) return fetched
    const id = draft.selectedModel.trim()
    return id ? { id, name: id } : undefined
  }, [draft.models, draft.selectedModel])
  const selectedCapabilities = useMemo(() => (
    selectedModel ? getEffectiveModelCapabilities(selectedModel, { provider: draft.provider, baseUrl: draft.baseUrl }) : []
  ), [draft.baseUrl, draft.provider, selectedModel])

  const selectedUnsupportedReason = selectedModel
    ? getUnsupportedModelReason(selectedModel, { provider: draft.provider, baseUrl: draft.baseUrl })
    : ''

  const selectedMode = useMemo(() => {
    if (selectedCapabilities.includes('chat')) return 'chat'
    if (selectedCapabilities.includes('image_generation')) return 'image_generation'
    if (selectedCapabilities.includes('video_generation')) return 'video_generation'
    return ''
  }, [selectedCapabilities])

  const modeLabel = selectedMode === 'chat'
    ? 'Chat'
    : selectedMode === 'image_generation'
      ? 'Image'
      : selectedMode === 'video_generation'
        ? 'Video'
        : 'Setup'

  function updateDraft(patch: Partial<ByokProfile>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  async function profileWithFetchedModels(profile: ByokProfile) {
    const models = await fetchModels(profile)
    const compatibleModels = models.filter((model) => profileModelCapabilities(profile, model).length > 0)
    return {
      compatibleModels,
      profile: {
        ...profile,
        models,
        selectedModel: selectFetchedModel(profile, compatibleModels),
        lastFetchedAt: new Date().toISOString(),
      },
    }
  }

  async function saveDraft(nextDraft = draft, options: { status?: string; autoFetchModels?: boolean; closeWhenReady?: boolean } = {}) {
    setSecretBusy(true)
    try {
      let normalized: ByokProfile = { ...nextDraft, baseUrl: normalizeBaseUrl(nextDraft.baseUrl) }
      if (keyStorage === 'passphrase') {
        if (!secureStorageAvailable) {
          setStatus('Passphrase encryption is not available in this browser.')
          return false
        }
        if (normalized.apiKey && (secretDirty || !normalized.encryptedApiKey)) {
          normalized = {
            ...normalized,
            encryptedApiKey: await encryptSecret(normalized.apiKey, passphrase),
            keyStorage: 'passphrase',
          }
          setPassphrase('')
        } else if (normalized.encryptedApiKey) {
          normalized = { ...normalized, keyStorage: 'passphrase' }
        } else {
          setStatus('Enter an API key and passphrase before saving encrypted storage.')
          return false
        }
      } else {
        normalized = { ...normalized, encryptedApiKey: undefined, keyStorage: 'browser' }
      }
      let fetchMessage = ''
      let fetchFailed = false
      if (options.autoFetchModels && normalized.baseUrl && normalized.apiKey && providerSupportsModelList(normalized.provider)) {
        setFetchState('loading')
        try {
          const fetched = await profileWithFetchedModels(normalized)
          normalized = fetched.profile
          setFetchState('idle')
          if (fetched.compatibleModels.length) {
            fetchMessage = `Fetched ${fetched.compatibleModels.length} compatible models.`
          } else if (normalized.selectedModel) {
            fetchMessage = `No compatible models returned. Keeping typed model ${normalized.selectedModel}.`
          } else {
            fetchMessage = 'No compatible models returned. Enter a model ID manually.'
          }
        } catch (error) {
          setFetchState('error')
          fetchFailed = true
          fetchMessage = `Profile saved, but model fetch failed: ${error instanceof Error ? error.message : 'Failed to fetch models.'}`
        }
      }
      const nextProfiles = upsertProfile(profiles, normalized)
      setProfileState({ profiles: nextProfiles, activeProfileId: normalized.id })
      setDraft(normalized)
      setSecretDirty(false)
      if (options.closeWhenReady && !fetchFailed && profileCanRun(normalized)) setConfigOpen(false)
      if (fetchMessage) setStatus(fetchMessage)
      else if (options.status !== '') setStatus(options.status || 'Profile saved locally.')
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save profile.')
      return false
    } finally {
      setSecretBusy(false)
    }
  }

  function selectProfile(profile: ByokProfile) {
    setDraft(profile)
    setKeyStorage(profile.encryptedApiKey ? 'passphrase' : 'browser')
    setPassphrase('')
    setUnlockPassphrase('')
    setSecretDirty(false)
    const existingThread = sortThreads(threads.filter((thread) => thread.profileId === profile.id && !thread.archived))[0]
    if (existingThread) {
      setThreadState({ threads, activeThreadId: existingThread.id })
    } else {
      const thread = createThread(profile.id)
      setThreadState({ threads: upsertThread(threads, thread), activeThreadId: thread.id })
    }
    setProfileState({ profiles, activeProfileId: profile.id })
    setStatus(`Using ${profile.name}.`)
  }

  function newProfile(provider: ProviderId = 'openrouter') {
    const profile = cloneProfile(provider)
    const thread = createThread(profile.id)
    setDraft(profile)
    setKeyStorage('browser')
    setPassphrase('')
    setUnlockPassphrase('')
    setSecretDirty(false)
    setThreadState({ threads: upsertThread(threads, thread), activeThreadId: thread.id })
    setProfileState({ profiles, activeProfileId: '' })
    setModelQuery('')
    setStatus('New profile ready. Add a base URL, key, and model.')
  }

  function setProvider(provider: ProviderId) {
    const preset = getProviderPreset(provider)
    const currentDefaultName = getProviderPreset(draft.provider).profileName
    const currentName = draft.name.trim()
    updateDraft({
      provider: preset.id,
      name: !currentName || currentName === currentDefaultName ? preset.profileName : currentName,
      baseUrl: preset.baseUrl,
      selectedModel: preset.defaultModel,
      models: [],
    })
    setModelQuery('')
    setStatus(`${preset.label} endpoint selected.`)
  }

  function modelCapabilities(model: ByokModel) {
    return getEffectiveModelCapabilities(model, { provider: draft.provider, baseUrl: draft.baseUrl })
  }

  async function refreshModels() {
    if (!draft.baseUrl || !draft.apiKey) {
      setStatus('Base URL and API key are required before fetching models.')
      return
    }
    if (!providerSupportsModelList(draft.provider)) {
      setStatus(`${activeProvider.label} does not expose a model list here. Enter the model ID manually.`)
      return
    }
    setFetchState('loading')
    try {
      const fetched = await profileWithFetchedModels(draft)
      const nextDraft = fetched.profile
      const saved = await saveDraft(nextDraft, { status: '' })
      setFetchState('idle')
      if (!saved) return
      if (fetched.compatibleModels.length) {
        setStatus(`Fetched ${fetched.compatibleModels.length} compatible models.`)
      } else if (draft.selectedModel) {
        setStatus(`No compatible models returned. Keeping typed model ${draft.selectedModel}.`)
      } else {
        setStatus('No compatible models returned. Enter a model ID manually.')
      }
    } catch (error) {
      setFetchState('error')
      setStatus(error instanceof Error ? error.message : 'Failed to fetch models.')
    }
  }

  function handleApiKeyChange(apiKey: string) {
    setSecretDirty(true)
    updateDraft({ apiKey })
  }

  async function unlockStoredKey() {
    if (!draft.encryptedApiKey) {
      setStatus('This profile does not have an encrypted key.')
      return
    }
    setSecretBusy(true)
    try {
      const apiKey = await decryptSecret(draft.encryptedApiKey, unlockPassphrase)
      const unlocked = { ...draft, apiKey, keyStorage: 'passphrase' as const }
      setDraft(unlocked)
      setProfileState({ profiles: upsertProfile(profiles, unlocked), activeProfileId: unlocked.id })
      setUnlockPassphrase('')
      setSecretDirty(false)
      setStatus('Encrypted key unlocked for this session.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to unlock key.')
    } finally {
      setSecretBusy(false)
    }
  }

  function deleteStoredKey() {
    const cleared = { ...draft, apiKey: '', encryptedApiKey: undefined, keyStorage: 'browser' as const }
    setDraft(cleared)
    setKeyStorage('browser')
    setPassphrase('')
    setUnlockPassphrase('')
    setSecretDirty(false)
    setProfileState({ profiles: upsertProfile(profiles, cleared), activeProfileId: cleared.id })
    setStatus('API key deleted from this browser.')
  }

  function exportProfiles() {
    const snapshotProfiles = upsertProfile(profiles, draft)
    const blob = new Blob([exportProfilesSnapshot(snapshotProfiles, activeProfileId || draft.id)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `byok-chat-profiles-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Safe profile export created without browser API keys.')
  }

  function currentThread(): ByokThread {
    const found = threads.find((thread) => thread.id === activeThreadId && thread.profileId === draft.id && !thread.archived)
    if (found) return found
    const profileThread = sortThreads(threads.filter((thread) => thread.profileId === draft.id && !thread.archived))[0]
    if (profileThread) return profileThread
    return createThread(draft.id)
  }

  function setActiveThread(thread: ByokThread) {
    setThreadState((current) => mergeThreadUpdate(current.threads, current.activeThreadId, thread))
  }

  function newThread() {
    const thread = createThread(draft.id)
    setThreadState({ threads: upsertThread(threads, thread), activeThreadId: thread.id })
  }

  function archiveThread(threadId: string) {
    const previous = { threads, activeThreadId }
    const nextThreads = threads.map((thread) => thread.id === threadId ? { ...thread, archived: true, updatedAt: new Date().toISOString() } : thread)
    const nextActive = sortThreads(nextThreads.filter((thread) => !thread.archived && thread.profileId === draft.id))[0]
    setThreadUndo({ label: 'Thread archived.', restore: () => setThreadState(previous) })
    if (nextActive) setThreadState({ threads: nextThreads, activeThreadId: nextActive.id })
    else {
      const thread = createThread(draft.id)
      setThreadState({ threads: upsertThread(nextThreads, thread), activeThreadId: thread.id })
    }
  }

  function deleteThread(threadId: string) {
    const previous = { threads, activeThreadId }
    const nextThreads = threads.filter((thread) => thread.id !== threadId)
    const nextActive = sortThreads(nextThreads.filter((thread) => !thread.archived && thread.profileId === draft.id))[0]
    setThreadUndo({ label: 'Thread deleted.', restore: () => setThreadState(previous) })
    if (nextActive) setThreadState({ threads: nextThreads, activeThreadId: nextActive.id })
    else {
      const thread = createThread(draft.id)
      setThreadState({ threads: upsertThread(nextThreads, thread), activeThreadId: thread.id })
    }
  }

  function togglePinThread(threadId: string) {
    setThreadState({
      threads: threads.map((thread) => thread.id === threadId ? { ...thread, pinned: !thread.pinned, updatedAt: new Date().toISOString() } : thread),
      activeThreadId,
    })
  }

  function exportThreads() {
    const blob = new Blob([exportThreadsSnapshot(threads, activeThreadId)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `byok-chat-threads-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Thread export created.')
  }

  async function importThreads(file: File | undefined) {
    if (!file) return
    try {
      const imported = parseThreadsImport(await file.text())
      const merged = mergeImportedThreads(threads, imported)
      setThreadState({
        threads: merged.threads,
        activeThreadId: merged.threads[0]?.id || activeThreadId,
      })
      setStatus(`Imported ${merged.importedCount} threads${merged.renamedCount ? ` and renamed ${merged.renamedCount} duplicates` : ''}.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Thread import failed.')
    }
  }

  const draftIsSaved = Boolean(activeProfileId === draft.id && profiles.some((profile) => profile.id === draft.id))
  const isConfigured = Boolean(draftIsSaved && draft.baseUrl && draft.apiKey && draft.selectedModel)
  const canRun = Boolean(isConfigured && selectedMode)
  const inspectorOpen = configOpen
  const mediaMode = selectedMode === 'image_generation' || selectedMode === 'video_generation' ? selectedMode as MediaMode : undefined
  const toolsAvailable = selectedMode === 'chat' && activeProvider.supportsTools
  const selectedModelKnown = Boolean(draft.models.find((model) => model.id === draft.selectedModel))
  const providerQuickPick = PROVIDER_PRESETS
  const visibleProfiles = profiles.length ? profiles : [draft]
  const activeThread = currentThread()
  const visibleThreads = searchThreads(threads.filter((thread) => thread.profileId === draft.id), threadQuery)
  const compatibleModelCount = draft.models.filter((model) => modelCapabilities(model).length > 0).length
  const modelCountLabel = draft.models.length ? `${compatibleModelCount}/${draft.models.length}` : 'Manual'
  const capabilitySummary = selectedCapabilities.length
    ? selectedCapabilities.map(capabilityLabel).join(' / ')
    : selectedUnsupportedReason || 'No runnable mode'
  const keyIsLocked = Boolean(draft.encryptedApiKey && !draft.apiKey)
  const modelHint = selectedModel
    ? selectedCapabilities.length
      ? `${selectedModelKnown ? 'Fetched model' : 'Typed model fallback'} / ${selectedCapabilities.map(capabilityLabel).join(' / ')}`
      : selectedUnsupportedReason || 'Unsupported model.'
    : 'Enter a model ID to chat manually.'
  const endpointHost = (() => {
    if (!draft.baseUrl) return 'No endpoint'
    try {
      return new URL(draft.baseUrl).host
    } catch {
      return draft.baseUrl.replace(/^https?:\/\//, '') || 'Custom endpoint'
    }
  })()
  const setupSteps = [
    { label: 'Provider', complete: Boolean(draft.provider && draft.baseUrl) },
    { label: 'Key', complete: Boolean(draft.apiKey) },
    { label: 'Model', complete: Boolean(draft.selectedModel && selectedMode) },
  ]
  const shellClassName = [
    'app-shell',
    'one-page-app',
    canRun ? 'is-ready' : 'needs-setup',
    inspectorOpen ? 'inspector-open' : 'inspector-closed',
    profiles.length ? 'has-profiles' : 'no-profiles',
    `provider-${draft.provider.replace(/[^a-z0-9-]/gi, '-')}`,
    selectedMode ? `mode-${selectedMode}` : 'mode-setup',
  ].join(' ')

  function renderEndpointForm() {
    return (
      <EndpointForm
        activeProvider={activeProvider}
        activeProfileId={activeProfileId}
        canRun={canRun}
        deleteStoredKey={deleteStoredKey}
        draft={draft}
        exportProfiles={exportProfiles}
        fetchState={fetchState}
        filteredModels={filteredModels}
        handleApiKeyChange={handleApiKeyChange}
        keyIsLocked={keyIsLocked}
        keyStorage={keyStorage}
        modelCapabilities={modelCapabilities}
        modelHint={modelHint}
        modelQuery={modelQuery}
        newProfile={newProfile}
        passphrase={passphrase}
        profiles={profiles}
        providerQuickPick={providerQuickPick}
        refreshModels={refreshModels}
        saveDraft={() => saveDraft(draft, { autoFetchModels: true, closeWhenReady: true })}
        secretBusy={secretBusy}
        secretDirty={secretDirty}
        secureStorageAvailable={secureStorageAvailable}
        selectProfile={selectProfile}
        selectedMode={selectedMode}
        selectedModelKnown={selectedModelKnown}
        showRunControls={!canRun}
        isSetupFlow={!canRun}
        setKeyStorage={setKeyStorage}
        setModelQuery={setModelQuery}
        setPassphrase={setPassphrase}
        setProvider={setProvider}
        setSecretDirty={setSecretDirty}
        setShowKey={setShowKey}
        setUnlockPassphrase={setUnlockPassphrase}
        showKey={showKey}
        status={status}
        toolsAvailable={toolsAvailable}
        unlockPassphrase={unlockPassphrase}
        unlockStoredKey={unlockStoredKey}
        updateDraft={updateDraft}
      />
    )
  }

  return (
    <main className={shellClassName}>
      <aside className="lab-sidebar" aria-label="Profiles">
        <div className="brand-block">
          <span className="brand-mark">
            <span>BYOK</span>
          </span>
          <div>
            <h1>BYOK Chat</h1>
            <p>Private model workspace</p>
          </div>
        </div>

        <section className="rail-section">
          <div className="section-head">
            <span>Profiles</span>
            <span>{visibleProfiles.length}</span>
          </div>
          <div className="profile-list">
            {visibleProfiles.map((profile) => {
              const provider = getProviderPreset(profile.provider)
              const isActive = activeProfileId ? profile.id === activeProfileId : profile.id === draft.id
              const canSelect = profiles.some((item) => item.id === profile.id)
              return (
                <button
                  className={`profile-item ${isActive ? 'active' : ''}`}
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    if (canSelect) selectProfile(profile)
                    else setStatus('Save this profile to keep it in the rail.')
                  }}
                >
                  <span className="profile-topline">
                    <span className="provider-mini"><ProviderIcon provider={profile.provider} size={16} /></span>
                    <strong>{profile.name || provider.label}</strong>
                  </span>
                  <span>{profile.selectedModel || 'model-id'}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rail-section thread-rail-section">
          <div className="section-head">
            <span>Threads</span>
            <span>{visibleThreads.length}</span>
          </div>
          <div className="rail-search">
            <Search size={14} />
            <input aria-label="Search threads" value={threadQuery} placeholder="Search threads" onChange={(event) => setThreadQuery(event.target.value)} />
          </div>
          <div className="thread-list">
            {visibleThreads.map((thread) => (
              <button
                className={`thread-item ${thread.id === activeThread.id ? 'active' : ''}`}
                key={thread.id}
                type="button"
                onClick={() => setThreadState({ threads, activeThreadId: thread.id })}
              >
                <strong>{thread.title}</strong>
                <span>{thread.messages.length} messages{thread.pinned ? ' / pinned' : ''}</span>
              </button>
            ))}
          </div>
          <div className="thread-actions">
            <button className="icon-button compact" type="button" title="New thread" onClick={newThread}>
              <Plus size={15} />
            </button>
            <button className="icon-button compact" type="button" title="Export threads" onClick={exportThreads}>
              <Download size={15} />
            </button>
            <button className="icon-button compact" type="button" title="Import threads" onClick={() => importInputRef.current?.click()}>
              <FolderDown size={15} />
            </button>
            <input
              ref={importInputRef}
              className="visually-hidden"
              type="file"
              accept="application/json"
              onChange={(event) => {
                void importThreads(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
        </section>

        <div className="rail-footer">
          <button className="button secondary rail-new-profile" type="button" onClick={() => newProfile()}>
            <Plus size={16} /> New profile
          </button>
          <nav className="rail-legal" aria-label="Legal and privacy">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/cookies">Cookies</a>
            <button type="button" onClick={openPrivacySettings}>Settings</button>
          </nav>
        </div>
      </aside>

      <section className="console-main">
        <header className="console-strip">
          <div className="strip-title">
            <p className="eyebrow">Private model workspace</p>
            <h1>{canRun ? `Chat with ${draft.selectedModel}` : 'Connect a model, then start talking.'}</h1>
            <p className="strip-copy">{activeProvider.label} / {endpointHost} / {capabilitySummary}</p>
          </div>
          <div className="strip-controls">
            <div className="strip-meter" aria-label="Current session status">
              <span className={`deploy-pill ${deployment.kind}`}>
                {deployment.label}
              </span>
              <span className={`status-pill ${canRun ? 'ready' : 'setup'}`}>
                {canRun ? <Check size={15} /> : <KeyRound size={15} />}
                {canRun ? `${modeLabel} ready` : 'Setup needed'}
              </span>
              <span>{modelCountLabel} models</span>
            </div>
            {canRun ? (
              <button
                className="button secondary inspector-toggle"
                type="button"
                aria-label={inspectorOpen ? 'Close endpoint' : 'Endpoint'}
                onClick={() => setConfigOpen((value) => !value)}
              >
                <SlidersHorizontal size={16} /> <span>{inspectorOpen ? 'Close endpoint' : 'Endpoint'}</span>
              </button>
            ) : null}
          </div>
        </header>

        <section className={`chat-frame ${canRun ? '' : 'disabled'}`}>
          {threadUndo ? (
            <div className="undo-toast" role="status" aria-live="polite">
              <span>{threadUndo.label}</span>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  threadUndo.restore()
                  setThreadUndo(undefined)
                }}
              >
                Undo
              </button>
              <button className="icon-button compact" type="button" title="Dismiss undo" onClick={() => setThreadUndo(undefined)}>
                <X size={14} />
              </button>
            </div>
          ) : null}
          {canRun ? (
            <Suspense fallback={<div className="empty-state compact"><h2>Loading workspace</h2></div>}>
              <ByokAssistant
                key={`${draft.id}:${activeThread.id}:${selectedMode}`}
                profile={draft}
                profiles={profiles}
                thread={activeThread}
                mode={selectedMode === 'chat' ? 'chat' : mediaMode || 'chat'}
                onThreadChange={setActiveThread}
                onNewThread={newThread}
                onArchiveThread={archiveThread}
                onDeleteThread={deleteThread}
                onTogglePinThread={togglePinThread}
                onProfileChange={updateDraft}
                onSaveProfile={() => saveDraft()}
                onRefreshModels={() => { void refreshModels() }}
                fetchState={fetchState}
                status={status}
              />
            </Suspense>
          ) : (
            <div className="setup-state">
              <div className="setup-copy">
                <div className={`setup-status-mark ${canRun ? 'ready' : 'setup'}`} aria-hidden="true">
                  <span className="status-dot" />
                  <span className="status-line" />
                  <span className="status-cursor" />
                </div>
                <p className="eyebrow">Private BYOK endpoint</p>
                <h2>{selectedUnsupportedReason ? 'Select a supported model.' : 'Connect a provider.'}</h2>
                <p>{selectedUnsupportedReason || 'Add a key and choose a model. Chat opens as soon as the profile can run.'}</p>
                <div className="setup-mode-card" aria-label="Current run mode">
                  <span>{canRun ? modeLabel : 'Setup'}</span>
                  <div className="mode-route" aria-label="Setup path">
                    <span>Provider</span>
                    <span>Key</span>
                    <span>Model</span>
                  </div>
                  <strong>{canRun ? 'Ready' : 'Waiting for setup'}</strong>
                </div>
                <div className="setup-steps" aria-label="Setup progress">
                  {setupSteps.map((step, index) => (
                    <div className={`setup-step ${step.complete ? 'complete' : ''}`} key={step.label}>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>
              </div>
              {renderEndpointForm()}
            </div>
          )}
        </section>
      </section>

      {configOpen && canRun ? (
        <>
          <button className="endpoint-scrim" type="button" aria-label="Close endpoint setup" onClick={() => setConfigOpen(false)} />
          <aside className="endpoint-drawer" aria-label="Endpoint setup">
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Endpoint</span>
                <strong>{draft.selectedModel || activeProvider.modelPlaceholder}</strong>
                <small>{activeProvider.label} / {endpointHost} / {capabilitySummary}</small>
              </div>
              <button className="icon-button compact" type="button" title="Close endpoint" onClick={() => setConfigOpen(false)}>
                <X size={15} />
              </button>
            </div>
            {renderEndpointForm()}
          </aside>
        </>
      ) : null}
    </main>
  )
}
