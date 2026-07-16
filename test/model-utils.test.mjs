import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getEffectiveModelCapabilities,
  getModelCapabilities,
  getUnsupportedModelReason,
  isLikelyChatCompletionModelId,
  parseModelList,
} from '../src/lib/model-utils.ts'

test('keeps Grok media models and classifies route capabilities', () => {
  const models = parseModelList({
    data: [
      { id: 'grok-imagine', owned_by: 'xai' },
      { id: 'grok-imagine-image', owned_by: 'xai' },
      { id: 'grok-imagine-image-quality', owned_by: 'xai' },
      { id: 'grok-imagine-edit', owned_by: 'xai' },
      { id: 'grok-imagine-video', owned_by: 'xai' },
      { id: 'grok-imagine-video-1.5', owned_by: 'xai' },
    ],
  })

  assert.deepEqual(models.map((model) => model.id), [
    'grok-imagine',
    'grok-imagine-edit',
    'grok-imagine-image',
    'grok-imagine-image-quality',
    'grok-imagine-video',
    'grok-imagine-video-1.5',
  ])
  assert.deepEqual(getModelCapabilities(models[0]), ['image_generation'])
  assert.deepEqual(getModelCapabilities(models[4]), ['video_generation'])
  assert.deepEqual(getEffectiveModelCapabilities(models[0], { provider: 'openrouter' }), ['image_generation'])
  assert.deepEqual(getEffectiveModelCapabilities(models[0], { provider: 'sub2api' }), ['image_generation'])
  assert.deepEqual(getEffectiveModelCapabilities(models[4], { provider: 'sub2api' }), ['video_generation'])
  assert.deepEqual(getEffectiveModelCapabilities(models[0], { baseUrl: 'https://api.byok.chat/v1' }), ['image_generation'])
  assert.equal(getUnsupportedModelReason(models[0], { provider: 'sub2api' }), '')
})

test('filters utility models without hiding chat and vision metadata', () => {
  const models = parseModelList({
    data: [
      { id: 'text-embedding-3-small' },
      { id: 'openai/gpt-4o', architecture: { modality: 'text+image->text' } },
      { id: 'gpt-image-2', architecture: { output_modalities: ['image'] } },
    ],
  })

  assert.deepEqual(models.map((model) => model.id), ['gpt-image-2', 'openai/gpt-4o', 'text-embedding-3-small'])
  assert.equal(isLikelyChatCompletionModelId('grok-imagine-video-1.5'), false)
  assert.deepEqual(getModelCapabilities(models[1]), ['chat', 'vision'])
  assert.equal(getUnsupportedModelReason(models[2]), 'Embeddings are not chat models.')
})

test('explains unsupported audio and moderation model choices', () => {
  assert.equal(
    getUnsupportedModelReason({ id: 'whisper-1', name: 'whisper-1' }),
    'Audio and realtime models are not supported in this text-first chat.',
  )
  assert.equal(
    getUnsupportedModelReason({ id: 'omni-moderation-latest', name: 'omni-moderation-latest' }),
    'Moderation models are not runnable chat or media models.',
  )
})
