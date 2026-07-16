import { Check, Loader2, Sparkles, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DiagnosticsResult } from '../../lib/api'
import type { ByokProfile } from '../../lib/profiles'
import type { RunMetadata } from '../../lib/threads'
import { TOOL_REGISTRY, type ToolId, type ToolPermission, type ToolSettings } from '../../lib/tools'
import { RunMetaBar } from './RunMetaBar'

export type CompareResult = {
  id: string
  profile: ByokProfile
  status: 'pending' | 'done' | 'error'
  text: string
  prompt: string
  metadata?: RunMetadata
}

function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="panel-head">
      <strong>{title}</strong>
      <button className="icon-button compact" type="button" title={`Close ${title}`} onClick={onClose}><X size={15} /></button>
    </div>
  )
}

export function ToolPanel({
  toolSettings,
  onToolSettingsChange,
  internetSetupRequired = false,
  onEnableInternet,
  onClose,
}: {
  toolSettings: ToolSettings
  onToolSettingsChange: (settings: ToolSettings) => void
  internetSetupRequired?: boolean
  onEnableInternet?: () => void
  onClose: () => void
}) {
  const searchKeyMissing = !toolSettings.searchApiKey?.trim()

  function updateTool(toolId: ToolId, patch: { enabled?: boolean; permission?: ToolPermission }) {
    onToolSettingsChange({
      ...toolSettings,
      enabled: { ...toolSettings.enabled, [toolId]: patch.enabled ?? toolSettings.enabled[toolId] },
      permissions: { ...toolSettings.permissions, [toolId]: patch.permission || toolSettings.permissions[toolId] },
    })
  }

  return (
    <aside className="workspace-panel" aria-label="Tools">
      <PanelHead title="Tools" onClose={onClose} />
      {internetSetupRequired ? (
        <div className="internet-key-callout" role="status">
          <strong>Add a search API key</strong>
          <p>Internet access needs a Jina or compatible search key before it can search or read public URLs.</p>
        </div>
      ) : null}
      <div className="tool-registry-list">
        {TOOL_REGISTRY.map((tool) => (
          <fieldset className="tool-registry-item" key={tool.id}>
            <legend>{tool.label}</legend>
            <p>{tool.description}</p>
            <label className="toggle-row compact-toggle">
              <input type="checkbox" checked={toolSettings.enabled[tool.id]} disabled={searchKeyMissing} onChange={(event) => updateTool(tool.id, { enabled: event.target.checked })} />
              <span><strong>Enabled for next turn</strong><small>{searchKeyMissing ? 'Add a search key below first.' : tool.needsInput === 'url-in-prompt' ? 'Requires a URL in the prompt.' : 'Uses the next prompt as the query.'}</small></span>
            </label>
            <label className="field">
              <span>Permission</span>
              <select value={toolSettings.permissions[tool.id] === 'allow' ? 'allow' : 'deny'} disabled={searchKeyMissing} onChange={(event) => updateTool(tool.id, { permission: event.target.value as ToolPermission })}>
                <option value="allow">Allow for next turn</option>
                <option value="deny">Deny</option>
              </select>
              <small>Tools only run when explicitly allowed.</small>
            </label>
          </fieldset>
        ))}
      </div>
      <label className="toggle-row compact-toggle">
        <input type="checkbox" checked={toolSettings.memory} onChange={(event) => onToolSettingsChange({ ...toolSettings, memory: event.target.checked })} />
        <span><strong>Conversation memory</strong><small>Include earlier messages from this thread in the next request.</small></span>
      </label>
      <label className="field">
        <span>Internet search API key</span>
        <input type="password" autoComplete="new-password" value={toolSettings.searchApiKey || ''} placeholder="Jina or compatible search key" onChange={(event) => onToolSettingsChange({ ...toolSettings, searchApiKey: event.target.value })} />
        <small>Used only for Internet requests in this browser session. Save it in Endpoint settings to keep it with this profile.</small>
      </label>
      {internetSetupRequired ? (
        <button className="button primary" type="button" disabled={searchKeyMissing} onClick={onEnableInternet}>Enable Internet</button>
      ) : null}
    </aside>
  )
}

export function ComparePanel({
  comparePrompt,
  setComparePrompt,
  runnableProfiles,
  compareProfileIds,
  setCompareProfileIds,
  compareResults,
  compareRunPrompt,
  runCompare,
  pickCompareWinner,
  onClose,
}: {
  comparePrompt: string
  setComparePrompt: (value: string) => void
  runnableProfiles: ByokProfile[]
  compareProfileIds: string[]
  setCompareProfileIds: (updater: (current: string[]) => string[]) => void
  compareResults: CompareResult[]
  compareRunPrompt: string
  runCompare: () => void
  pickCompareWinner: (result: CompareResult) => void
  onClose: () => void
}) {
  return (
    <aside className="workspace-panel compare-panel" aria-label="Compare models">
      <PanelHead title="Compare" onClose={onClose} />
      <textarea className="panel-textarea" rows={4} placeholder="Prompt to run across selected profiles" value={comparePrompt} onChange={(event) => setComparePrompt(event.target.value)} />
      <div className="compare-profile-list">
        {runnableProfiles.map((item) => (
          <label className="compare-profile" key={item.id}>
            <input
              type="checkbox"
              checked={compareProfileIds.includes(item.id)}
              onChange={(event) => setCompareProfileIds((current) => (
                event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
              ))}
            />
            <span>{item.name} <small>{item.selectedModel}</small></span>
          </label>
        ))}
      </div>
      <button className="button primary" type="button" onClick={runCompare} disabled={!compareProfileIds.length}>
        <Sparkles size={16} /> Run compare
      </button>
      {compareRunPrompt ? (
        <div className="compare-prompt-context">
          <span>Compared prompt</span>
          <p>{compareRunPrompt}</p>
        </div>
      ) : null}
      <div className="compare-results">
        {compareResults.map((result) => (
          <article className={`compare-card ${result.status}`} key={result.id}>
            <header>
              <strong>{result.profile.name}</strong>
              <small>{result.profile.selectedModel}</small>
            </header>
            <div className="compare-body">
              {result.status === 'pending' ? <Loader2 className="spin" size={16} /> : <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown>}
            </div>
            {result.metadata ? <RunMetaBar metadata={result.metadata} compact /> : null}
            {result.status === 'done' ? <button className="button secondary" type="button" onClick={() => pickCompareWinner(result)}><Check size={15} /> Pick winner</button> : null}
          </article>
        ))}
      </div>
    </aside>
  )
}

export function DiagnosticsPanel({
  diagnostics,
  diagnosticsBusy,
  onClose,
}: {
  diagnostics?: DiagnosticsResult
  diagnosticsBusy: boolean
  onClose: () => void
}) {
  return (
    <aside className="workspace-panel" aria-label="Provider diagnostics">
      <PanelHead title="Diagnostics" onClose={onClose} />
      {diagnosticsBusy ? <p className="panel-note">Checking provider...</p> : null}
      {diagnostics?.checks.map((check) => (
        <div className={`diagnostic-row ${check.status}`} key={`${check.label}-${check.message}`}>
          <strong>{check.label}</strong>
          <span>{check.message}</span>
        </div>
      ))}
    </aside>
  )
}

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{body}</p>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="button danger" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
