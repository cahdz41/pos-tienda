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
  const { data: packages, error } = await supabase
    .from('packages')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = packages ?? []

  // Recopila variant_ids y nombres de productos sin imagen
  const variantIds = new Set<string>()
  const productNames = new Set<string>()

  for (const pkg of list) {
    for (const p of (pkg.productos ?? [])) {
      if (!p.imagen) {
        if (p.variant_id) {
          variantIds.add(p.variant_id)
        } else if (p.nombre) {
          productNames.add(p.nombre.split(' — ')[0].trim())
        }
      }
    }
  }

  if (variantIds.size === 0 && productNames.size === 0) {
    return NextResponse.json(list)
  }

  const imgByVariant = new Map<string, string | null>()
  const imgByName = new Map<string, string | null>()

  if (variantIds.size > 0) {
    const { data: variants } = await supabase
      .from('product_variants')
      .select('id, image_url, product:products(image_url)')
      .in('id', [...variantIds])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of (variants ?? [] as any[])) {
      const productImg = Array.isArray(v.product) ? v.product[0]?.image_url : v.product?.image_url
      imgByVariant.set(v.id, v.image_url ?? productImg ?? null)
    }
  }

  if (productNames.size > 0) {
    const { data: products } = await supabase
      .from('products')
      .select('name, image_url')
      .in('name', [...productNames])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (products ?? [] as any[])) {
      imgByName.set(p.name, p.image_url)
    }
  }

  return NextResponse.json(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    list.map(pkg => ({
      ...pkg,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      productos: (pkg.productos ?? []).map((p: any) => {
        if (p.imagen) return p
        if (p.variant_id && imgByVariant.has(p.variant_id)) {
          return { ...p, imagen: imgByVariant.get(p.variant_id) }
        }
        const name = p.nombre.split(' — ')[0].trim()
        if (imgByName.has(name)) return { ...p, imagen: imgByName.get(name) }
        return p
      }),
    }))
  )
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { nombre, productos, precio_lista, precio_oferta, costo_real } = body

  if (!nombre || !productos?.length || precio_oferta == null) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await db()
    .from('packages')
    .insert({ nombre, productos, precio_lista, precio_oferta, costo_real, activo: true })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
