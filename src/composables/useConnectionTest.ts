import { ref } from 'vue'
import { testConnection, type ConnectionCategory, type ConnectionTestResult } from '@/api/connection'

export interface ConnectionTestViewState {
  testing: boolean
  connected: boolean | null
  message: string
  errorType: string
  stack: string
  elapsedMs: number | null
}

function emptyState(): ConnectionTestViewState {
  return {
    testing: false,
    connected: null,
    message: '',
    errorType: '',
    stack: '',
    elapsedMs: null,
  }
}

export function useConnectionTest(options: {
  category: ConnectionCategory
  snapshotOf: () => { type?: string; name?: string; config: Record<string, unknown> }
  notify: (result: ConnectionTestResult, state: ConnectionTestViewState) => void
}) {
  const state = ref<ConnectionTestViewState>(emptyState())
  let requestId = 0
  let controller: AbortController | null = null
  let lastSnapshotKey = ''

  function snapshotKey(snapshot: ReturnType<typeof options.snapshotOf>) {
    return JSON.stringify(snapshot)
  }

  function invalidate() {
    requestId += 1
    controller?.abort()
    controller = null
    state.value.testing = false
  }

  function reset() {
    invalidate()
    state.value = emptyState()
  }

  async function run() {
    const snapshot = options.snapshotOf()
    const key = snapshotKey(snapshot)
    const currentId = ++requestId
    if (controller) controller.abort()
    const active = new AbortController()
    controller = active
    lastSnapshotKey = key

    state.value.testing = true
    let result: ConnectionTestResult | null = null
    let failure: unknown = null
    try {
      result = await testConnection(
        {
          category: options.category,
          type: snapshot.type ?? '',
          name: snapshot.name ?? '',
          config: snapshot.config,
        },
        { signal: active.signal },
      )
    } catch (error) {
      failure = error
    }

    if (currentId !== requestId || active.signal.aborted || lastSnapshotKey !== key) return

    if (controller === active) controller = null
    state.value.testing = false

    if (result) {
      const error = result.error
      state.value = {
        testing: false,
        connected: result.connected,
        message: error?.message ?? '',
        errorType: error?.error_type ?? '',
        stack: error?.stack ?? '',
        elapsedMs: result.elapsed_ms ?? null,
      }
      options.notify(result, state.value)
      return
    }

    const message = failure instanceof Error ? failure.message : String(failure ?? '')
    state.value = {
      testing: false,
      connected: false,
      message,
      errorType: 'NetworkError',
      stack: '',
      elapsedMs: null,
    }
    options.notify({ connected: false }, state.value)
  }

  return { state, run, reset, invalidate }
}
