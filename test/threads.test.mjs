import test from 'node:test'
import assert from 'node:assert/strict'
import { createThread, exportThreadsSnapshot, loadThreadState, mergeImportedThreads, mergeThreadUpdate, parseThreadsImport, saveThreadState, searchThreads, upsertThread } from '../src/lib/threads.ts'

class MemoryStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(key, String(value))
  }
}

test('creates, updates, searches, and exports local threads', () => {
  const thread = createThread('profile-1', 'Research')
  const updated = {
    ...thread,
    messages: [
      { id: 'm1', role: 'user', text: 'Find model latency tradeoffs', createdAt: '2026-07-06T00:00:00.000Z' },
    ],
  }
  const threads = upsertThread([], updated)

  assert.equal(threads.length, 1)
  assert.equal(searchThreads(threads, 'latency')[0].id, thread.id)

  const exported = exportThreadsSnapshot(threads, thread.id)
  const imported = parseThreadsImport(exported)
  assert.equal(imported[0].schemaVersion, 2)
  assert.equal(imported[0].title, 'Research')
  assert.equal(imported[0].messages[0].text, 'Find model latency tradeoffs')
})

test('renames imported thread ids that collide with existing local threads', () => {
  const existing = createThread('profile-1', 'Existing')
  const imported = { ...existing, title: 'Imported duplicate' }
  const result = mergeImportedThreads([existing], [imported])

  assert.equal(result.importedCount, 1)
  assert.equal(result.renamedCount, 1)
  assert.equal(result.threads.length, 2)
  assert.notEqual(result.threads[0].id, existing.id)
  assert.match(result.threads[0].title, /imported/i)
})

test('background thread updates do not steal the active profile thread', () => {
  const active = createThread('profile-chat', 'Chat profile thread')
  const background = createThread('profile-media', 'Media profile thread')
  const completedMediaThread = {
    ...background,
    messages: [
      { id: 'm1', role: 'user', text: 'Generate an image', createdAt: '2026-07-07T00:00:00.000Z' },
      { id: 'm2', role: 'assistant', text: 'Generated 1 image.', createdAt: '2026-07-07T00:00:01.000Z' },
    ],
  }

  const result = mergeThreadUpdate([active, background], active.id, completedMediaThread)

  assert.equal(result.activeThreadId, active.id)
  assert.equal(result.threads.find((thread) => thread.id === background.id)?.messages.length, 2)
})

test('restored threads clear transient pending status without losing a saved media job', (t) => {
  const originalLocalStorage = globalThis.localStorage
  t.after(() => {
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  })
  globalThis.localStorage = new MemoryStorage()
  globalThis.localStorage.setItem('byok.chat.threads.v2', JSON.stringify([{
    schemaVersion: 2,
    id: 'thread-pending',
    title: 'Pending video',
    profileId: 'profile-media',
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:01.000Z',
    messages: [
      {
        id: 'message-pending',
        role: 'assistant',
        text: "Video is still generating upstream (pending). I'll keep checking until it is ready.",
        createdAt: '2026-07-07T00:00:01.000Z',
        status: 'pending',
        actionContext: {
          mediaJob: {
            mode: 'video_generation',
            requestId: 'video-request-1',
            model: 'grok-imagine-video',
            status: 'pending',
          },
        },
      },
      {
        id: 'message-error',
        role: 'assistant',
        text: 'Provider request failed.',
        createdAt: '2026-07-07T00:00:02.000Z',
        status: 'error',
      },
    ],
  }]))

  const [restored, restoredError] = loadThreadState().threads[0].messages

  assert.equal(restored.status, undefined)
  assert.equal(restored.actionContext.mediaJob.requestId, 'video-request-1')
  assert.equal(restoredError.status, 'error')
})

test('imported threads also clear transient pending status', () => {
  const imported = parseThreadsImport(JSON.stringify([{
    schemaVersion: 2,
    id: 'thread-imported-pending',
    title: 'Imported pending request',
    profileId: 'profile-chat',
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:01.000Z',
    messages: [{
      id: 'message-imported-pending',
      role: 'assistant',
      text: 'Thinking...',
      createdAt: '2026-07-07T00:00:01.000Z',
      status: 'pending',
    }],
  }]))

  assert.equal(imported[0].messages[0].status, undefined)
})

test('thread persistence keeps attachment metadata but strips session file bytes', (t) => {
  const originalLocalStorage = globalThis.localStorage
  t.after(() => {
    if (originalLocalStorage === undefined) delete globalThis.localStorage
    else globalThis.localStorage = originalLocalStorage
  })
  globalThis.localStorage = new MemoryStorage()
  const thread = createThread('profile-chat', 'PDF summary')
  thread.messages.push({
    id: 'message-with-pdf',
    role: 'user',
    text: 'Summarize this PDF',
    createdAt: '2026-07-13T00:00:00.000Z',
    inputAttachments: [{
      id: 'pdf-1',
      name: 'brief.pdf',
      mediaType: 'application/pdf',
      size: 128,
      kind: 'document',
      dataUrl: 'data:application/pdf;base64,JVBERi0=',
    }],
  })

  saveThreadState([thread], thread.id)
  const raw = globalThis.localStorage.getItem('byok.chat.threads.v2')
  const persisted = JSON.parse(raw)

  assert.equal(persisted[0].messages[0].inputAttachments[0].name, 'brief.pdf')
  assert.equal(persisted[0].messages[0].inputAttachments[0].dataUrl, undefined)
  assert.doesNotMatch(raw, /JVBERi0=/)
})
