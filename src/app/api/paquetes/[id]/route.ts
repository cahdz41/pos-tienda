import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

type PackageRouteContext = { params: Promise<{ id: string }> }

async function packageIdFrom(context: PackageRouteContext): Promise<number | null> {
  const { id } = await context.params
  const value = Number(id)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export async function DELETE(_req: NextRequest, context: PackageRouteContext) {
  const id = await packageIdFrom(context)
  if (id === null) {
    return NextResponse.json({ error: 'Identificador de paquete inválido' }, { status: 400 })
  }

  const { data, error } = await db()
    .from('packages')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 })
  return NextResponse.json({ ok: true, id: data.id }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest, context: PackageRouteContext) {
  const id = await packageIdFrom(context)
  if (id === null) {
    return NextResponse.json({ error: 'Identificador de paquete inválido' }, { status: 400 })
  }

  const { activo } = await req.json()
  if (typeof activo !== 'boolean') {
    return NextResponse.json({ error: 'Estado de paquete inválido' }, { status: 400 })
  }

  const { data, error } = await db()
    .from('packages')
    .update({ activo })
    .eq('id', id)
    .select()
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
