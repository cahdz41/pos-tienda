import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import {
  canTransitionContentStatus,
  CONTENT_STATUSES,
  validateContentForReview,
  type StoreProductContent,
  type StoreProductContentStatus,
} from '@/lib/storeProductContent'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ productId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { productId } = await params
  const body = await request.json().catch(() => null) as { status?: string } | null
  const requestedStatus = body?.status
  if (!requestedStatus || !CONTENT_STATUSES.includes(requestedStatus as StoreProductContentStatus)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }
  const nextStatus = requestedStatus as StoreProductContentStatus
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: current, error: currentError } = await supabase
    .from('store_product_content')
    .select('*')
    .eq('product_id', productId)
    .single()

  if (currentError || !current) return NextResponse.json({ error: 'La ficha no existe' }, { status: 404 })
  const currentStatus = current.status as StoreProductContentStatus
  if (!canTransitionContentStatus(currentStatus, nextStatus)) {
    return NextResponse.json({ error: `No se puede pasar de ${currentStatus} a ${nextStatus}.` }, { status: 409 })
  }

  if (nextStatus === 'review' || nextStatus === 'published') {
    const missing = validateContentForReview(current as StoreProductContent)
    if (missing.length) {
      return NextResponse.json({ error: 'La ficha está incompleta.', missing }, { status: 422 })
    }
  }

  const patch: Record<string, unknown> = { status: nextStatus }
  if (nextStatus === 'published') {
    patch.published_at = new Date().toISOString()
    patch.published_by = auth.userId
  } else if (nextStatus === 'draft') {
    patch.published_at = null
    patch.published_by = null
  }

  const { data, error } = await supabase
    .from('store_product_content')
    .update(patch)
    .eq('product_id', productId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ content: data })
}
