import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { MANUAL_SOCIAL_POST_STATUSES, type SocialPostStatus } from '@/lib/socialPostContent'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ postId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { postId } = await params
  const body = await request.json().catch(() => null) as { status?: string } | null
  const requestedStatus = body?.status
  if (!requestedStatus || !(MANUAL_SOCIAL_POST_STATUSES as readonly string[]).includes(requestedStatus)) {
    return NextResponse.json({ error: 'Estado inválido. Este endpoint solo alterna entre borrador y listo — para publicar usa /publish.' }, { status: 400 })
  }
  const nextStatus = requestedStatus as SocialPostStatus

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: current, error: currentError } = await supabase
    .from('store_social_posts')
    .select('status')
    .eq('id', postId)
    .single()

  if (currentError || !current) return NextResponse.json({ error: 'El borrador no existe' }, { status: 404 })
  const currentStatus = current.status as SocialPostStatus
  if (currentStatus === 'scheduled' || currentStatus === 'published') {
    return NextResponse.json({ error: `Este post ya está en estado "${currentStatus}" — no se puede regresar a borrador manualmente.` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('store_social_posts')
    .update({ status: nextStatus })
    .eq('id', postId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}
