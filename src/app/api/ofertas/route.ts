import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }

interface VariantImageRow {
  id: string
  image_url: string | null
  product: { image_url: string | null } | { image_url: string | null }[] | null
}

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET() {
  const supabase = db()
  const { data: offers, error } = await supabase
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = offers ?? []

  // Para ofertas sin imagen pero con variant_id, busca la imagen actual del inventario
  const needImage = list.filter(o => !o.imagen && o.variant_id)
  if (needImage.length > 0) {
    const ids = needImage.map(o => o.variant_id)
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, image_url, product:products(image_url)')
      .in('id', ids)

    const imgMap = new Map<string, string | null>(
      ((variants ?? []) as VariantImageRow[]).map(v => {
        const productImg = Array.isArray(v.product) ? v.product[0]?.image_url : v.product?.image_url
        return [v.id, v.image_url ?? productImg ?? null]
      })
    )

    return NextResponse.json(
      list.map(o =>
        (!o.imagen && o.variant_id && imgMap.has(o.variant_id))
          ? { ...o, imagen: imgMap.get(o.variant_id) }
          : o
      ),
      { headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json(list, { headers: NO_STORE_HEADERS })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nombre, nombre_completo, variant_id, categoria, imagen, precio_lista, precio_oferta } = body

  if (!nombre || precio_lista == null || precio_oferta == null) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await db()
    .from('offers')
    .insert({ nombre, nombre_completo, variant_id, categoria, imagen, precio_lista, precio_oferta })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201, headers: NO_STORE_HEADERS })
}

export async function DELETE() {
  const { data, error } = await db().from('offers').delete().neq('id', 0).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    { ok: true, deleted: data?.length ?? 0 },
    { headers: NO_STORE_HEADERS }
  )
}
