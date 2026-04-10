// Next.js 16: el archivo se llama proxy.ts (middleware.ts está deprecado desde v16.0)
// La función se llama proxy() no middleware()
// La protección real de auth ocurre en el client-side layout (AuthContext).
// Este proxy es minimal — solo para lógica server-side futura.
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|login).*)'],
}
