import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { resolveSocialPostProducts } from '@/lib/socialPostProducts'
import { generateCaption, type CaptionIdeaInput } from '@/lib/socialPostCaption'
import { researchProducts } from '@/lib/socialPostResearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
}

function parseIdea(value: unknown): CaptionIdeaInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Falta la idea del post.')
  const record = value as Record<string, unknown>

  if (typeof record.free_text === 'string' && record.free_text.trim()) {
    return { free_text: record.free_text.trim().slice(0, 1000) }
  }

  const title = typeof record.title === 'string' ? record.title.trim() : ''
  const angle = typeof record.angle === 'string' ? record.angle.trim() : ''
  const hook = typeof record.hook === 'string' ? record.hook.trim() : ''
  const cta = typeof record.cta === 'string' ? record.cta.trim() : ''
  if (!title || !hook || !cta) throw new Error('La idea seleccionada está incompleta.')
  return { title, angle, hook, cta }
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { product_ids?: unknown; idea?: unknown; research_brief?: unknown } | null
  const productIds = parseProductIds(body?.product_ids)
  if (productIds.length === 0) {
    return NextResponse.json({ error: 'Selecciona al menos un producto.' }, { status: 400 })
  }

  let idea: CaptionIdeaInput
  try {
    idea = parseIdea(body?.idea)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Idea inválida.' }, { status: 400 })
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

  const providedResearch = typeof body?.research_brief === 'string' ? body.research_brief : ''
  const research = providedResearch.trim()
    ? providedResearch
    : (await researchProducts(products.map(product => ({ name: product.name, brand: product.brand, category: product.category })))).text

  try {
    const result = await generateCaption(
      products.map(product => ({
        name: product.name,
        brand: product.brand,
        short_description: product.short_description || undefined,
        sale_price: product.sale_price,
      })),
      idea,
      research,
    )
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo generar el texto del post.',
    }, { status: 422 })
  }
}
