import type { DiagnosticsResult } from './api'
import { normalizeBaseUrl } from './model-utils'
import type { ByokProfile } from './profiles'

export type TestConnection = Pick<ByokProfile, 'id' | 'provider' | 'baseUrl' | 'apiKey' | 'selectedModel'>

// Session memory only. Never serialize this snapshot into a profile, thread,
// analytics event or diagnostic receipt: it contains the active credential.
export function testConnection(profile: TestConnection): TestConnection {
  return { id: profile.id, provider: profile.provider, baseUrl: normalizeBaseUrl(profile.baseUrl), apiKey: profile.apiKey.trim(), selectedModel: profile.selectedModel.trim() }
}

export function sameTestConnection(a: TestConnection, b: TestConnection): boolean {
  return a.id === b.id && a.provider === b.provider && normalizeBaseUrl(a.baseUrl) === normalizeBaseUrl(b.baseUrl) && a.apiKey.trim() === b.apiKey.trim() && a.selectedModel.trim() === b.selectedModel.trim()
}

export function chatProbePassed(result: DiagnosticsResult | undefined): boolean {
  // The aggregate status can be "ok" even when a quota/timeout response is
  // only a warning. Only an actual successful chat probe unlocks this handoff.
  return Boolean(result?.checks.some(check => check.label === 'Chat endpoint' && check.status === 'ok'))
}
