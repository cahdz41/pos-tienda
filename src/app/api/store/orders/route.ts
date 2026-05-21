import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')

  const supabase = adminClient()
  let query = supabase
    .from('store_orders')
    .select(`id, customer_name, customer_phone, notes, total, status, created_at,
      store_order_items (id, product_name, flavor, quantity, unit_price, subtotal)`)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

interface OrderItem {
  variantId: string
  productId: string
  productName: string
  flavor: string | null
  price: number
  quantity: number
}

export async function POST(request: Request) {
  const body = await request.json()
  const { customer_name, customer_phone, notes, items, total, customer_id } = body as {
    customer_name: string
    customer_phone: string
    notes: string | null
    items: OrderItem[]
    total: number
    customer_id: string | null
  }

  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0 || !total) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // ── Validar stock disponible antes de crear la orden ──
  const variantIds = items.map(i => i.variantId)
  const { data: variants, error: variantsError } = await supabase
    .from('product_variants')
    .select('id, flavor, stock, product:products(name)')
    .in('id', variantIds)

  if (variantsError) {
    return NextResponse.json({ error: 'Error al verificar stock: ' + variantsError.message }, { status: 500 })
  }

  const stockMap = new Map(variants?.map(v => [v.id, v]) ?? [])
  const outOfStock: { name: string; flavor: string | null; requested: number; available: number }[] = []

  for (const item of items) {
    const variant = stockMap.get(item.variantId)
    if (!variant) {
      outOfStock.push({
        name: item.productName,
        flavor: item.flavor,
        requested: item.quantity,
        available: 0,
      })
      continue
    }
    if ((variant.stock ?? 0) < item.quantity) {
      outOfStock.push({
        name: (variant.product as { name: string })?.name ?? item.productName,
        flavor: variant.flavor,
        requested: item.quantity,
        available: variant.stock ?? 0,
      })
    }
  }

  if (outOfStock.length > 0) {
    const details = outOfStock.map(o =>
      `• ${o.name}${o.flavor ? ` (${o.flavor})` : ''}: solicitado ${o.requested}, disponible ${o.available}`
    ).join('\n')
    return NextResponse.json(
      { error: 'Algunos productos no tienen stock suficiente:\n' + details, outOfStock },
      { status: 409 }
    )
  }

  // ── Crear orden ──
  const { data: order, error: orderError } = await supabase
    .from('store_orders')
    .insert({ customer_name, customer_phone, notes: notes || null, total, status: 'pending', customer_id: customer_id || null })
    .select('id')
    .single()

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const orderItems = items.map(item => ({
    order_id: order.id,
    variant_id: item.variantId,
    product_id: item.productId,
    product_name: item.productName,
    flavor: item.flavor,
    quantity: item.quantity,
    unit_price: item.price,
    subtotal: parseFloat((item.price * item.quantity).toFixed(2)),
  }))

  const { error: itemsError } = await supabase
    .from('store_order_items')
    .insert(orderItems)

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  return NextResponse.json({ order_id: order.id })
}
