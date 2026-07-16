import test from 'node:test'
import assert from 'node:assert/strict'
import { secureRandomId } from '../src/lib/random-id.ts'

test('creates unique cryptographically random ids with an optional prefix', () => {
  const first = secureRandomId('profile')
  const second = secureRandomId('profile')

  assert.match(first, /^profile-[0-9a-f-]{32,36}$/)
  assert.match(second, /^profile-[0-9a-f-]{32,36}$/)
  assert.notEqual(first, second)
})
