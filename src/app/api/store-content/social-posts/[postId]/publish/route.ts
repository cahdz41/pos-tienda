import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { publishToZernio, type ZernioPlatform } from '@/lib/zernioClient'
import { parsearFechaProgramada } from '@/lib/zernioSchedule'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_PLATFORMS: ZernioPlatform[] = ['facebook', 'instagram']

type Context = { params: Promise<{ postId: string }> }

interface SocialPostRow {
  id: string
  caption: string
  hashtags: string[]
  images: Array<{ url: string }>
  platform_targets: string[]
  status: string
}

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { postId } = await params
  const body = await request.json().catch(() => null) as { platforms?: unknown; scheduled_for?: unknown } | null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: post, error: loadError } = await supabase
    .from('store_social_posts')
    .select('id, caption, hashtags, images, platform_targets, status')
    .eq('id', postId)
    .maybeSingle()

  if (loadError) {
    return NextResponse.json({
      error: 'La migración de redes sociales todavía no está aplicada en Supabase.',
      detail: loadError.message,
    }, { status: 503 })
  }
  if (!post) return NextResponse.json({ error: 'Borrador no encontrado.' }, { status: 404 })

  const row = post as SocialPostRow
  if (row.status === 'published') {
    return NextResponse.json({ error: 'Este post ya se publicó. Crea uno nuevo si quieres volver a publicar.' }, { status: 409 })
  }
  if (!Array.isArray(row.images) || row.images.length === 0) {
    return NextResponse.json({ error: 'Este borrador no tiene imágenes. Genera al menos una antes de publicar.' }, { status: 400 })
  }
  if (!row.caption?.trim()) {
    return NextResponse.json({ error: 'Este borrador no tiene texto de post.' }, { status: 400 })
  }

  const requestedPlatforms = Array.isArray(body?.platforms)
    ? body.platforms.filter((p): p is ZernioPlatform => VALID_PLATFORMS.includes(p as ZernioPlatform))
    : (row.platform_targets ?? []).filter((p): p is ZernioPlatform => VALID_PLATFORMS.includes(p as ZernioPlatform))
  if (requestedPlatforms.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos una plataforma (Facebook o Instagram).' }, { status: 400 })
  }

  let scheduledForIso: string | null = null
  if (typeof body?.scheduled_for === 'string' && body.scheduled_for.trim()) {
    try {
      scheduledForIso = parsearFechaProgramada(body.scheduled_for.trim()).scheduledFor
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Fecha de programación inválida.' }, { status: 400 })
    }
  }

  const fullCaption = row.hashtags?.length ? `${row.caption}\n\n${row.hashtags.join(' ')}` : row.caption

  let result
  try {
    result = await publishToZernio({
      mediaUrls: row.images.map(image => image.url),
      caption: fullCaption,
      platforms: requestedPlatforms,
      scheduledFor: scheduledForIso,
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo publicar en Zernio.',
    }, { status: 502 })
  }

  const nowIso = new Date().toISOString()
  const { data: updated, error: updateError } = await supabase
    .from('store_social_posts')
    .update({
      status: scheduledForIso ? 'scheduled' : 'published',
      publishing: {
        zernio_post_id: result.postId,
        scheduled_for: scheduledForIso,
        published_at: scheduledForIso ? null : nowIso,
        platforms: requestedPlatforms,
        platform_results: result.raw,
        requested_at: nowIso,
      },
    })
    .eq('id', postId)
    .select('*')
    .single()

  if (updateError) {
    // Ya se publicó/programó en Zernio de verdad; si esto falla, el owner
    // debe saber que la publicación sí salió aunque el registro local falle.
    return NextResponse.json({
      error: 'Se publicó en Zernio pero no se pudo actualizar el registro local.',
      detail: updateError.message,
      zernio_post_id: result.postId,
    }, { status: 500 })
  }

  return NextResponse.json({ post: updated })
}
