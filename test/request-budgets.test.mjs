import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/worker.ts'

const env = {
  ASSETS: { fetch: async () => new Response('asset') },
  UPSTREAM_FETCH: async () => { throw new Error('input must be rejected before upstream work') },
}

for (const contentLength of [undefined, '1']) {
  test(`API bounds streamed bytes with ${contentLength ? 'false' : 'missing'} Content-Length`, async () => {
    let cancelled = false
    let chunks = 0
    const chunk = new Uint8Array(256 * 1024).fill(32)
    const stream = new ReadableStream({
      pull(controller) {
        if (++chunks <= 8) controller.enqueue(chunk)
        else controller.close()
      },
      cancel() { cancelled = true },
    })
    const response = await worker.fetch(new Request('https://byok.chat/api/models', {
      method: 'POST', headers: contentLength ? { 'content-length': contentLength } : {}, body: stream, duplex: 'half',
    }), env)
    assert.equal(response.status, 413)
    assert.equal(cancelled, true)
    assert.equal((await response.json()).error.code, 'request_too_large')
  })
}

test('oversized declared bodies are rejected without reading the stream', async () => {
  let reads = 0
  const body = new ReadableStream({ pull(controller) { reads++; controller.enqueue(new TextEncoder().encode('{}')); controller.close() } }, { highWaterMark: 0 })
  const response = await worker.fetch(new Request('https://byok.chat/api/chat', {
    method: 'POST', headers: { 'content-length': String(33 * 1024 * 1024) }, body, duplex: 'half',
  }), env)
  assert.equal(response.status, 413)
  assert.equal(reads, 0)
})

function chatRequest(messages) {
  return new Request('https://byok.chat/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profile: { baseUrl: 'https://provider.example/v1', apiKey: 'synthetic-key', model: 'synthetic-model' }, messages }),
  })
}

test('attachments are bounded across the complete conversation request', async () => {
  const dataUrl = `data:image/png;base64,${Buffer.alloc(3 * 1024 * 1024).toString('base64')}`
  const messages = Array.from({ length: 7 }, (_, i) => ({ role: 'user', content: `message ${i}`, attachments: [{ name: 'fixture.png', dataUrl }] }))
  const response = await worker.fetch(chatRequest(messages), env)
  assert.equal(response.status, 413)
  assert.match((await response.json()).error.message, /20 MB per-request/)
})

test('chat rejects excessive message counts before provider calls', async () => {
  const response = await worker.fetch(chatRequest(Array.from({ length: 201 }, () => ({ role: 'user', content: 'fixture' }))), env)
  assert.equal(response.status, 413)
  assert.match((await response.json()).error.message, /200 messages/)
})

test('ordinary JSON validation and chat remain functional within budgets', async () => {
  const invalid = await worker.fetch(new Request('https://byok.chat/api/models', { method: 'POST', body: '{' }), env)
  assert.equal(invalid.status, 400)
  assert.equal((await invalid.json()).error.message, 'Invalid JSON request body')
  const response = await worker.fetch(chatRequest([{ role: 'user', content: 'hello' }]), {
    ...env,
    UPSTREAM_FETCH: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'hello back' } }] }), { headers: { 'content-type': 'application/json' } }),
  })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).text, 'hello back')
})

for (const path of ['/api/models', '/api/chat', '/api/chat-json', '/api/media', '/api/media/status', '/api/diagnostics', '/api/tools/search', '/api/tools/read-url']) {
  test(`oversize errors keep structured status and headers on ${path}`, async () => {
    const response = await worker.fetch(new Request(`https://byok.chat${path}`, {
      method: 'POST', headers: { 'content-length': String(33 * 1024 * 1024) }, body: '{}',
    }), env)
    assert.equal(response.status, 413)
    assert.equal((await response.json()).error.code, 'request_too_large')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  })
}

test('the complete supported 20 MB attachment budget still reaches the provider', async () => {
  const dataUrl = `data:image/png;base64,${Buffer.alloc(10 * 1024 * 1024).toString('base64')}`
  let calls = 0
  const response = await worker.fetch(chatRequest([{ role: 'user', content: 'hello', attachments: [1, 2].map((i) => ({ name: `${i}.png`, dataUrl })) }]), {
    ...env,
    UPSTREAM_FETCH: async () => {
      calls++
      return new Response(JSON.stringify({ choices: [{ message: { content: 'within budget' } }] }), { headers: { 'content-type': 'application/json' } })
    },
  })
  assert.equal(response.status, 200)
  assert.equal(calls, 1)
  assert.equal((await response.json()).text, 'within budget')
})
