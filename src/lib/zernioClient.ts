import 'server-only'

// Cliente de Zernio (publica en Facebook/Instagram con una sola llamada).
// Contrato exacto tomado del cliente ya probado en producción del proyecto
// hermano app-contenido (src/publicar/zernio.js) — mismo endpoint, mismo
// shape de body, mismo manejo del error "Duplicate content detected".

export type ZernioPlatform = 'facebook' | 'instagram'

function zernioBaseUrl(): string {
  return (process.env.ZERNIO_BASE_URL || 'https://zernio.com/api/v1').replace(/\/$/, '')
}

function accountIdFor(platform: ZernioPlatform): string | null {
  if (platform === 'facebook') return process.env.ZERNIO_FACEBOOK_ACCOUNT_ID?.trim() || null
  return process.env.ZERNIO_INSTAGRAM_ACCOUNT_ID?.trim() || null
}

export interface PublishToZernioInput {
  mediaUrls: string[]
  caption: string
  platforms: ZernioPlatform[]
  scheduledFor?: string | null
}

export interface PublishToZernioResult {
  raw: unknown
  postId: string | null
}

export async function publishToZernio(input: PublishToZernioInput): Promise<PublishToZernioResult> {
  const apiKey = process.env.ZERNIO_API_KEY?.trim()
  if (!apiKey) throw new Error('Falta configurar ZERNIO_API_KEY en el servidor.')
  if (input.mediaUrls.length === 0) throw new Error('No hay ninguna imagen para publicar.')
  if (input.mediaUrls.length > 10) throw new Error('Instagram admite máximo 10 imágenes por carrusel.')

  const platforms = input.platforms
    .map(platform => ({ platform, accountId: accountIdFor(platform) }))
    .filter((entry): entry is { platform: ZernioPlatform; accountId: string } => Boolean(entry.accountId))

  if (platforms.length === 0) {
    throw new Error('No hay ninguna cuenta de Zernio configurada para las plataformas seleccionadas (ZERNIO_FACEBOOK_ACCOUNT_ID / ZERNIO_INSTAGRAM_ACCOUNT_ID).')
  }

  const body: Record<string, unknown> = {
    content: input.caption,
    mediaItems: input.mediaUrls.map(url => ({ type: 'image', url })),
    platforms,
  }
  if (input.scheduledFor) body.scheduledFor = input.scheduledFor
  else body.publishNow = true

  let response: Response
  try {
    response = await fetch(`${zernioBaseUrl()}/posts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (error) {
    throw new Error(error instanceof Error ? `Error de red al llamar a Zernio: ${error.message}` : 'Error de red al llamar a Zernio.')
  }

  const text = await response.text()
  let data: Record<string, unknown> = {}
  try { data = text ? JSON.parse(text) : {} } catch { /* respuesta no-JSON */ }

  if (!response.ok) {
    const detail = String(data?.error ?? data?.message ?? text.slice(0, 400))
    if (/duplicate content/i.test(detail)) {
      throw new Error('Zernio detectó contenido duplicado. Cambia algo de la imagen o el texto e intenta de nuevo.')
    }
    throw new Error(`Zernio respondió ${response.status}: ${detail}`)
  }

  const postId = typeof data.id === 'string' ? data.id : typeof data.postId === 'string' ? data.postId : null
  return { raw: data, postId }
}
