import {
  ActionBarPrimitive,
  AttachmentPrimitive,
  AssistantRuntimeProvider,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type DataMessagePartProps,
  type ExternalStoreAdapter,
  type ImageMessagePartProps,
  type SourceMessagePartProps,
  type TextMessagePartProps,
  type ThreadMessageLike,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react'
import {
  Archive,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  CopyPlus,
  Download,
  FileText,
  Gauge,
  Brain,
  Globe2,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  Square,
  Wrench,
  X,
  PanelRightOpen,
  Pin,
  PinOff,
  Paperclip,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  IMAGE_BACKGROUND_OPTIONS,
  IMAGE_FORMAT_OPTIONS,
  IMAGE_QUALITY_OPTIONS,
  IMAGE_SIZE_OPTIONS,
  REASONING_EFFORT_OPTIONS,
  VERBOSITY_OPTIONS,
  VIDEO_SECOND_OPTIONS,
  VIDEO_SIZE_OPTIONS,
} from '../lib/generation-options'
import { checkMediaJob, diagnoseProvider, generateMedia, sendChat, type ChatToolSettings, type DiagnosticsResult, type GeneratedMediaAttachment, type MediaGenerationResult, type MediaMode } from '../lib/api'
import { capabilityLabel, getEffectiveModelCapabilities, getUnsupportedModelReason } from '../lib/model-utils'
import type { ByokProfile } from '../lib/profiles'
import { createId, type ByokThread, type RunMetadata, type ThreadMessage } from '../lib/threads'
import { createToolSettings } from '../lib/tools'
import { ComparePanel, ConfirmDialog, DiagnosticsPanel, ToolPanel, type CompareResult } from './assistant/WorkspacePanels'
import { RunMetaBar } from './assistant/RunMetaBar'
import { attachmentOnlyPrompt, ByokAttachmentAdapter, formatAttachmentSize, inputAttachmentsFromAppend, type InputAttachment } from '../lib/attachments'

type ByokAssistantProps = {
  profile: ByokProfile
  profiles: ByokProfile[]
  thread: ByokThread
  mode: 'chat' | MediaMode
  onThreadChange: (thread: ByokThread) => void
  onNewThread: () => void
  onArchiveThread: (threadId: string) => void
  onDeleteThread: (threadId: string) => void
  onTogglePinThread: (threadId: string) => void
  onProfileChange: (patch: Partial<ByokProfile>) => void
  onSaveProfile: () => Promise<boolean>
  onRefreshModels: () => void
  fetchState: 'idle' | 'loading' | 'error'
  status: string
}

type ByokMessageCustom = {
  metadata?: RunMetadata
  attachments?: GeneratedMediaAttachment[]
  actionContext?: ThreadMessage['actionContext']
  status?: ThreadMessage['status']
  model?: string
}

type AuiContentPart = Exclude<ThreadMessageLike['content'], string>[number]
type WorkspacePanelId = 'tools' | 'compare' | 'diagnostics' | 'settings'

function now() {
  return new Date().toISOString()
}

function textTitle(text: string) {
  return text.trim().replace(/\s+/g, ' ').slice(0, 58) || 'New thread'
}

function updateThread(thread: ByokThread, patch: Partial<ByokThread>): ByokThread {
  return { ...thread, ...patch, updatedAt: now() }
}

function appendMessageText(message: AppendMessage) {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('\n')
    .trim()
}

const MEDIA_JOB_POLL_DELAYS_MS = [3_000, 5_000, 8_000, 10_000, 15_000, 20_000, 30_000, 30_000, 30_000, 30_000]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pendingVideoText(result: MediaGenerationResult): string {
  const status = result.pendingJob?.status || 'pending'
  return `Video is still generating upstream (${status}). I'll keep checking until it is ready.`
}

function unresolvedVideoJob(result: MediaGenerationResult): boolean {
  return Boolean(result.pendingJob?.requestId && !result.attachments.length)
}

function byokStatus(message: ThreadMessage): ThreadMessageLike['status'] {
  if (message.status === 'pending') return { type: 'running' }
  if (message.status === 'error') return { type: 'incomplete', reason: 'error', error: message.text }
  return { type: 'complete', reason: 'stop' }
}

function convertByokMessage(message: ThreadMessage): ThreadMessageLike {
  const createdAt = new Date(message.createdAt)
  const custom: ByokMessageCustom = {
    metadata: message.metadata,
    attachments: message.attachments,
    actionContext: message.actionContext,
    status: message.status,
    model: message.metadata?.model,
  }

  if (message.role === 'user') {
    const content: AuiContentPart[] = [{ type: 'text', text: message.text }]
    for (const attachment of message.inputAttachments || []) {
      content.push({ type: 'data', name: 'input-attachment', data: attachment })
    }
    return {
      id: message.id,
      role: 'user',
      createdAt,
      content,
      metadata: { custom: { byok: custom } },
    }
  }

  const content: AuiContentPart[] = []
  if (message.text.trim()) content.push({ type: 'text', text: message.text })

  for (const attachment of message.attachments || []) {
    if (attachment.kind === 'image') {
      content.push({ type: 'image', image: attachment.url, filename: attachment.name })
    } else {
      content.push({ type: 'data', name: 'media-attachment', data: attachment })
    }
  }

  for (const toolRecord of message.tools || []) {
    if (toolRecord.url) {
      content.push({
        type: 'source',
        sourceType: 'url',
        id: toolRecord.sourceId || toolRecord.id,
        url: toolRecord.url,
        title: toolRecord.title || toolRecord.url,
      })
    }
    content.push({
      type: 'tool-call',
      toolCallId: toolRecord.id,
      toolName: toolRecord.name,
      args: {
        input: toolRecord.input,
        sourceId: toolRecord.sourceId || '',
        url: toolRecord.url || '',
      },
      result: toolRecord.result ?? {
        status: toolRecord.status,
        title: toolRecord.title,
        url: toolRecord.url,
        excerpt: toolRecord.excerpt,
      },
      isError: toolRecord.status === 'error',
    })
  }

  return {
    id: message.id,
    role: 'assistant',
    createdAt,
    content,
    status: byokStatus(message),
    metadata: { custom: { byok: custom } },
  }
}

function MarkdownTextPart({ text, status }: TextMessagePartProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {status.type === 'running' ? <span className="loading-inline">Working...</span> : null}
    </div>
  )
}

function SourcePart({ url, title }: SourceMessagePartProps) {
  return (
    <a className="source-citation" href={url} target="_blank" rel="noreferrer">
      <FileText size={14} />
      <span>{title || url}</span>
    </a>
  )
}

function ImagePart({ image, filename }: ImageMessagePartProps) {
  return (
    <figure className="media-asset aui-media-asset">
      <img alt={filename || 'Generated image'} src={image} />
      <figcaption>
        <span>{filename || 'image'}</span>
        <a href={image} download={filename || 'image'} title="Download media"><Download size={14} /></a>
      </figcaption>
    </figure>
  )
}

function MediaDataPart({ name, data }: DataMessagePartProps) {
  if (name !== 'media-attachment' || !data || typeof data !== 'object') return null
  const attachment = data as GeneratedMediaAttachment
  return (
    <figure className="media-asset aui-media-asset">
      {attachment.kind === 'image' ? <img alt={attachment.name} src={attachment.url} /> : <video controls src={attachment.url} />}
      <figcaption>
        <span>{attachment.mediaType}</span>
        <a href={attachment.url} download={attachment.name} title="Download media"><Download size={14} /></a>
      </figcaption>
    </figure>
  )
}

function InputAttachmentPart({ name, data }: DataMessagePartProps) {
  if (name !== 'input-attachment' || !data || typeof data !== 'object') return null
  const attachment = data as InputAttachment
  return (
    <div className="input-attachment-card">
      {attachment.kind === 'image' && attachment.dataUrl
        ? <img src={attachment.dataUrl} alt={`Attached ${attachment.name}`} />
        : <FileText size={18} aria-hidden="true" />}
      <span>
        <strong>{attachment.name}</strong>
        <small>{attachment.mediaType} / {formatAttachmentSize(attachment.size)}</small>
      </span>
      {!attachment.dataUrl ? <em>Re-attach to send again</em> : null}
    </div>
  )
}

function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="attachment-chip">
      <FileText size={14} aria-hidden="true" />
      <AttachmentPrimitive.Name />
      <AttachmentPrimitive.Remove title="Remove attachment"><X size={13} /></AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  )
}

function ToolCallPart({ toolName, args, result, isError }: ToolCallMessagePartProps) {
  return (
    <div className={`tool-card ${isError ? 'error' : ''}`}>
      <div className="tool-card-head">
        <span><Wrench size={14} /> {toolName}</span>
        <small>{isError ? 'error' : 'done'}</small>
      </div>
      <div className="tool-card-grid">
        <div className="tool-value">
          <span>Input</span>
          <pre>{JSON.stringify(args, null, 2)}</pre>
        </div>
        {result !== undefined ? (
          <div className="tool-value">
            <span>Result</span>
            <pre>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </div>
    </div>
  )
}

const messagePartComponents = {
  Text: MarkdownTextPart,
  Source: SourcePart,
  Image: ImagePart,
  data: { by_name: { 'media-attachment': MediaDataPart, 'input-attachment': InputAttachmentPart } },
  tools: { Fallback: ToolCallPart },
}

function ByokAuiMessage({
  model,
  onEditStart,
  onVariationMessageId,
  onCheckMediaJob,
}: {
  model: string
  onEditStart: () => void
  onVariationMessageId: (messageId: string) => void
  onCheckMediaJob: (messageId: string) => void
}) {
  const role = useAuiState((state) => state.message.role)
  const messageId = useAuiState((state) => state.message.id)
  const createdAt = useAuiState((state) => state.message.createdAt)
  const isRunning = useAuiState((state) => state.message.status?.type === 'running')
  const custom = useAuiState((state) => (state.message.metadata.custom?.byok || {}) as ByokMessageCustom)
  const label = role === 'user' ? 'You' : custom.metadata?.model || custom.model || model
  const hasPendingVideoJob = role === 'assistant' && Boolean(custom.actionContext?.mediaJob?.requestId && !custom.attachments?.length)

  return (
    <MessagePrimitive.Root className={`message message-${role === 'user' ? 'user' : 'assistant'} ${custom.status === 'error' ? 'message-error-state' : ''}`}>
      <div className="message-avatar" aria-hidden="true">
        {role === 'user' ? <span className="user-dot">U</span> : <span className="assistant-dot">AI</span>}
      </div>
      <div className="message-body">
        <div className="message-meta-line">
          <span>{label}</span>
          <time>{createdAt.toLocaleString()}</time>
        </div>
        <MessagePrimitive.Parts components={messagePartComponents} />
        {custom.metadata ? <RunMetaBar metadata={custom.metadata} compact /> : null}
        {custom.status === 'error' ? (
          <ErrorPrimitive.Root className="message-error">
            <span>Request failed</span>
          </ErrorPrimitive.Root>
        ) : null}
        <div className="message-controls">
          <BranchPickerPrimitive.Root className="branch-picker" hideWhenSingleBranch>
            <BranchPickerPrimitive.Previous title="Previous branch"><ChevronLeft size={14} /></BranchPickerPrimitive.Previous>
            <span><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
            <BranchPickerPrimitive.Next title="Next branch"><ChevronRight size={14} /></BranchPickerPrimitive.Next>
          </BranchPickerPrimitive.Root>
          <ActionBarPrimitive.Root className="message-actions">
            <MessagePrimitive.If user>
              <EditPromptButton onEditStart={onEditStart} />
            </MessagePrimitive.If>
            <MessagePrimitive.If assistant>
              <ActionBarPrimitive.Reload title="Retry"><RefreshCcw size={14} /></ActionBarPrimitive.Reload>
              <button type="button" title="Variation" disabled={isRunning} onClick={() => onVariationMessageId(messageId)}>
                <Sparkles size={14} />
              </button>
              {hasPendingVideoJob ? (
                <button type="button" title="Check video status" disabled={isRunning} onClick={() => onCheckMediaJob(messageId)}>
                  <RefreshCw size={14} />
                </button>
              ) : null}
            </MessagePrimitive.If>
            <ActionBarPrimitive.Copy title="Copy message">
              <Clipboard className="copy-idle" size={14} />
              <Check className="copy-done" size={14} />
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.ExportMarkdown title="Download markdown">
              <Download size={14} />
            </ActionBarPrimitive.ExportMarkdown>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  )
}

function EditPromptButton({ onEditStart }: { onEditStart: () => void }) {
  const aui = useAui()
  return (
    <button
      type="button"
      title="Edit prompt"
      onClick={() => {
        onEditStart()
        aui.composer().beginEdit()
      }}
    >
      <Pencil size={14} />
    </button>
  )
}

function ByokEditComposer({ onEditingDone }: { onEditingDone: () => void }) {
  return (
    <MessagePrimitive.Root className="message message-user message-editing">
      <div className="message-avatar" aria-hidden="true"><span className="user-dot">U</span></div>
      <div className="message-body">
        <div className="edit-banner" role="status">
          <span>Editing an earlier prompt. Sending will replace that branch.</span>
          <ComposerPrimitive.Cancel className="icon-button compact" type="button" title="Cancel edit" onClick={onEditingDone}><X size={14} /></ComposerPrimitive.Cancel>
        </div>
        <ComposerPrimitive.Root className="composer edit-composer">
          <div className="composer-input-shell">
            <ComposerPrimitive.Input className="composer-input" autoFocus placeholder="Ask anything" submitMode="enter" />
          </div>
          <div className="composer-toolbar">
            <ComposerPrimitive.Cancel className="button secondary" type="button" title="Cancel changes" onClick={onEditingDone}><X size={14} /> Cancel</ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send className="send-button" title="Save edit" onClick={onEditingDone}><Send size={16} /></ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  )
}

export function ByokAssistant({
  profile,
  profiles,
  thread,
  mode,
  onThreadChange,
  onNewThread,
  onArchiveThread,
  onDeleteThread,
  onTogglePinThread,
  onProfileChange,
  onSaveProfile,
  onRefreshModels,
  fetchState,
  status,
}: ByokAssistantProps) {
  const [sending, setSending] = useState(false)
  const [activePanel, setActivePanel] = useState<WorkspacePanelId | null>(null)
  const [threadMenuOpen, setThreadMenuOpen] = useState(false)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | undefined>()
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false)
  const [toolSettings, setToolSettings] = useState<ChatToolSettings>(() => createToolSettings(profile.defaultTools, profile.searchApiKey))
  const [internetSetupRequired, setInternetSetupRequired] = useState(false)
  const [comparePrompt, setComparePrompt] = useState('')
  const [compareRunPrompt, setCompareRunPrompt] = useState('')
  const [compareProfileIds, setCompareProfileIds] = useState<string[]>(() => profiles.filter((item) => item.apiKey && item.selectedModel).slice(0, 3).map((item) => item.id))
  const [compareResults, setCompareResults] = useState<CompareResult[]>([])
  const [editingActive, setEditingActive] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ title: string; body: string; confirmLabel: string; run: () => void } | undefined>()
  const attachmentAdapter = useMemo(() => new ByokAttachmentAdapter(), [])
  const runnableCompareProfiles = profiles.filter((item) => item.apiKey && item.selectedModel)
  const modeLabel = mode === 'chat' ? 'Chat' : mode === 'image_generation' ? 'Image' : 'Video'

  useEffect(() => {
    setToolSettings(createToolSettings(profile.defaultTools, profile.searchApiKey))
  }, [profile.defaultTools, profile.id, profile.searchApiKey])

  function commitMessages(messages: ThreadMessage[]) {
    const title = thread.title === 'New thread' ? textTitle(messages.find((message) => message.role === 'user')?.text || '') : thread.title
    onThreadChange(updateThread(thread, { messages, title }))
  }

  function togglePanel(panel: WorkspacePanelId) {
    setActivePanel((current) => current === panel ? null : panel)
  }

  function setInternetAccess(enabled: boolean) {
    if (enabled && !toolSettings.searchApiKey?.trim()) {
      setInternetSetupRequired(true)
      setActivePanel('tools')
      return
    }
    setInternetSetupRequired(false)
    setToolSettings((current) => ({
      ...current,
      enabled: { ...current.enabled, webSearch: enabled, readUrl: enabled },
      permissions: { ...current.permissions, webSearch: enabled ? 'allow' : 'deny', readUrl: enabled ? 'allow' : 'deny' },
    }))
  }

  function enableInternetFromSetup() {
    if (!toolSettings.searchApiKey?.trim()) return
    setInternetAccess(true)
    setActivePanel(null)
  }

  function setMemoryEnabled(enabled: boolean) {
    setToolSettings((current) => ({ ...current, memory: enabled }))
  }

  async function completePendingTurn(options: {
    requestMessages: ThreadMessage[]
    displayMessages: ThreadMessage[]
    assistantId: string
    promptText: string
    runMode: 'chat' | MediaMode
    sourceMessageId?: string
    variation?: boolean
    inputAttachments?: InputAttachment[]
  }) {
    setSending(true)
    try {
      if (options.runMode === 'chat') {
        const result = await sendChat(profile, options.requestMessages, toolSettings)
        commitMessages(options.displayMessages.map((message) => (
          message.id === options.assistantId
            ? {
                ...message,
                text: result.text || 'No text returned.',
                status: undefined,
                metadata: { ...result.metadata, mode: 'chat' },
                tools: result.tools,
                actionContext: { promptText: options.promptText, mode: 'chat', sourceMessageId: options.sourceMessageId },
              }
            : message
        )))
      } else {
        const mediaPrompt = options.variation ? `${options.promptText}\n\nCreate a distinct variation with a different composition.` : options.promptText
        let result = await generateMedia(profile, options.runMode, mediaPrompt, options.inputAttachments)
        let currentDisplayMessages = options.displayMessages

        if (options.runMode === 'video_generation' && unresolvedVideoJob(result)) {
          for (const delayMs of MEDIA_JOB_POLL_DELAYS_MS) {
            const pendingJob = result.pendingJob
            if (!pendingJob) break
            currentDisplayMessages = currentDisplayMessages.map((message) => (
              message.id === options.assistantId
                ? {
                    ...message,
                    text: pendingVideoText(result),
                    status: 'pending',
                    attachments: result.attachments,
                    metadata: {
                      provider: profile.provider,
                      model: profile.selectedModel,
                      mode: options.runMode,
                      statusCode: result.upstreamStatus,
                      createdAt: now(),
                    },
                    actionContext: {
                      promptText: options.promptText,
                      mode: options.runMode,
                      sourceMessageId: options.sourceMessageId,
                      mediaJob: pendingJob,
                    },
                  }
                : message
            ))
            commitMessages(currentDisplayMessages)
            await wait(delayMs)
            result = await checkMediaJob(profile, pendingJob)
            if (!unresolvedVideoJob(result)) break
          }
        }

        const mediaJob = result.pendingJob
        commitMessages(currentDisplayMessages.map((message) => (
          message.id === options.assistantId
            ? {
                ...message,
                text: mediaJob && !result.attachments.length
                  ? `Video is still generating upstream (${mediaJob.status || 'pending'}). The job is saved here; use Check video status to refresh.`
                  : result.text || `${modeLabel} generated.`,
                status: undefined,
                attachments: result.attachments,
                metadata: {
                  provider: profile.provider,
                  model: profile.selectedModel,
                  mode: options.runMode,
                  statusCode: result.upstreamStatus,
                  createdAt: now(),
                },
                actionContext: {
                  promptText: options.promptText,
                  mode: options.runMode,
                  sourceMessageId: options.sourceMessageId,
                  ...(mediaJob ? { mediaJob } : {}),
                },
              }
            : message
        )))
      }
    } catch (error) {
      commitMessages(options.displayMessages.map((message) => (
        message.id === options.assistantId
          ? {
              ...message,
              text: error instanceof Error ? error.message : 'Request failed.',
              status: 'error',
              actionContext: { promptText: options.promptText, mode: options.runMode, sourceMessageId: options.sourceMessageId },
            }
          : message
      )))
    } finally {
      setSending(false)
    }
  }

  async function submitTurn(text: string, baseMessages: ThreadMessage[], runMode: 'chat' | MediaMode, options: { sourceMessageId?: string; variation?: boolean; inputAttachments?: InputAttachment[] } = {}) {
    const existingSource = options.sourceMessageId ? thread.messages.find((message) => message.id === options.sourceMessageId) : undefined
    const inputAttachments = options.inputAttachments?.length ? options.inputAttachments : existingSource?.inputAttachments || []
    const promptText = text.trim() || attachmentOnlyPrompt(runMode, inputAttachments)
    if (!promptText || sending) return
    const userMessage: ThreadMessage = existingSource?.role === 'user'
      ? { ...existingSource, id: createId('message'), text: promptText, inputAttachments, createdAt: now() }
      : { id: createId('message'), role: 'user', text: promptText, inputAttachments, createdAt: now() }
    const assistantId = createId('message')
    const pendingText = runMode === 'chat' ? 'Thinking...' : `${modeLabel} generation started.`
    const pendingMessage: ThreadMessage = { id: assistantId, role: 'assistant', text: pendingText, createdAt: now(), status: 'pending' }
    const nextMessages = [...baseMessages, userMessage, pendingMessage]
    commitMessages(nextMessages)
    await completePendingTurn({
      requestMessages: nextMessages.filter((message) => message.id !== assistantId),
      displayMessages: nextMessages,
      assistantId,
      promptText,
      runMode,
      sourceMessageId: userMessage.id,
      variation: options.variation,
      inputAttachments,
    })
  }

  async function submitAuiMessage(message: AppendMessage) {
    const text = appendMessageText(message)
    await submitTurn(text, thread.messages, mode, { inputAttachments: inputAttachmentsFromAppend(message) })
  }

  async function editAuiMessage(message: AppendMessage) {
    setEditingActive(false)
    const text = appendMessageText(message)
    const sourceIndex = message.sourceId ? thread.messages.findIndex((item) => item.id === message.sourceId && item.role === 'user') : -1
    const baseMessages = sourceIndex >= 0 ? thread.messages.slice(0, sourceIndex) : thread.messages
    await submitTurn(text, baseMessages, mode, {
      sourceMessageId: message.sourceId || undefined,
      inputAttachments: inputAttachmentsFromAppend(message),
    })
  }

  async function reloadAuiMessage(parentId: string | null) {
    const parentIndex = parentId ? thread.messages.findIndex((item) => item.id === parentId) : -1
    const source = parentIndex >= 0
      ? thread.messages.slice(0, parentIndex + 1).reverse().find((item) => item.role === 'user')
      : [...thread.messages].reverse().find((item) => item.role === 'user')
    const promptText = source?.actionContext?.promptText || source?.text || ''
    if (!promptText) return
    const baseMessages = parentIndex >= 0 ? thread.messages.slice(0, parentIndex + 1) : thread.messages
    const assistantId = createId('message')
    const pendingMessage: ThreadMessage = {
      id: assistantId,
      role: 'assistant',
      text: 'Retrying...',
      createdAt: now(),
      status: 'pending',
      actionContext: { promptText, mode, sourceMessageId: source?.id },
    }
    const displayMessages = [...baseMessages, pendingMessage]
    commitMessages(displayMessages)
    await completePendingTurn({
      requestMessages: baseMessages,
      displayMessages,
      assistantId,
      promptText,
      runMode: mode,
      sourceMessageId: source?.id,
      inputAttachments: source?.inputAttachments,
    })
  }

  function previousUserMessage(message: ThreadMessage): ThreadMessage | undefined {
    const index = thread.messages.findIndex((item) => item.id === message.id)
    return thread.messages.slice(0, index < 0 ? thread.messages.length : index).reverse().find((item) => item.role === 'user')
  }

  async function rerunMessage(message: ThreadMessage, variation = false) {
    const source = previousUserMessage(message)
    const promptText = message.actionContext?.promptText || source?.text || ''
    if (!promptText || sending) return
    const assistantId = createId('message')
    const runMode = message.actionContext?.mode || message.metadata?.mode || mode
    const pendingMessage: ThreadMessage = {
      id: assistantId,
      role: 'assistant',
      text: variation ? 'Creating variation...' : 'Retrying...',
      createdAt: now(),
      status: 'pending',
      actionContext: { promptText, mode: runMode, sourceMessageId: source?.id },
    }
    const displayMessages = [...thread.messages, pendingMessage]
    const sourceIndex = source ? thread.messages.findIndex((item) => item.id === source.id) : -1
    const requestMessages = sourceIndex >= 0
      ? thread.messages.slice(0, sourceIndex + 1)
      : [{ id: createId('message'), role: 'user' as const, text: promptText, createdAt: now() }]
    if (variation && runMode === 'chat') {
      requestMessages.push({
        id: createId('message'),
        role: 'user',
        text: 'Create a distinct alternative version of the previous answer. Keep it useful and avoid repeating the same wording.',
        createdAt: now(),
      })
    }
    commitMessages(displayMessages)
    await completePendingTurn({
      requestMessages,
      displayMessages,
      assistantId,
      promptText,
      runMode,
      sourceMessageId: source?.id,
      variation,
      inputAttachments: source?.inputAttachments,
    })
  }

  function runVariationById(messageId: string) {
    const message = thread.messages.find((item) => item.id === messageId)
    if (message) void rerunMessage(message, true)
  }

  async function checkPendingMediaJob(messageId: string) {
    const startedMessages = thread.messages
    const message = startedMessages.find((item) => item.id === messageId)
    const mediaJob = message?.actionContext?.mediaJob
    if (!message || !mediaJob || sending) return
    setSending(true)
    commitMessages(startedMessages.map((item) => (
      item.id === messageId
        ? { ...item, text: 'Checking video status...', status: 'pending' }
        : item
    )))
    try {
      const result = await checkMediaJob(profile, mediaJob)
      commitMessages(startedMessages.map((item) => (
        item.id === messageId
          ? {
              ...item,
              text: result.pendingJob && !result.attachments.length
                ? pendingVideoText(result)
                : result.attachments.length
                  ? result.text || 'Video is ready.'
                  : result.text || 'Video status updated.',
              status: undefined,
              attachments: result.attachments,
              metadata: {
                provider: profile.provider,
                model: result.model || mediaJob.model,
                mode: 'video_generation',
                statusCode: result.upstreamStatus,
                createdAt: now(),
              },
              actionContext: {
                ...item.actionContext,
                ...(result.pendingJob ? { mediaJob: result.pendingJob } : { mediaJob: undefined }),
              },
            }
          : item
      )))
    } catch (error) {
      commitMessages(startedMessages.map((item) => (
        item.id === messageId
          ? {
              ...item,
              text: error instanceof Error ? error.message : 'Video status check failed.',
              status: 'error',
            }
          : item
      )))
    } finally {
      setSending(false)
    }
  }

  async function runDiagnostics() {
    setDiagnosticsBusy(true)
    setActivePanel('diagnostics')
    try {
      setDiagnostics(await diagnoseProvider(profile))
    } catch (error) {
      setDiagnostics({
        status: 'error',
        checks: [{ label: 'Diagnostics', status: 'error', message: error instanceof Error ? error.message : 'Diagnostics failed.' }],
      })
    } finally {
      setDiagnosticsBusy(false)
    }
  }

  async function runCompare() {
    const fallbackPrompt = [...thread.messages].reverse().find((message) => message.role === 'user')?.text || ''
    const text = comparePrompt.trim() || fallbackPrompt.trim()
    if (!text) return
    setComparePrompt(text)
    setCompareRunPrompt(text)
    const selected = runnableCompareProfiles.filter((item) => compareProfileIds.includes(item.id))
    const initial = selected.map((item) => ({
      id: createId('compare'),
      profile: item,
      status: 'pending' as const,
      text: 'Running...',
      prompt: text,
    }))
    setCompareResults(initial)
    setActivePanel('compare')

    await Promise.all(initial.map(async (item) => {
      try {
        const result = await sendChat(item.profile, [{ id: createId('message'), role: 'user', text, createdAt: now() }], createToolSettings(undefined, item.profile.searchApiKey))
        setCompareResults((current) => current.map((resultItem) => (
          resultItem.id === item.id
            ? { ...resultItem, status: 'done', text: result.text, metadata: result.metadata }
            : resultItem
        )))
      } catch (error) {
        setCompareResults((current) => current.map((resultItem) => (
          resultItem.id === item.id
            ? { ...resultItem, status: 'error', text: error instanceof Error ? error.message : 'Compare run failed.' }
            : resultItem
        )))
      }
    }))
  }

  function pickCompareWinner(result: CompareResult) {
    const userText = result.prompt.trim() || compareRunPrompt.trim() || comparePrompt.trim()
    const lastMessage = thread.messages.at(-1)
    const shouldAppendPrompt = Boolean(userText && (lastMessage?.role !== 'user' || lastMessage.text.trim() !== userText))
    const messages = [
      ...thread.messages,
      ...(shouldAppendPrompt ? [{ id: createId('message'), role: 'user' as const, text: userText, createdAt: now() }] : []),
      {
        id: createId('message'),
        role: 'assistant' as const,
        text: result.text,
        createdAt: now(),
        metadata: result.metadata,
        actionContext: { promptText: userText, mode: 'chat' as const },
      },
    ]
    commitMessages(messages)
    setActivePanel(null)
  }

  function requestArchive() {
    setConfirmAction({
      title: 'Archive thread?',
      body: 'This hides the thread from the active list. You can undo immediately after the action.',
      confirmLabel: 'Archive',
      run: () => onArchiveThread(thread.id),
    })
  }

  function requestDelete() {
    setConfirmAction({
      title: 'Delete thread?',
      body: 'This removes the thread from local browser storage. You can undo immediately after the action.',
      confirmLabel: 'Delete',
      run: () => onDeleteThread(thread.id),
    })
  }

  function refreshModelsFromChat() {
    setActivePanel('settings')
    onRefreshModels()
  }

  const adapter = useMemo<ExternalStoreAdapter<ThreadMessage>>(() => ({
    messages: thread.messages,
    isRunning: sending,
    isSendDisabled: sending,
    suggestions: [
      { prompt: 'Compare model tradeoffs' },
      { prompt: 'Summarize this source' },
      { prompt: 'Draft a failure-mode test' },
    ],
    convertMessage: convertByokMessage,
    onNew: submitAuiMessage,
    onEdit: editAuiMessage,
    onReload: (parentId) => reloadAuiMessage(parentId),
    adapters: { attachments: attachmentAdapter },
    unstable_capabilities: { copy: true },
  }), [thread.messages, sending, mode, profile, toolSettings, attachmentAdapter])

  const runtime = useExternalStoreRuntime(adapter)
  const MessageComponent = useMemo(() => {
    return function MessageComponent() {
      return <ByokAuiMessage model={profile.selectedModel} onEditStart={() => setEditingActive(true)} onVariationMessageId={runVariationById} onCheckMediaJob={checkPendingMediaJob} />
    }
  }, [profile.selectedModel, thread.messages, sending])
  const EditComposerComponent = useMemo(() => {
    return function EditComposerComponent() {
      return <ByokEditComposer onEditingDone={() => setEditingActive(false)} />
    }
  }, [])
  const internetEnabled = toolSettings.enabled.webSearch
    && toolSettings.permissions.webSearch === 'allow'
    && toolSettings.enabled.readUrl
    && toolSettings.permissions.readUrl === 'allow'

  return (
    <div className="assistant-workbench">
      <header className="workspace-toolbar">
        <div className="thread-title-edit">
          <input
            aria-label="Thread title"
            value={thread.title}
            onChange={(event) => onThreadChange(updateThread(thread, { title: event.target.value }))}
          />
          <span>{modeLabel} / {profile.name || profile.provider}</span>
        </div>
        <div className="workspace-actions">
          <ModelSelect
            className="toolbar-model-switcher model-picker"
            label="Model"
            profile={profile}
            onProfileChange={onProfileChange}
          />
          <button className="button secondary workspace-tool-button fetch-models-control" type="button" aria-label="Fetch models" onClick={refreshModelsFromChat} disabled={fetchState === 'loading'}>
            {fetchState === 'loading' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
            <span>{fetchState === 'loading' ? 'Fetching' : 'Fetch'}</span>
          </button>
          <button
            className={`button secondary workspace-tool-button ${activePanel === 'settings' ? 'active' : ''}`}
            type="button"
            aria-label="Run controls"
            aria-pressed={activePanel === 'settings'}
            onClick={() => togglePanel('settings')}
          >
            <SlidersHorizontal size={16} /> <span>Controls</span>
          </button>
          <div className="thread-menu">
            <button
              className="icon-button compact"
              type="button"
              title="Thread actions"
              aria-haspopup="menu"
              aria-expanded={threadMenuOpen}
              onClick={() => setThreadMenuOpen((value) => !value)}
            >
              <MoreHorizontal size={15} />
            </button>
            {threadMenuOpen ? (
              <div className="thread-menu-popover" role="menu">
                <button type="button" role="menuitem" onClick={() => { setThreadMenuOpen(false); onNewThread() }}><CopyPlus size={15} /> New thread</button>
                <button type="button" role="menuitem" onClick={() => { setThreadMenuOpen(false); onTogglePinThread(thread.id) }}>{thread.pinned ? <PinOff size={15} /> : <Pin size={15} />}{thread.pinned ? 'Unpin thread' : 'Pin thread'}</button>
                <button type="button" role="menuitem" onClick={() => { setThreadMenuOpen(false); requestArchive() }}><Archive size={15} /> Archive thread</button>
                <button className="danger" type="button" role="menuitem" onClick={() => { setThreadMenuOpen(false); requestDelete() }}><Trash2 size={15} /> Delete thread</button>
              </div>
            ) : null}
          </div>
          <button className={`button secondary workspace-tool-button ${activePanel === 'tools' ? 'active' : ''}`} type="button" aria-label="Tools" aria-pressed={activePanel === 'tools'} onClick={() => togglePanel('tools')}><Wrench size={16} /> <span>Tools</span></button>
          <button className={`button secondary workspace-tool-button ${activePanel === 'compare' ? 'active' : ''}`} type="button" aria-label="Compare" aria-pressed={activePanel === 'compare'} onClick={() => togglePanel('compare')}><PanelRightOpen size={16} /> <span>Compare</span></button>
          <button className="button secondary workspace-tool-button" type="button" aria-label="Diagnose" onClick={() => void runDiagnostics()}><Gauge size={16} /> <span>Diagnose</span></button>
        </div>
      </header>

      <div className="workspace-body">
        <AssistantRuntimeProvider runtime={runtime}>
          <ThreadPrimitive.Root className="thread-root custom-thread">
            <ThreadPrimitive.Viewport className="thread-viewport" autoScroll turnAnchor="bottom">
              <ThreadPrimitive.Empty>
                <div className="empty-state">
                  <div className="empty-system-card">
                    <div className={`text-session-badge ${toolSettings.enabled.webSearch || toolSettings.enabled.readUrl ? 'tools-enabled' : ''}`} aria-hidden="true">
                      <span className="text-line long" />
                      <span className="text-line" />
                      <span className="text-line short" />
                      <span className="text-cursor" />
                    </div>
                    <div className="empty-copy">
                      <span className="empty-kicker">Ready endpoint</span>
                      <h2>{mode === 'chat' ? `Ask ${profile.selectedModel}` : `${modeLabel} in the thread`}</h2>
                      <p>{mode === 'chat' ? 'Private chat through your configured provider.' : 'Generated media now stays in this conversation.'}</p>
                    </div>
                  </div>
                  <div className="suggestion-grid">
                    {['Compare model tradeoffs', 'Summarize this source', 'Draft a failure-mode test'].map((item) => (
                      <ThreadPrimitive.Suggestion className="suggestion-chip" key={item} type="button" prompt={item}>
                        <span className="suggestion-kicker">Prompt</span>
                        <span className="suggestion-text">{item}</span>
                      </ThreadPrimitive.Suggestion>
                    ))}
                  </div>
                </div>
              </ThreadPrimitive.Empty>
              <ThreadPrimitive.Messages components={{ Message: MessageComponent, EditComposer: EditComposerComponent }} />
              <ThreadPrimitive.ViewportFooter className="thread-footer">
                <ThreadPrimitive.ScrollToBottom className="scroll-button" title="Scroll to latest">
                  <ChevronDown size={15} />
                </ThreadPrimitive.ScrollToBottom>
                {!editingActive ? (
                  <ComposerPrimitive.AttachmentDropzone className="composer-dropzone">
                  <ComposerPrimitive.Root className="composer thread-composer">
                    <ComposerPrimitive.Quote className="composer-quote">
                      <ComposerPrimitive.QuoteText />
                      <ComposerPrimitive.QuoteDismiss title="Dismiss quote"><X size={14} /></ComposerPrimitive.QuoteDismiss>
                    </ComposerPrimitive.Quote>
                    <div className="composer-attachments" aria-label="Attached files">
                      <ComposerPrimitive.Attachments components={{ Attachment: ComposerAttachment }} />
                    </div>
                    <div className="composer-input-shell">
                      <ComposerPrimitive.Input
                        className="composer-input"
                        placeholder={mode === 'chat' ? 'Ask anything' : `Describe the ${modeLabel.toLowerCase()} to generate`}
                        submitMode="enter"
                        unstable_insertNewlineOnTouchEnter
                      />
                    </div>
                    <div className="composer-toolbar">
                      <div className="composer-tools">
                        <ComposerPrimitive.AddAttachment className="icon-button compact" multiple title="Attach image, PDF, audio, video, or document" aria-label="Attach files">
                          <Paperclip size={16} />
                        </ComposerPrimitive.AddAttachment>
                        <button
                          className={`composer-toggle ${internetEnabled ? 'active' : ''}`}
                          type="button"
                          role="switch"
                          aria-checked={internetEnabled}
                          aria-label="Internet access"
                          title="Search the web and read public URLs for each prompt"
                          onClick={() => setInternetAccess(!internetEnabled)}
                        >
                          <Globe2 size={14} /> <span>Internet</span><em>{internetEnabled ? 'On' : 'Off'}</em>
                        </button>
                        <button
                          className={`composer-toggle ${toolSettings.memory ? 'active' : ''}`}
                          type="button"
                          role="switch"
                          aria-checked={toolSettings.memory}
                          aria-label="Conversation memory"
                          title="Use earlier messages from this thread as context"
                          onClick={() => setMemoryEnabled(!toolSettings.memory)}
                        >
                          <Brain size={14} /> <span>Memory</span><em>{toolSettings.memory ? 'On' : 'Off'}</em>
                        </button>
                      </div>
                      <div className="composer-submit">
                        <ComposerPrimitive.Cancel className="send-button stop" title="Stop"><Square size={15} /></ComposerPrimitive.Cancel>
                        <ComposerPrimitive.Send className="send-button" title="Send message">
                          {sending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                        </ComposerPrimitive.Send>
                      </div>
                    </div>
                  </ComposerPrimitive.Root>
                  </ComposerPrimitive.AttachmentDropzone>
                ) : null}
              </ThreadPrimitive.ViewportFooter>
            </ThreadPrimitive.Viewport>
          </ThreadPrimitive.Root>
        </AssistantRuntimeProvider>

        {activePanel === 'tools' ? (
          <ToolPanel
            toolSettings={toolSettings}
            onToolSettingsChange={setToolSettings}
            internetSetupRequired={internetSetupRequired}
            onEnableInternet={enableInternetFromSetup}
            onClose={() => setActivePanel(null)}
          />
        ) : null}

        {activePanel === 'compare' ? (
          <ComparePanel
            comparePrompt={comparePrompt}
            setComparePrompt={setComparePrompt}
            runnableProfiles={runnableCompareProfiles}
            compareProfileIds={compareProfileIds}
            setCompareProfileIds={setCompareProfileIds}
            compareResults={compareResults}
            compareRunPrompt={compareRunPrompt}
            runCompare={() => { void runCompare() }}
            pickCompareWinner={pickCompareWinner}
            onClose={() => setActivePanel(null)}
          />
        ) : null}

        {activePanel === 'diagnostics' ? (
          <DiagnosticsPanel
            diagnostics={diagnostics}
            diagnosticsBusy={diagnosticsBusy}
            onClose={() => setActivePanel(null)}
          />
        ) : null}

        {activePanel === 'settings' ? (
          <RunSettingsPanel
            profile={profile}
            mode={mode}
            onProfileChange={onProfileChange}
            onSaveProfile={onSaveProfile}
            onRefreshModels={onRefreshModels}
            fetchState={fetchState}
            status={status}
            onClose={() => setActivePanel(null)}
          />
        ) : null}
      </div>
      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.title}
          body={confirmAction.body}
          confirmLabel={confirmAction.confirmLabel}
          onCancel={() => setConfirmAction(undefined)}
          onConfirm={() => {
            const action = confirmAction.run
            setConfirmAction(undefined)
            action()
          }}
        />
      ) : null}
    </div>
  )
}

function compatibleModelsForProfile(profile: ByokProfile) {
  return profile.models.filter((model) => getEffectiveModelCapabilities(model, { provider: profile.provider, baseUrl: profile.baseUrl }).length > 0)
}

function selectedModelForProfile(profile: ByokProfile) {
  return profile.models.find((item) => item.id === profile.selectedModel)
    || (profile.selectedModel.trim() ? { id: profile.selectedModel, name: profile.selectedModel } : undefined)
}

function modelHintForProfile(profile: ByokProfile) {
  const selectedModel = selectedModelForProfile(profile)
  if (!selectedModel) return 'No model selected'
  const selectedCapabilities = getEffectiveModelCapabilities(selectedModel, { provider: profile.provider, baseUrl: profile.baseUrl })
  return selectedCapabilities.length
    ? selectedCapabilities.map(capabilityLabel).join(' / ')
    : getUnsupportedModelReason(selectedModel, { provider: profile.provider, baseUrl: profile.baseUrl }) || 'Unsupported'
}

function ModelSelect({
  className,
  label,
  profile,
  onProfileChange,
}: {
  className: string
  label: string
  profile: ByokProfile
  onProfileChange: (patch: Partial<ByokProfile>) => void
}) {
  const compatibleModels = compatibleModelsForProfile(profile)
  return (
    <label className={className} title={modelHintForProfile(profile)}>
      <span>{label}</span>
      <select className="toolbar-model-select" value={profile.selectedModel} onChange={(event) => onProfileChange({ selectedModel: event.target.value })}>
        {profile.selectedModel.trim() && !compatibleModels.some((model) => model.id === profile.selectedModel) ? (
          <option value={profile.selectedModel}>Typed: {profile.selectedModel}</option>
        ) : null}
        {!profile.selectedModel.trim() && compatibleModels.length === 0 ? <option value="">No compatible models</option> : null}
        {compatibleModels.map((model) => {
          const capabilities = getEffectiveModelCapabilities(model, { provider: profile.provider, baseUrl: profile.baseUrl })
          return <option key={model.id} value={model.id}>{model.id} / {capabilities.map(capabilityLabel).join(' / ')}</option>
        })}
      </select>
    </label>
  )
}

function RunSettingsPanel({
  profile,
  mode,
  onProfileChange,
  onSaveProfile,
  onRefreshModels,
  fetchState,
  status,
  onClose,
}: {
  profile: ByokProfile
  mode: 'chat' | MediaMode
  onProfileChange: (patch: Partial<ByokProfile>) => void
  onSaveProfile: () => Promise<boolean>
  onRefreshModels: () => void
  fetchState: 'idle' | 'loading' | 'error'
  status: string
  onClose: () => void
}) {
  const generationParams = profile.generationParams || {}
  const imageParams = generationParams.image || {}
  const videoParams = generationParams.video || {}
  const modelHint = modelHintForProfile(profile)

  function optionalNumber(value: string): number | undefined {
    return value === '' ? undefined : Number(value)
  }

  function updateGenerationParams(patch: Partial<NonNullable<ByokProfile['generationParams']>>) {
    onProfileChange({ generationParams: { ...generationParams, ...patch } })
  }

  function updateImageParams(patch: Partial<NonNullable<NonNullable<ByokProfile['generationParams']>['image']>>) {
    updateGenerationParams({ image: { ...imageParams, ...patch } })
  }

  function updateVideoParams(patch: Partial<NonNullable<NonNullable<ByokProfile['generationParams']>['video']>>) {
    updateGenerationParams({ video: { ...videoParams, ...patch } })
  }

  return (
    <aside className="workspace-panel run-settings-panel" aria-label="Run controls">
      <div className="panel-head">
        <strong>Run controls</strong>
        <button className="icon-button compact" type="button" title="Close Run controls" onClick={onClose}><X size={15} /></button>
      </div>

      <section className="run-settings-section">
        <div className="run-settings-summary">
          <strong>{profile.selectedModel || 'No model selected'}</strong>
          <span>{modelHint}</span>
        </div>
        <ModelSelect
          className="run-field model-picker"
          label="Model"
          profile={profile}
          onProfileChange={onProfileChange}
        />
        <label className="run-field typed-model-control">
          <span>Typed model</span>
          <input value={profile.selectedModel} placeholder="model-id" onChange={(event) => onProfileChange({ selectedModel: event.target.value })} />
        </label>
      </section>

      <section className="run-settings-section">
        <h3>Instructions</h3>
        <label className="run-field system-control">
          <span>System</span>
          <input value={profile.systemPrompt || ''} placeholder="Optional instruction" onChange={(event) => onProfileChange({ systemPrompt: event.target.value })} />
        </label>
      </section>

      {mode === 'chat' ? (
        <section className="run-settings-section">
          <h3>Chat</h3>
          <div className="run-control-group">
            <label className="run-field">
              <span>Reasoning</span>
              <select value={generationParams.reasoningEffort || ''} onChange={(event) => updateGenerationParams({ reasoningEffort: event.target.value as NonNullable<ByokProfile['generationParams']>['reasoningEffort'] || undefined })}>
                <option value="">Default</option>
                {REASONING_EFFORT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Temp</span>
              <input type="number" min="0" max="2" step="0.1" value={generationParams.temperature ?? ''} placeholder="default" onChange={(event) => updateGenerationParams({ temperature: optionalNumber(event.target.value) })} />
            </label>
            <label className="run-field">
              <span>Max</span>
              <input type="number" min="1" step="1" value={generationParams.maxTokens ?? ''} placeholder="4096" onChange={(event) => updateGenerationParams({ maxTokens: optionalNumber(event.target.value) })} />
            </label>
            <label className="run-field">
              <span>Top P</span>
              <input type="number" min="0" max="1" step="0.05" value={generationParams.topP ?? ''} placeholder="default" onChange={(event) => updateGenerationParams({ topP: optionalNumber(event.target.value) })} />
            </label>
            <label className="run-field">
              <span>Verbosity</span>
              <select value={generationParams.verbosity || ''} onChange={(event) => updateGenerationParams({ verbosity: event.target.value as NonNullable<ByokProfile['generationParams']>['verbosity'] || undefined })}>
                <option value="">Default</option>
                {VERBOSITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {mode === 'image_generation' ? (
        <section className="run-settings-section">
          <h3>Image</h3>
          <div className="run-control-group">
            <label className="run-field">
              <span>Images</span>
              <select value={imageParams.count ?? ''} onChange={(event) => updateImageParams({ count: optionalNumber(event.target.value) })}>
                <option value="">1</option>
                {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Size</span>
              <select value={imageParams.size || ''} onChange={(event) => updateImageParams({ size: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['size'] || undefined })}>
                <option value="">Default</option>
                {IMAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Quality</span>
              <select value={imageParams.quality || ''} onChange={(event) => updateImageParams({ quality: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['quality'] || undefined })}>
                <option value="">Default</option>
                {IMAGE_QUALITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Background</span>
              <select value={imageParams.background || ''} onChange={(event) => updateImageParams({ background: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['background'] || undefined })}>
                <option value="">Default</option>
                {IMAGE_BACKGROUND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Format</span>
              <select value={imageParams.outputFormat || ''} onChange={(event) => updateImageParams({ outputFormat: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['image']>['outputFormat'] || undefined })}>
                <option value="">Default</option>
                {IMAGE_FORMAT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {mode === 'video_generation' ? (
        <section className="run-settings-section">
          <h3>Video</h3>
          <div className="run-control-group">
            <label className="run-field">
              <span>Size</span>
              <select value={videoParams.size || ''} onChange={(event) => updateVideoParams({ size: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['video']>['size'] || undefined })}>
                <option value="">Default</option>
                {VIDEO_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="run-field">
              <span>Seconds</span>
              <select value={videoParams.seconds || ''} onChange={(event) => updateVideoParams({ seconds: event.target.value as NonNullable<NonNullable<ByokProfile['generationParams']>['video']>['seconds'] || undefined })}>
                <option value="">Default</option>
                {VIDEO_SECOND_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      <div className="run-settings-actions">
        <button className="button secondary save-run-controls" type="button" onClick={() => { void onSaveProfile() }}>
          <Save size={15} /> Save
        </button>
        <button className="button secondary save-run-controls" type="button" onClick={onRefreshModels} disabled={fetchState === 'loading'}>
          {fetchState === 'loading' ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
          {fetchState === 'loading' ? 'Fetching' : 'Fetch models'}
        </button>
      </div>
      <p className="run-status" role="status" aria-live="polite">{status}</p>
    </aside>
  )
}
