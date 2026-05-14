import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imgMap = new Map<string, string | null>(
      (variants ?? []).map((v: any) => {
        const productImg = Array.isArray(v.product) ? v.product[0]?.image_url : v.product?.image_url
        return [v.id as string, (v.image_url ?? productImg ?? null) as string | null]
      })
    )

    return NextResponse.json(
      list.map(o =>
        (!o.imagen && o.variant_id && imgMap.has(o.variant_id))
          ? { ...o, imagen: imgMap.get(o.variant_id) }
          : o
      )
    )
  }

  return NextResponse.json(list)
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
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE() {
  const { error } = await db().from('offers').delete().neq('id', 0)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
