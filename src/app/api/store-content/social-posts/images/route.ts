import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { resolveSocialPostProducts } from '@/lib/socialPostProducts'
import { generateProductImage, pickNextVisualIdentity } from '@/lib/socialPostImage'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

function parseProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as {
    product_ids?: unknown; mode?: unknown; text_mode?: unknown; hook?: unknown; price?: unknown; support_points?: unknown; include_model?: unknown
  } | null
  const productIds = parseProductIds(body?.product_ids)
  const mode = body?.mode === 'carousel' ? 'carousel' : 'single'
  const textMode = body?.text_mode === 'ai' ? 'ai' : 'local'
  const hook = typeof body?.hook === 'string' ? body.hook.trim().slice(0, 140) : ''
  const price = typeof body?.price === 'string' ? body.price.trim().slice(0, 40) : ''
  const supportPoints = Array.isArray(body?.support_points)
    ? body.support_points.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 8).map(item => item.trim().slice(0, 60))
    : []
  const includeModel = body?.include_model === true
  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un producto.' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  let products
  try {
    products = await resolveSocialPostProducts(supabase, productIds)
  } catch (error) {
    return NextResponse.json({
      error: 'La migración de fichas de producto todavía no está aplicada en Supabase.',
      detail: error instanceof Error ? error.message : String(error),
    }, { status: 503 })
  }
  if (products.length === 0) {
    return NextResponse.json({ error: 'No se encontraron los productos seleccionados.' }, { status: 404 })
  }

  const targets = mode === 'carousel' ? products : products.slice(0, 1)
  // Restricción imperativa de negocio: nunca se genera una imagen sin la foto
  // real del producto como referencia. Si falta, se bloquea antes de llamar a
  // OpenAI en vez de inventar o usar una imagen genérica.
  const missingPhotos = targets.filter(product => !product.image_url).map(product => product.name)
  if (missingPhotos.length) {
    return NextResponse.json({
      error: 'Estos productos no tienen foto real en la tienda, así que no se puede generar su imagen.',
      missing: missingPhotos,
    }, { status: 400 })
  }

  const identity = await pickNextVisualIdentity(supabase)
  const bakedText = textMode === 'ai' && (hook || price || supportPoints.length > 0)
    ? { hook: hook || undefined, price: price || undefined, supportPoints: supportPoints.length > 0 ? supportPoints : undefined }
    : undefined
  const images: Array<{ base_image_url: string; cloudinary_public_id: string; source_product_id: string }> = []
  let imageModel = ''
  let fallbackUsed = false

  try {
    for (const product of targets) {
      const result = await generateProductImage({
        sourceImageUrl: product.image_url as string,
        productName: product.name,
        identity,
        bakedText,
        includeModel,
      })
      imageModel = result.model
      fallbackUsed = fallbackUsed || result.fallbackUsed

      const dataUri = `data:image/png;base64,${result.buffer.toString('base64')}`
      const uploaded = await cloudinary.uploader.upload(dataUri, {
        folder: 'pos-tienda/social-posts',
        resource_type: 'image',
        use_filename: false,
        unique_filename: true,
        overwrite: false,
      })
      images.push({
        base_image_url: uploaded.secure_url,
        cloudinary_public_id: uploaded.public_id,
        source_product_id: product.id,
      })
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error
        ? error.message
        : 'No se pudo generar la imagen. Verifica que la foto del producto esté disponible o intenta con otro producto.',
    }, { status: 422 })
  }

  return NextResponse.json({
    images,
    visual_identity_key: identity.key,
    image_model: imageModel,
    image_model_fallback_used: fallbackUsed,
    text_baked: Boolean(bakedText),
  })
}
