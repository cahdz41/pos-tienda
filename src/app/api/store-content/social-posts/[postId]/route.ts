import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { parseEditableSocialPost } from '@/lib/socialPostContent'

export const dynamic = 'force-dynamic'

type Context = { params: Promise<{ postId: string }> }

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { postId } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('store_social_posts')
    .select('*')
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({
      error: 'La migración de redes sociales todavía no está aplicada en Supabase.',
      detail: error.message,
    }, { status: 503 })
  }
  if (!data) return NextResponse.json({ error: 'Borrador no encontrado.' }, { status: 404 })
  return NextResponse.json({ post: data })
}

export async function PUT(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { postId } = await params
  let editable
  try {
    editable = parseEditableSocialPost(await request.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Contenido inválido' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('store_social_posts')
    .update(editable)
    .eq('id', postId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { postId } = await params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('store_social_posts').delete().eq('id', postId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
