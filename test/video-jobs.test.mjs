import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { createVideoJobMonitor, pendingVideoText } from '../src/lib/video-jobs.ts'
import { checkMediaJob } from '../src/lib/api.ts'

const job = { mode: 'video_generation', requestId: 'saved-job', model: 'video-model', status: 'running' }
const pending = { mode: 'video_generation', model: job.model, text: 'Running', attachments: [], pendingJob: job }
const ready = { ...pending, text: 'Generated 1 video.', attachments: [{ kind: 'video', url: 'https://example.com/video.mp4', mediaType: 'video/mp4', name: 'video' }], pendingJob: undefined }
const message = (id = 'message-1', mediaJob = job) => ({ id, role: 'assistant', text: 'Running', actionContext: { mediaJob } })

test('keeps polling beyond ten checks and stops when the video is ready', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const results = [], errors = []
  let calls = 0
  const monitor = createVideoJobMonitor({
    check: async () => ++calls > 12 ? ready : pending,
    onResult: (id, result) => results.push({ id, result }),
    onError: (...args) => errors.push(args),
  })
  t.after(() => monitor.dispose())
  monitor.sync([message()])
  await setImmediate()
  for (let i = 0; i < 12; i++) {
    t.mock.timers.tick(30_000)
    await setImmediate()
  }
  assert.equal(calls, 13)
  assert.equal(results.at(-1).result, ready)
  t.mock.timers.tick(300_000)
  await setImmediate()
  assert.equal(calls, 13)
  assert.deepEqual(errors, [])
  assert.match(pendingVideoText(job), /Checking automatically/)
})

test('restores saved jobs immediately, without duplicate checks on edits or manual refresh', async t => {
  let release, calls = 0
  const results = []
  const monitor = createVideoJobMonitor({
    check: () => { calls++; return new Promise(resolve => { release = resolve }) },
    onResult: (id, result) => results.push({ id, result }),
    onError: assert.fail,
  })
  t.after(() => monitor.dispose())
  monitor.sync([message()])
  monitor.sync([message(), { id: 'new-turn', role: 'user', text: 'Keep chatting' }])
  monitor.refresh('message-1')
  assert.equal(calls, 1)
  release(ready)
  await setImmediate()
  assert.equal(results[0].id, 'message-1')
})

test('removed jobs and navigation abort requests and discard even late results', async () => {
  for (const action of ['remove', 'dispose']) {
    let release, signal
    const results = []
    const monitor = createVideoJobMonitor({
      check: (_job, inputSignal) => { signal = inputSignal; return new Promise(resolve => { release = resolve }) },
      onResult: result => results.push(result), onError: assert.fail,
    })
    monitor.sync([message()])
    if (action === 'remove') monitor.sync([])
    else monitor.dispose()
    assert.equal(signal.aborted, true)
    release(ready)
    await setImmediate()
    assert.deepEqual(results, [])
    monitor.dispose()
  }
})

test('transient status errors recover; repeated errors stay saved for manual refresh', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const errors = [], results = []
  let calls = 0
  const monitor = createVideoJobMonitor({
    check: async () => { if (++calls <= 3) throw new Error('Network unavailable'); return ready },
    onResult: (_id, result) => results.push(result),
    onError: (_id, _error, retrying) => errors.push(retrying),
  })
  t.after(() => monitor.dispose())
  monitor.sync([message()])
  await setImmediate()
  for (let i = 0; i < 2; i++) {
    t.mock.timers.tick(60_000)
    await setImmediate()
  }
  assert.deepEqual(errors, [true, true, false])
  monitor.sync([message()])
  t.mock.timers.tick(300_000)
  await setImmediate()
  assert.equal(calls, 3)
  monitor.refresh('message-1')
  await setImmediate()
  assert.deepEqual(results, [ready])
})

test('multiple jobs resolve independently and a terminal result without media stops polling', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const results = []
  const monitor = createVideoJobMonitor({
    check: async mediaJob => mediaJob.requestId === job.requestId ? ready : { ...pending, text: 'Status: failed', pendingJob: undefined },
    onResult: (id, result) => results.push({ id, result }), onError: assert.fail,
  })
  t.after(() => monitor.dispose())
  monitor.sync([message(), message('message-2', { ...job, requestId: 'other-job' })])
  await setImmediate()
  assert.equal(results.length, 2)
  assert.equal(results[0].id, 'message-1')
  assert.equal(results[1].result.text, 'Status: failed')
  t.mock.timers.tick(300_000)
  await setImmediate()
  assert.equal(results.length, 2)
})

test('status requests forward cancellation and use the saved job model and request ID', async t => {
  const controller = new AbortController()
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/api/media/status')
    assert.equal(init.signal, controller.signal)
    const body = JSON.parse(init.body)
    assert.equal(body.model, job.model)
    assert.equal(body.requestId, job.requestId)
    return Response.json(ready)
  })
  const result = await checkMediaJob({ provider: 'custom', baseUrl: 'https://example.com/v1', apiKey: 'fixture-key', selectedModel: 'changed-model' }, job, controller.signal)
  assert.equal(result.model, job.model)
  assert.equal(result.attachments.length, 1)
})
