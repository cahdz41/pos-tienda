import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

type OfferRouteContext = { params: Promise<{ id: string }> }

async function offerIdFrom(context: OfferRouteContext): Promise<number | null> {
  const { id } = await context.params
  const value = Number(id)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export async function DELETE(_req: NextRequest, context: OfferRouteContext) {
  const id = await offerIdFrom(context)
  if (id === null) {
    return NextResponse.json({ error: 'Identificador de oferta inválido' }, { status: 400 })
  }

  const { data, error } = await db()
    .from('offers')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Oferta no encontrada' }, { status: 404 })
  return NextResponse.json(
    { ok: true, id: data.id },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
