import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const EVENT_TYPES = new Set(['view', 'flavor_select', 'add_to_cart'])
const ENTRY_POINTS = new Set(['catalog', 'offer', 'direct'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const requestsByAddress = new Map<string, { count: number; resetAt: number }>()

function rateLimited(request: NextRequest): boolean {
  const address = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const now = Date.now()
  const current = requestsByAddress.get(address)
  if (!current || current.resetAt <= now) {
    requestsByAddress.set(address, { count: 1, resetAt: now + 60_000 })
    return false
  }
  current.count += 1
  return current.count > 60
}

export async function POST(request: NextRequest) {
  if (rateLimited(request)) {
    return NextResponse.json({ error: 'Demasiados eventos' }, { status: 429 })
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const productId = typeof body?.product_id === 'string' ? body.product_id : ''
  const variantId = typeof body?.variant_id === 'string' ? body.variant_id : null
  const eventType = typeof body?.event_type === 'string' ? body.event_type : ''
  const entryPoint = typeof body?.entry_point === 'string' ? body.entry_point : 'direct'
  const sessionKey = typeof body?.session_key === 'string' ? body.session_key.trim().slice(0, 80) : ''

  if (!UUID_RE.test(productId) || (variantId !== null && !UUID_RE.test(variantId)) ||
      !EVENT_TYPES.has(eventType) || !ENTRY_POINTS.has(entryPoint) || sessionKey.length < 8) {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: product } = await supabase.from('products').select('id').eq('id', productId).maybeSingle()
  if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const { error } = await supabase.from('store_product_events').insert({
    product_id: productId,
    variant_id: variantId,
    event_type: eventType,
    entry_point: entryPoint,
    session_key: sessionKey,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
