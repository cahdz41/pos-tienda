import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { StoreOrderStatus } from '@/types'

const VALID_STATUSES: StoreOrderStatus[] = ['pending', 'confirmed', 'ready', 'delivered', 'cancelled']

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: { orderId: string } }
) {
  const { orderId } = params
  if (!orderId) return NextResponse.json({ error: 'orderId requerido' }, { status: 400 })

  const body = await request.json()
  const { status } = body as { status: StoreOrderStatus }

  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Status inválido' }, { status: 400 })
  }

  const supabase = adminClient()
  const { data, error } = await supabase
    .from('store_orders')
    .update({ status })
    .eq('id', orderId)
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
