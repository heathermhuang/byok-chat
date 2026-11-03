import { useEffect, useMemo, useRef, useState } from 'react'
import { diagnoseProvider, type DiagnosticsResult } from '../lib/api'
import { chatProbePassed, sameTestConnection, testConnection, type TestConnection } from '../lib/key-test'
import type { ByokProfile } from '../lib/profiles'

type TestState = { connection?: TestConnection; busy: boolean; result?: DiagnosticsResult; error?: string }

export function useProviderTest(profile: ByokProfile) {
  const connection = useMemo(() => testConnection(profile), [profile.id, profile.provider, profile.baseUrl, profile.apiKey, profile.selectedModel])
  const current = useRef(connection)
  current.current = connection
  const controller = useRef<AbortController | null>(null)
  const [state, setState] = useState<TestState>({ busy: false })
  const latest = useRef(state)
  latest.current = state
  const valid = Boolean(state.connection && sameTestConnection(state.connection, connection))

  useEffect(() => {
    controller.current?.abort()
    controller.current = null
    setState({ busy: false })
    return () => { controller.current?.abort(); controller.current = null }
  }, [connection])

  async function run() {
    if (!connection.baseUrl || !connection.apiKey || !connection.selectedModel) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setState({ connection, busy: true })
    try {
      const result = await diagnoseProvider(profile, request.signal)
      if (controller.current === request && !request.signal.aborted && sameTestConnection(current.current, connection)) setState({ connection, busy: false, result })
    } catch (error) {
      if (controller.current === request && !request.signal.aborted && sameTestConnection(current.current, connection)) setState({ connection, busy: false, error: error instanceof Error ? error.message : 'Provider test failed. Try again.' })
    } finally {
      if (controller.current === request) controller.current = null
    }
  }

  function hasCurrentSuccess() {
    const proof = latest.current
    return Boolean(proof.connection && sameTestConnection(proof.connection, current.current) && !proof.busy && chatProbePassed(proof.result))
  }

  return { busy: valid && state.busy, result: valid ? state.result : undefined, error: valid ? state.error : undefined, passed: valid && !state.busy && chatProbePassed(state.result), run, hasCurrentSuccess }
}

export type ProviderTest = ReturnType<typeof useProviderTest>
