import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { SOCIAL_POST_STATUSES, type SocialPostStatus } from '@/lib/socialPostContent'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status')
  const status = statusParam && SOCIAL_POST_STATUSES.includes(statusParam as SocialPostStatus) ? statusParam : null
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '40', 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(80, Math.max(1, requestedLimit)) : 40

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  let query = supabase.from('store_social_posts').select('*').order('created_at', { ascending: false }).limit(limit)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({
      error: 'La migración de redes sociales todavía no está aplicada en Supabase.',
      detail: error.message,
    }, { status: 503 })
  }
  return NextResponse.json({ posts: data ?? [] })
}

interface CreateSocialPostBody {
  product_ids?: unknown
  idea_source?: unknown
  idea_options?: unknown
  idea_title?: unknown
  idea_angle?: unknown
  idea_hook?: unknown
  idea_cta?: unknown
  owner_idea_text?: unknown
  caption?: unknown
  hashtags?: unknown
  alt_text?: unknown
  caption_provider?: unknown
  caption_model?: unknown
  visual_identity_key?: unknown
  image_model?: unknown
  image_model_fallback_used?: unknown
  images?: unknown
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as CreateSocialPostBody | null
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 })

  const productIds = Array.isArray(body.product_ids)
    ? body.product_ids.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
    : []
  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un producto.' }, { status: 400 })
  }
  if (typeof body.caption !== 'string' || !body.caption.trim()) {
    return NextResponse.json({ error: 'Falta el texto del post.' }, { status: 400 })
  }
  // No se exige tener imágenes ya generadas: el wizard guarda el borrador
  // progresivamente (apenas hay caption) para no perder ideas/caption si el
  // dueño no termina el flujo completo; las imágenes se agregan después con
  // un PUT cuando estén listas.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('store_social_posts')
    .insert({
      product_ids: productIds,
      idea_source: body.idea_source === 'ai_generated' ? 'ai_generated' : 'owner_provided',
      idea_options: Array.isArray(body.idea_options) ? body.idea_options : [],
      idea_title: typeof body.idea_title === 'string' ? body.idea_title.slice(0, 140) : '',
      idea_angle: typeof body.idea_angle === 'string' ? body.idea_angle.slice(0, 300) : '',
      idea_hook: typeof body.idea_hook === 'string' ? body.idea_hook.slice(0, 140) : '',
      idea_cta: typeof body.idea_cta === 'string' ? body.idea_cta.slice(0, 140) : '',
      owner_idea_text: typeof body.owner_idea_text === 'string' ? body.owner_idea_text.slice(0, 1000) : '',
      caption: body.caption.slice(0, 2200),
      hashtags: Array.isArray(body.hashtags) ? body.hashtags.slice(0, 15) : [],
      alt_text: typeof body.alt_text === 'string' ? body.alt_text.slice(0, 300) : '',
      caption_provider: body.caption_provider === 'openai' || body.caption_provider === 'deepseek' ? body.caption_provider : null,
      caption_model: typeof body.caption_model === 'string' ? body.caption_model.slice(0, 100) : null,
      visual_identity_key: typeof body.visual_identity_key === 'string' ? body.visual_identity_key.slice(0, 100) : null,
      image_model: typeof body.image_model === 'string' ? body.image_model.slice(0, 100) : null,
      image_model_fallback_used: body.image_model_fallback_used === true,
      images: Array.isArray(body.images) ? body.images : [],
      status: 'draft',
      created_by: auth.userId,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({
      error: 'La migración de redes sociales todavía no está aplicada en Supabase.',
      detail: error.message,
    }, { status: 503 })
  }
  return NextResponse.json({ post: data })
}
