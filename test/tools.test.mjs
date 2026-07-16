import test from 'node:test'
import assert from 'node:assert/strict'
import { createToolSettings, isToolAllowed, normalizeToolDefaults, updateToolDefault } from '../src/lib/tools.ts'

test('normalizes tool defaults with explicit permissions', () => {
  const defaults = normalizeToolDefaults({ webSearch: true, permissions: { webSearch: 'allow' } })
  const settings = createToolSettings(defaults, 'search-key')

  assert.equal(settings.enabled.webSearch, true)
  assert.equal(settings.permissions.webSearch, 'allow')
  assert.equal(settings.permissions.readUrl, 'deny')
  assert.equal(settings.searchApiKey, 'search-key')
  assert.equal(settings.memory, true)
  assert.equal(isToolAllowed(settings, 'webSearch'), true)
  assert.equal(isToolAllowed(settings, 'readUrl'), false)
})

test('normalizes conversation memory as on for legacy profiles and preserves an explicit off state', () => {
  assert.equal(createToolSettings(undefined).memory, true)
  assert.equal(createToolSettings({ memory: false }).memory, false)
  assert.equal(normalizeToolDefaults({ memory: false }).memory, false)
})

test('keeps legacy ask permissions disabled until explicitly allowed', () => {
  const settings = createToolSettings({ webSearch: true, permissions: { webSearch: 'ask' } })

  assert.equal(settings.enabled.webSearch, true)
  assert.equal(settings.permissions.webSearch, 'ask')
  assert.equal(isToolAllowed(settings, 'webSearch'), false)
})

test('updates tool default permission without dropping sibling tools', () => {
  const defaults = updateToolDefault(
    updateToolDefault(undefined, 'webSearch', { enabled: true, permission: 'allow' }),
    'readUrl',
    { enabled: true, permission: 'deny' },
  )

  assert.equal(defaults.webSearch, true)
  assert.equal(defaults.readUrl, true)
  assert.equal(defaults.permissions.webSearch, 'allow')
  assert.equal(defaults.permissions.readUrl, 'deny')
})
