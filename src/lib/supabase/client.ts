import { createBrowserClient } from '@supabase/ssr'

let _client: ReturnType<typeof createBrowserClient> | null = null

function debugFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const short = url.replace(/^https?:\/\/[^/]+/, '')
  const start = Date.now()

  return fetch(input, init).then(res => {
    const ms = Date.now() - start
    if (!res.ok) {
      console.error(`[supabase] ❌ ${res.status} ${short} (${ms}ms)`)
    } else {
      console.debug(`[supabase] ✓ ${res.status} ${short} (${ms}ms)`)
    }
    return res
  }).catch(err => {
    const ms = Date.now() - start
    console.error(`[supabase] 💥 FETCH FAILED ${short} (${ms}ms)`, err)
    throw err
  })
}

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: debugFetch },
      auth: {
        // Desactiva el Web Lock para evitar bloqueos en POS de sesión única
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock: async (_name: string, _timeout: number, fn: () => Promise<any>) => fn(),
      },
    }
  )
  return _client
}
