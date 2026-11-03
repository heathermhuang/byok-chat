import test from 'node:test'
import assert from 'node:assert/strict'
import { testConnection, sameTestConnection, chatProbePassed } from '../src/lib/key-test.ts'

const profile = { id: 'p1', provider: 'openai', baseUrl: 'https://api.example/v1', apiKey: 'synthetic-key-a', selectedModel: 'chat-model-a' }

test('a model list and aggregate ok status never substitute for a successful chat probe', () => {
  assert.equal(chatProbePassed(undefined), false)
  assert.equal(chatProbePassed({ status: 'ok', checks: [{ label: 'Models endpoint', status: 'ok', message: 'Models found' }] }), false)
  for (const status of ['warn', 'error']) assert.equal(chatProbePassed({ status: 'ok', checks: [{ label: 'Chat endpoint', status, message: 'Quota or permission problem' }] }), false)
  assert.equal(chatProbePassed({ status: 'ok', checks: [{ label: 'Chat endpoint', status: 'ok', message: 'Probe succeeded' }] }), true)
})

test('a working manual-model chat is not blocked by unavailable discovery', () => {
  assert.equal(chatProbePassed({ status: 'error', checks: [{ label: 'Models endpoint', status: 'error', message: 'Not permitted' }, { label: 'Chat endpoint', status: 'ok', message: 'Probe succeeded' }] }), true)
})

test('test proof belongs to a specific profile, provider, endpoint, key and model', () => {
  const scope = testConnection(profile)
  assert.equal(sameTestConnection(scope, { ...profile }), true)
  for (const change of [{ id: 'p2' }, { provider: 'custom' }, { baseUrl: 'https://another.example/v1' }, { apiKey: 'synthetic-key-b' }, { selectedModel: 'chat-model-b' }]) assert.equal(sameTestConnection(scope, { ...profile, ...change }), false)
})

test('scope uses the same harmless whitespace and URL normalization as requests', () => {
  assert.equal(sameTestConnection(profile, { ...profile, baseUrl: 'https://api.example/v1/', apiKey: ' synthetic-key-a ', selectedModel: ' chat-model-a ' }), true)
  assert.equal(sameTestConnection(profile, { ...profile, name: 'Renamed profile', generationParams: { temperature: 1 } }), true)
})
