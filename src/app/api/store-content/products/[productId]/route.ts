import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { parseEditableContent } from '@/lib/storeProductContent'
import { referenceFlavor } from '@/lib/productResearchInput'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ productId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { productId } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data: product, error: productError }, { data: content, error: contentError }] = await Promise.all([
    supabase
      .from('products')
      .select(`
        id, name, brand, category, image_url, store_visible,
        product_variants (id, flavor, barcode, stock, sale_price, image_url)
      `)
      .eq('id', productId)
      .single(),
    supabase
      .from('store_product_content')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle(),
  ])

  if (productError || !product) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }
  if (contentError) {
    return NextResponse.json({
      error: 'La migración de fichas de producto todavía no está aplicada en Supabase.',
      detail: contentError.message,
    }, { status: 503 })
  }

  const { data: events } = await supabase
    .from('store_product_events')
    .select('event_type')
    .eq('product_id', productId)
    .limit(10000)

  const metrics = { view: 0, flavor_select: 0, add_to_cart: 0 }
  for (const event of events ?? []) {
    if (event.event_type in metrics) metrics[event.event_type as keyof typeof metrics] += 1
  }

  return NextResponse.json({ product, content, metrics })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { productId } = await params
  let editable
  try {
    editable = parseEditableContent(await request.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Contenido inválido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: product } = await supabase
    .from('products')
    .select('id, product_variants(id, flavor)')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const selectedVariant = (product.product_variants ?? []).find(
    (variant: { id: string; flavor: string | null }) => variant.id === editable.reference_variant_id,
  )
  if (!selectedVariant) {
    return NextResponse.json({ error: 'Selecciona una variante válida como referencia.' }, { status: 400 })
  }
  editable.reference_flavor = referenceFlavor(selectedVariant.flavor)

  const { data, error } = await supabase
    .from('store_product_content')
    .upsert({
      product_id: productId,
      status: 'draft',
      published_at: null,
      published_by: null,
      ...editable,
    }, { onConflict: 'product_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data })
}
