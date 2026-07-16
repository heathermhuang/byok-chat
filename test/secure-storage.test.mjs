import test from 'node:test'
import assert from 'node:assert/strict'
import { decryptSecret, encryptSecret } from '../src/lib/secure-storage.ts'

test('encrypts and decrypts a secret with a passphrase', async () => {
  const encrypted = await encryptSecret('sk-test-secret', 'correct horse', { iterations: 1_000 })

  assert.equal(encrypted.version, 1)
  assert.equal(encrypted.algorithm, 'AES-GCM')
  assert.equal(encrypted.kdf, 'PBKDF2-SHA-256')
  assert.equal(encrypted.iterations, 1_000)
  assert.doesNotMatch(JSON.stringify(encrypted), /sk-test-secret/)
  assert.equal(await decryptSecret(encrypted, 'correct horse'), 'sk-test-secret')
  await assert.rejects(() => decryptSecret(encrypted, 'wrong horse'), /Passphrase did not unlock/)
})
