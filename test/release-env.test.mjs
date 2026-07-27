import test from 'node:test'
import assert from 'node:assert/strict'
import { validatePublicEnv } from '../scripts/check-public-env.mjs'

test('accepts a configured legal operator and monitored mailbox', () => {
  assert.deepEqual(validatePublicEnv({
    VITE_OPERATOR_NAME: 'Northstar Labs Pte. Ltd.',
    VITE_LEGAL_CONTACT_EMAIL: 'privacy@northstar.co',
  }), [])
})

test('accepts the official Byok.Chat operator identity', () => {
  assert.deepEqual(validatePublicEnv({
    VITE_OPERATOR_NAME: 'Byok.Chat',
    VITE_LEGAL_CONTACT_EMAIL: 'support@byok.chat',
  }), [])
})

test('blocks missing product-name and placeholder legal identities', () => {
  assert.equal(validatePublicEnv({}).length, 2)
  assert.equal(validatePublicEnv({
    VITE_OPERATOR_NAME: 'BYOK Chat',
    VITE_LEGAL_CONTACT_EMAIL: 'privacy@example.com',
  }).length, 2)
})

test('blocks placeholder subdomains and non-public mailbox domains', () => {
  assert.equal(validatePublicEnv({
    VITE_OPERATOR_NAME: 'Northstar Labs Pte. Ltd.',
    VITE_LEGAL_CONTACT_EMAIL: 'privacy@legal.example.com',
  }).length, 1)
  assert.equal(validatePublicEnv({
    VITE_OPERATOR_NAME: 'Northstar Labs Pte. Ltd.',
    VITE_LEGAL_CONTACT_EMAIL: 'privacy@localhost',
  }).length, 1)
})
