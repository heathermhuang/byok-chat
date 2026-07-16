import { parseModelList, type ByokModel, type ModelCapability } from './model-utils'
import { estimateTokens, estimateUsageCost } from './usage'
import type { ByokProfile } from './profiles'
import type { RunMetadata, ThreadMessage, ToolRecord } from './threads'
import type { ToolSettings } from './tools'
import type { InputAttachment } from './attachments'

export async function fetchModels(profile: ByokProfile): Promise<ByokModel[]> {
  const response = await fetch('/api/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    }),
  })
  const body = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string }
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || `Failed to fetch models (${response.status})`)
  }
  return parseModelList(body)
}

export type MediaMode = Extract<ModelCapability, 'image_generation' | 'video_generation'>

export type GeneratedMediaAttachment = {
  kind: 'image' | 'video'
  url: string
  mediaType: string
  name: string
}

export type PendingMediaJob = {
  mode: 'video_generation'
  requestId: string
  model: string
  status?: string
  updatedAt?: string
}

export type MediaGenerationResult = {
  mode: MediaMode
  model: string
  text: string
  attachments: GeneratedMediaAttachment[]
  pendingJob?: PendingMediaJob
  upstreamStatus?: number
  fallbackUsed?: boolean
}

export type ChatToolSettings = ToolSettings

export type ChatJsonResult = {
  text: string
  metadata: RunMetadata
  tools: ToolRecord[]
  diagnostic?: string
}

export type DiagnosticsResult = {
  status: 'ok' | 'error'
  checks: Array<{ label: string; status: 'ok' | 'warn' | 'error'; message: string }>
}

function messagesForApi(messages: ThreadMessage[], memoryEnabled: boolean) {
  const conversation = memoryEnabled
    ? messages
    : [...messages].reverse().find((message) => message.role === 'user')
      ? [[...messages].reverse().find((message) => message.role === 'user')!]
      : []
  return conversation
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: message.text,
      ...(message.inputAttachments?.some((attachment) => attachment.dataUrl)
        ? { attachments: message.inputAttachments.filter((attachment) => attachment.dataUrl) }
        : {}),
    }))
}

export async function sendChat(profile: ByokProfile, messages: ThreadMessage[], tools: ChatToolSettings): Promise<ChatJsonResult> {
  const startedAt = performance.now()
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      profile: {
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.selectedModel,
        systemPrompt: profile.systemPrompt,
        generationParams: profile.generationParams,
        searchApiKey: tools.searchApiKey || profile.searchApiKey,
      },
      messages: messagesForApi(messages, tools.memory),
      tools,
    }),
  })
  const body = await response.json().catch(() => ({})) as Partial<ChatJsonResult> & { error?: { message?: string }; message?: string }
  const latencyMs = Math.round(performance.now() - startedAt)
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || `Chat request failed (${response.status})`)
  }
  const inputTokens = body.metadata?.inputTokens ?? estimateTokens(messages.map((message) => message.text).join('\n'))
  const outputTokens = body.metadata?.outputTokens ?? estimateTokens(body.text || '')
  const metadata = estimateUsageCost(profile.selectedModel, {
    provider: profile.provider,
    model: profile.selectedModel,
    createdAt: new Date().toISOString(),
    ...body.metadata,
    latencyMs: body.metadata?.latencyMs || latencyMs,
    inputTokens,
    outputTokens,
    totalTokens: body.metadata?.totalTokens || inputTokens + outputTokens,
    statusCode: body.metadata?.statusCode || response.status,
  })
  return {
    text: body.text || '',
    metadata,
    tools: Array.isArray(body.tools) ? body.tools : [],
    diagnostic: body.diagnostic,
  }
}

export async function diagnoseProvider(profile: ByokProfile): Promise<DiagnosticsResult> {
  const response = await fetch('/api/diagnostics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.selectedModel,
    }),
  })
  const body = await response.json().catch(() => ({})) as DiagnosticsResult & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(body.error?.message || 'Diagnostics failed.')
  }
  return body
}

export async function generateMedia(profile: ByokProfile, mode: MediaMode, prompt: string, attachments: InputAttachment[] = []): Promise<MediaGenerationResult> {
  const response = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.selectedModel,
      provider: profile.provider,
      mode,
      prompt,
      attachments: attachments.filter((attachment) => attachment.dataUrl),
      generationParams: profile.generationParams,
    }),
  })
  const body = await response.json().catch(() => ({})) as Partial<MediaGenerationResult> & { error?: { message?: string }; message?: string }
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || `Media request failed (${response.status})`)
  }
  return {
    mode,
    model: profile.selectedModel,
    text: body.text || '',
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    pendingJob: body.pendingJob,
    upstreamStatus: body.upstreamStatus,
    fallbackUsed: body.fallbackUsed,
  }
}

export async function checkMediaJob(profile: ByokProfile, job: PendingMediaJob): Promise<MediaGenerationResult> {
  const response = await fetch('/api/media/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      provider: profile.provider,
      model: job.model || profile.selectedModel,
      requestId: job.requestId,
    }),
  })
  const body = await response.json().catch(() => ({})) as Partial<MediaGenerationResult> & { error?: { message?: string }; message?: string }
  if (!response.ok) {
    throw new Error(body.error?.message || body.message || `Video status request failed (${response.status})`)
  }
  return {
    mode: 'video_generation',
    model: job.model || profile.selectedModel,
    text: body.text || '',
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    pendingJob: body.pendingJob,
    upstreamStatus: body.upstreamStatus,
    fallbackUsed: body.fallbackUsed,
  }
}
