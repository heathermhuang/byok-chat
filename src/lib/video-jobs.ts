import type { MediaGenerationResult, PendingMediaJob } from './api'
import type { ThreadMessage } from './threads'

const POLL_DELAYS_MS = [3_000, 5_000, 8_000, 10_000, 15_000, 20_000, 30_000]

export function pendingVideoText(job: PendingMediaJob): string {
  return `Video is still generating upstream (${job.status || 'pending'}). Checking automatically; you can keep using this chat.`
}

// One monitor belongs to one thread and provider connection. Jobs survive in the
// thread; timers and credentials stay in memory and are disposed on navigation.
export function createVideoJobMonitor(options: {
  check: (job: PendingMediaJob, signal: AbortSignal) => Promise<MediaGenerationResult>
  onResult: (messageId: string, result: MediaGenerationResult) => void
  onError: (messageId: string, error: unknown, retrying: boolean) => void
}) {
  type Entry = {
    job: PendingMediaJob
    controller: AbortController
    timer?: ReturnType<typeof setTimeout>
    checking: boolean
    polls: number
    failures: number
  }
  const entries = new Map<string, Entry>()
  let disposed = false

  function remove(id: string, entry: Entry) {
    entries.delete(id)
    clearTimeout(entry.timer)
    entry.controller.abort()
  }

  async function check(id: string, entry: Entry) {
    if (disposed || entries.get(id) !== entry || entry.checking) return
    clearTimeout(entry.timer)
    entry.checking = true
    let delay: number | undefined
    try {
      const result = await options.check(entry.job, entry.controller.signal)
      if (disposed || entries.get(id) !== entry) return
      entry.failures = 0
      if (result.pendingJob && !result.attachments.length) {
        entry.job = result.pendingJob
        delay = POLL_DELAYS_MS[Math.min(entry.polls++, POLL_DELAYS_MS.length - 1)]
      } else {
        remove(id, entry)
      }
      options.onResult(id, result)
    } catch (error) {
      if (disposed || entries.get(id) !== entry) return
      const retrying = ++entry.failures < 3
      // Recover from temporary network/rate-limit failures, but don't hammer a
      // failed or inaccessible job. Keep it saved for an explicit status check.
      if (retrying) delay = 30_000 * entry.failures
      options.onError(id, error, retrying)
    } finally {
      entry.checking = false
      if (!disposed && entries.get(id) === entry && delay !== undefined) {
        entry.timer = setTimeout(() => { void check(id, entry) }, delay)
      }
    }
  }

  return {
    sync(messages: ThreadMessage[]) {
      if (disposed) return
      const pending = new Map(messages
        .filter(message => message.role === 'assistant' && message.actionContext?.mediaJob?.requestId && !message.attachments?.length)
        .map(message => [message.id, message.actionContext!.mediaJob!] as const))
      for (const [id, entry] of entries) {
        if (pending.get(id)?.requestId !== entry.job.requestId) remove(id, entry)
      }
      for (const [id, job] of pending) {
        if (entries.has(id)) continue
        const entry: Entry = { job, controller: new AbortController(), checking: false, polls: 0, failures: 0 }
        entries.set(id, entry)
        void check(id, entry)
      }
    },
    refresh(id: string) {
      const entry = entries.get(id)
      if (!entry || entry.checking) return
      entry.failures = 0
      void check(id, entry)
    },
    dispose() {
      disposed = true
      for (const [id, entry] of entries) remove(id, entry)
    },
  }
}
