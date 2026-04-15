import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const { customer_name, customer_phone, notes, items, total } = body as {
    customer_name: string
    customer_phone: string
    notes: string | null
    items: OrderItem[]
    total: number
  }

  if (!customer_name || !customer_phone || !Array.isArray(items) || items.length === 0 || !total) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: order, error: orderError } = await supabase
    .from('store_orders')
    .insert({ customer_name, customer_phone, notes: notes || null, total, status: 'pending' })
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
