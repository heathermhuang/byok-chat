import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PLACEHOLDER_DOMAINS = ['example.com', 'example.org', 'example.net', 'invalid', 'test', 'localhost', 'local']
const OFFICIAL_OPERATOR_NAME = 'Byok.Chat'
const OFFICIAL_CONTACT_EMAIL = 'support@byok.chat'

function isPlaceholderDomain(domain) {
  return PLACEHOLDER_DOMAINS.some((placeholder) => domain === placeholder || domain.endsWith(`.${placeholder}`))
}

export function validatePublicEnv(env = process.env) {
  const errors = []
  const operatorName = String(env.VITE_OPERATOR_NAME || '').trim()
  const legalEmail = String(env.VITE_LEGAL_CONTACT_EMAIL || '').trim().toLowerCase()
  const isOfficialIdentity = operatorName === OFFICIAL_OPERATOR_NAME && legalEmail === OFFICIAL_CONTACT_EMAIL

  if (
    !operatorName ||
    (!isOfficialIdentity && /^byok[.\s]chat$/i.test(operatorName)) ||
    /your legal operator/i.test(operatorName) ||
    /\bexample (?:labs?|company|operator)\b/i.test(operatorName)
  ) {
    errors.push('VITE_OPERATOR_NAME must identify the responsible person or legal entity.')
  }

  const emailMatch = legalEmail.match(/^[^@\s]+@([^@\s]+)$/)
  const emailDomain = emailMatch?.[1]?.replace(/\.+$/, '') || ''
  const emailLabels = emailDomain.split('.')
  const hasPublicDomain = emailLabels.length >= 2 && emailLabels.every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
  if (!emailMatch || !hasPublicDomain || isPlaceholderDomain(emailDomain)) {
    errors.push('VITE_LEGAL_CONTACT_EMAIL must be a real monitored mailbox, not a placeholder.')
  }

  return errors
}

function main() {
  const errors = validatePublicEnv()
  if (!errors.length) {
    console.log('Public operator identity is configured.')
    return
  }

  console.error('Deployment blocked:')
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
