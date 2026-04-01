import { createBrowserClient } from '@supabase/ssr'

// When the browser throttles background-tab timers, Supabase's internal
// _callRefreshToken sets _refreshingDeferred and then hangs on the network
// call — blocking ALL subsequent auth operations forever.
// Aborting the stuck fetch after 10s forces _refreshingDeferred to reject
// and clear, so the next user action can trigger a fresh (successful) refresh.
if (typeof window !== 'undefined') {
  const _orig = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    if (supabaseUrl && url.startsWith(supabaseUrl)) {
      // Don't override if caller already passed a signal
      if (init?.signal) return _orig(input, init)
      const ctrl = new AbortController()
      const tid = setTimeout(() => ctrl.abort(), 15_000)
      return _orig(input, { ...init, signal: ctrl.signal }).finally(() =>
        clearTimeout(tid)
      )
    }
    return _orig(input, init)
  }
}

let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Desactiva el auto-refresh: el timer interno dispara cada 30s y,
        // cuando el browser congela timers del background tab (~5min), varios
        // callbacks acumulados se ejecutan juntos sin Web Lock → deadlock.
        // SessionRefresher maneja el refresh manualmente cada 45min.
        autoRefreshToken: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: async (_name: string, _timeout: number, fn: () => Promise<any>) => fn(),
      },
    }
  )
  return _client
}
