import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import { resolveSocialPostProducts } from '@/lib/socialPostProducts'
import { generateIdeaOptions } from '@/lib/socialPostIdeas'
import { researchProducts } from '@/lib/socialPostResearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => null) as { product_ids?: unknown } | null
  const productIds = parseProductIds(body?.product_ids)
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

  const research = await researchProducts(products.map(product => ({
    name: product.name, brand: product.brand, category: product.category,
  })))

  try {
    const result = await generateIdeaOptions(products.map(product => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      short_description: product.short_description || undefined,
    })), research.text)
    return NextResponse.json({ ...result, research_brief: research.text, research_provider: research.provider })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudieron generar las ideas.',
    }, { status: 422 })
  }
}
