import type { GeneratedMediaAttachment, PendingMediaJob } from './api.ts'
import type { InputAttachment } from './attachments.ts'
import { secureRandomId } from './random-id.ts'

export type ThreadRole = 'user' | 'assistant' | 'tool'

export type RunMetadata = {
  provider: string
  model: string
  mode?: 'chat' | 'image_generation' | 'video_generation'
  latencyMs?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  estimatedCostSource?: string
  statusCode?: number
  diagnostic?: string
  createdAt: string
}

export type ToolRecord = {
  id: string
  name: 'webSearch' | 'readUrl'
  input: string
  status: 'ok' | 'error'
  sourceId?: string
  untrusted?: boolean
  title?: string
  url?: string
  excerpt?: string
  result?: unknown
}

export type MessageActionContext = {
  promptText?: string
  mode?: 'chat' | 'image_generation' | 'video_generation'
  sourceMessageId?: string
  mediaJob?: PendingMediaJob
}

export type ThreadMessage = {
  id: string
  role: ThreadRole
  text: string
  createdAt: string
  attachments?: GeneratedMediaAttachment[]
  inputAttachments?: InputAttachment[]
  metadata?: RunMetadata
  tools?: ToolRecord[]
  actionContext?: MessageActionContext
  status?: 'pending' | 'error'
}

export type ByokThread = {
  schemaVersion: 2
  id: string
  title: string
  profileId: string
  createdAt: string
  updatedAt: string
  pinned?: boolean
  archived?: boolean
  messages: ThreadMessage[]
}

const THREADS_KEY = 'byok.chat.threads.v2'
const ACTIVE_THREAD_KEY = 'byok.chat.activeThread.v2'
const LEGACY_THREADS_KEY = 'byok.chat.threads.v1'
const LEGACY_ACTIVE_THREAD_KEY = 'byok.chat.activeThread.v1'

function now() {
  return new Date().toISOString()
}

export function createId(prefix: string): string {
  return secureRandomId(prefix)
}

export function createThread(profileId: string, title = 'New thread'): ByokThread {
  const createdAt = now()
  return {
    schemaVersion: 2,
    id: createId('thread'),
    title,
    profileId,
    createdAt,
    updatedAt: createdAt,
    messages: [],
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function normalizeMessage(message: Partial<ThreadMessage>): ThreadMessage | undefined {
  const role = message.role === 'assistant' || message.role === 'tool' ? message.role : message.role === 'user' ? 'user' : undefined
  if (!role) return undefined
  return {
    id: stringValue(message.id) || createId('message'),
    role,
    text: stringValue(message.text),
    createdAt: stringValue(message.createdAt) || now(),
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
    inputAttachments: Array.isArray(message.inputAttachments)
      ? message.inputAttachments.map((attachment) => ({ ...attachment, dataUrl: undefined }))
      : [],
    metadata: message.metadata,
    tools: Array.isArray(message.tools) ? message.tools : [],
    actionContext: message.actionContext && typeof message.actionContext === 'object' ? message.actionContext : undefined,
    // A pending status belongs to the in-memory request that created it. That
    // request cannot survive a reload or import, so only durable errors restore.
    status: message.status === 'error' ? 'error' : undefined,
  }
}

function normalizeThread(thread: Partial<ByokThread>): ByokThread | undefined {
  const id = stringValue(thread.id) || createId('thread')
  const createdAt = stringValue(thread.createdAt) || now()
  const messages = Array.isArray(thread.messages)
    ? thread.messages.map((message) => normalizeMessage(message)).filter((message): message is ThreadMessage => Boolean(message))
    : []
  return {
    schemaVersion: 2,
    id,
    title: stringValue(thread.title) || inferThreadTitle(messages) || 'New thread',
    profileId: stringValue(thread.profileId),
    createdAt,
    updatedAt: stringValue(thread.updatedAt) || createdAt,
    pinned: Boolean(thread.pinned),
    archived: Boolean(thread.archived),
    messages,
  }
}

export function inferThreadTitle(messages: ThreadMessage[]): string {
  const firstUserText = messages.find((message) => message.role === 'user')?.text.trim()
  if (!firstUserText) return ''
  return firstUserText.replace(/\s+/g, ' ').slice(0, 58)
}

export function loadThreadState(): { threads: ByokThread[]; activeThreadId: string } {
  try {
    migrateStorageKey(THREADS_KEY, LEGACY_THREADS_KEY)
    migrateStorageKey(ACTIVE_THREAD_KEY, LEGACY_ACTIVE_THREAD_KEY)
    const parsed = JSON.parse(localStorage.getItem(THREADS_KEY) || '[]') as Partial<ByokThread>[]
    const threads = Array.isArray(parsed)
      ? parsed.map((thread) => normalizeThread(thread)).filter((thread): thread is ByokThread => Boolean(thread))
      : []
    return {
      threads,
      activeThreadId: localStorage.getItem(ACTIVE_THREAD_KEY) || threads.find((thread) => !thread.archived)?.id || '',
    }
  } catch {
    return { threads: [], activeThreadId: '' }
  }
}

export function saveThreadState(threads: ByokThread[], activeThreadId: string): void {
  try {
    // Input bytes are intentionally session-only. Persisting base64 PDFs or
    // media in localStorage quickly exhausts browser quota and makes history
    // unusable; durable history keeps only attachment metadata.
    const durableThreads = threads.map((thread) => ({
      ...thread,
      messages: thread.messages.map((message) => ({
        ...message,
        inputAttachments: message.inputAttachments?.map((attachment) => ({ ...attachment, dataUrl: undefined })),
      })),
    }))
    localStorage.setItem(THREADS_KEY, JSON.stringify(durableThreads))
    localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId)
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === 'QuotaExceededError'
      ? 'Browser storage is full. Export or delete old threads before saving more chat history.'
      : 'Failed to save chat history in this browser.')
  }
}

export function upsertThread(threads: ByokThread[], thread: ByokThread): ByokThread[] {
  const normalized = { ...thread, updatedAt: now(), title: thread.title || inferThreadTitle(thread.messages) || 'New thread' }
  const index = threads.findIndex((item) => item.id === thread.id)
  if (index < 0) return [normalized, ...threads]
  const next = [...threads]
  next[index] = normalized
  return next
}

export function mergeThreadUpdate(threads: ByokThread[], activeThreadId: string, thread: ByokThread): { threads: ByokThread[]; activeThreadId: string } {
  const nextThreads = upsertThread(threads, thread)
  const activeThreadExists = Boolean(activeThreadId && nextThreads.some((item) => item.id === activeThreadId))
  return {
    threads: nextThreads,
    activeThreadId: activeThreadExists ? activeThreadId : thread.id,
  }
}

export function sortThreads(threads: ByokThread[]): ByokThread[] {
  return [...threads].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export function searchThreads(threads: ByokThread[], query: string): ByokThread[] {
  const needle = query.trim().toLowerCase()
  const visible = threads.filter((thread) => !thread.archived)
  if (!needle) return sortThreads(visible)
  return sortThreads(visible.filter((thread) => [
    thread.title,
    thread.profileId,
    ...thread.messages.map((message) => message.text),
  ].join('\n').toLowerCase().includes(needle)))
}

export function exportThreadsSnapshot(threads: ByokThread[], activeThreadId: string): string {
  const durableThreads = threads.map((thread) => ({
    ...thread,
    messages: thread.messages.map((message) => ({
      ...message,
      inputAttachments: message.inputAttachments?.map((attachment) => ({ ...attachment, dataUrl: undefined })),
    })),
  }))
  return JSON.stringify({
    exportedAt: now(),
    app: 'BYOK Chat',
    activeThreadId,
    threads: durableThreads,
  }, null, 2)
}

export function parseThreadsImport(text: string): ByokThread[] {
  const parsed = JSON.parse(text) as { threads?: Partial<ByokThread>[] } | Partial<ByokThread>[]
  const rawThreads = Array.isArray(parsed) ? parsed : Array.isArray(parsed.threads) ? parsed.threads : []
  return rawThreads.map((thread) => normalizeThread(thread)).filter((thread): thread is ByokThread => Boolean(thread))
}

function migrateStorageKey(key: string, legacyKey: string): void {
  if (localStorage.getItem(key) !== null) return
  const legacyValue = localStorage.getItem(legacyKey)
  if (legacyValue !== null) localStorage.setItem(key, legacyValue)
}

export function mergeImportedThreads(existing: ByokThread[], imported: ByokThread[]): { threads: ByokThread[]; importedCount: number; renamedCount: number } {
  const existingIds = new Set(existing.map((thread) => thread.id))
  let renamedCount = 0
  const normalizedImports = imported.map((thread) => {
    if (!existingIds.has(thread.id)) {
      existingIds.add(thread.id)
      return thread
    }
    renamedCount += 1
    const next = {
      ...thread,
      id: createId('thread'),
      title: `${thread.title || 'Imported thread'} (imported)`,
      updatedAt: now(),
    }
    existingIds.add(next.id)
    return next
  })
  return {
    threads: [...normalizedImports, ...existing],
    importedCount: normalizedImports.length,
    renamedCount,
  }
}
