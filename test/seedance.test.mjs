import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/worker.ts'
import { buildSeedancePayload, isSeedanceModelId } from '../src/lib/seedance.ts'
import { getModelCapabilities, isLikelyChatCompletionModelId } from '../src/lib/model-utils.ts'
import { normalizeGenerationParams } from '../src/lib/generation-options.ts'

const model = 'dreamina-seedance-2-5-260628'
const options = { video: { duration: 30, resolution: '480p', aspectRatio: '4:3', generateAudio: false } }
const body = { provider: 'custom', baseUrl: 'https://gateway.example.com/v1', apiKey: 'test-key', model, mode: 'video_generation', prompt: 'A fictional vintage news studio.', generationParams: options }
const request = (path, value) => new Request(`https://byok.chat${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) })
const response = (value, init) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' }, ...init })

test('Seedance 2.5 is video, retains thirty-second controls, and keeps Seed as chat', () => {
  assert.equal(isSeedanceModelId(model), true)
  assert.equal(isSeedanceModelId('dola-seed-2-1-turbo-260628'), false)
  assert.equal(isLikelyChatCompletionModelId(model), false)
  assert.deepEqual(getModelCapabilities({ id: model, name: model }), ['video_generation'])
  assert.deepEqual(normalizeGenerationParams(options).video, options.video)
  assert.deepEqual(getModelCapabilities({ id: 'dola-seed-2-1-turbo-260628', name: 'Seed' }), ['chat'])
})

test('the paid submission is sent once, saved as pending, then checked with GET only', async () => {
  const calls = []
  const env = { UPSTREAM_FETCH: async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    calls.push({ method: req.method, url: req.url, authorization: req.headers.get('authorization'), payload: req.method === 'POST' ? await req.json() : undefined })
    return response(req.method === 'POST' ? { id: 'task_seedance_1' } : { id: 'task_seedance_1', status: 'succeeded', content: { video_url: 'https://cdn.example.com/result.mp4' } })
  } }
  const submitted = await worker.fetch(request('/api/media', body), env)
  const pending = await submitted.json()
  assert.equal(submitted.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://gateway.example.com/api/v3/contents/generations/tasks')
  assert.equal(calls[0].authorization, 'Bearer test-key')
  assert.deepEqual(calls[0].payload, { model, content: [{ type: 'text', text: body.prompt }], duration: 30, resolution: '480p', ratio: '4:3', generate_audio: false })
  assert.equal(pending.pendingJob.requestId, 'task_seedance_1')
  for (let i = 0; i < 2; i++) {
    const checked = await worker.fetch(request('/api/media/status', { ...body, requestId: pending.pendingJob.requestId }), env)
    const complete = await checked.json()
    assert.equal(checked.status, 200)
    assert.equal(complete.attachments[0].url, 'https://cdn.example.com/result.mp4')
    assert.equal(complete.pendingJob, undefined)
  }
  assert.deepEqual(calls.map(c => c.method), ['POST', 'GET', 'GET'])
  assert.equal(calls[1].url, `${calls[0].url}/task_seedance_1`)
})

test('native and bare base URLs share the same task endpoint and encode status IDs', async () => {
  for (const baseUrl of ['https://gateway.example.com', 'https://gateway.example.com/api/v3']) {
    const calls = []
    const result = await worker.fetch(request('/api/media/status', { ...body, baseUrl, provider: 'sub2api', requestId: 'task/id?x=1' }), { UPSTREAM_FETCH: async (input) => {
      calls.push(String(input))
      return response({ id: 'task/id?x=1', status: 'running' })
    } })
    assert.equal(result.status, 200)
    assert.deepEqual(calls, ['https://gateway.example.com/api/v3/contents/generations/tasks/task%2Fid%3Fx%3D1'])
    assert.equal((await result.json()).pendingJob.status, 'running')
  }
})

test('invalid Seedance controls fail before any billable submission', async () => {
  for (const video of [{ duration: 31 }, { duration: 3 }, { duration: 4.5 }, { duration: '30' }, { resolution: '4k' }, { aspectRatio: 'bad' }, { generateAudio: 'false' }]) {
    let calls = 0
    const result = await worker.fetch(request('/api/media', { ...body, generationParams: { video } }), { UPSTREAM_FETCH: async () => { calls++; return response({}) } })
    assert.equal(result.status, 400)
    assert.equal(calls, 0)
  }
})

test('first-frame image uses native content and adaptive ratio', () => {
  const payload = buildSeedancePayload(model, 'Animate this frame.', options, ['data:image/png;base64,aGVsbG8='])
  assert.equal(payload.ratio, 'adaptive')
  assert.deepEqual(payload.content[1], { type: 'image_url', image_url: { url: 'data:image/png;base64,aGVsbG8=' }, role: 'first_frame' })
  assert.throws(() => buildSeedancePayload(model, 'Two frames.', options, ['one', 'two']), /at most one/)
})

test('Seedance retains public-host validation and never follows credential-bearing redirects', async () => {
  for (const baseUrl of ['http://gateway.example.com', 'https://localhost', 'https://user:secret@gateway.example.com', 'https://gateway.example.com?token=secret']) {
    let calls = 0
    const result = await worker.fetch(request('/api/media', { ...body, baseUrl }), { UPSTREAM_FETCH: async () => { calls++; return response({}) } })
    assert.equal(result.status, 400)
    assert.equal(calls, 0)
  }
  let calls = 0
  const redirected = await worker.fetch(request('/api/media', body), { UPSTREAM_FETCH: async (_input, init) => {
    calls++
    assert.equal(init.redirect, 'manual')
    return new Response(null, { status: 307, headers: { location: 'https://other.example.com/capture' } })
  } })
  assert.equal(redirected.status, 400)
  assert.equal(calls, 1)
})
