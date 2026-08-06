import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import {
  buildResearchInputHash,
  PILOT_PRODUCT_NAME,
  PILOT_PRODUCT_SOURCE_URL,
  PILOT_LABEL_SOURCE_URL,
  PILOT_REFERENCE_BARCODE,
  PILOT_REFERENCE_FLAVOR,
  PRODUCT_RESEARCH_PROMPT_VERSION,
  researchProduct,
  selectTrustedLabelCandidate,
  type ProductResearchInput,
} from '@/lib/productResearch'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Context = { params: Promise<{ productId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { productId } = await params
  let force = false
  try {
    const body = await request.json()
    force = body?.force === true
  } catch {
    // Un cuerpo vacío equivale a usar caché.
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: product, error: productError } = await supabase
    .from('products')
    .select(`
      id, name, brand, category,
      product_variants (id, flavor, barcode, stock)
    `)
    .eq('id', productId)
    .single()

  if (productError || !product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  if (product.name !== PILOT_PRODUCT_NAME) {
    return NextResponse.json({ error: 'La primera versión está limitada al producto piloto aprobado.' }, { status: 403 })
  }

  const variants = (product.product_variants ?? []) as Array<{
    id: string
    flavor: string | null
    barcode: string
    stock: number
  }>
  const referenceVariant = variants.find(variant =>
    variant.barcode === PILOT_REFERENCE_BARCODE && /vainilla|vanilla/i.test(variant.flavor ?? '')
  )
  if (!referenceVariant) {
    return NextResponse.json({ error: 'No se encontró la variante Vainilla aprobada para el piloto.' }, { status: 409 })
  }

  const input: ProductResearchInput = {
    product_name: product.name,
    brand: product.brand || 'Mutant',
    category: product.category,
    presentation_hint: '5 lb / 2.27 kg',
    reference_flavor: PILOT_REFERENCE_FLAVOR,
    reference_barcode: PILOT_REFERENCE_BARCODE,
    known_flavors: variants.map(variant => variant.flavor).filter((flavor): flavor is string => Boolean(flavor)),
    preferred_sources: [PILOT_PRODUCT_SOURCE_URL, PILOT_LABEL_SOURCE_URL],
    language: 'es-MX',
  }
  const inputHash = buildResearchInputHash(input)

  const { data: existing, error: existingError } = await supabase
    .from('store_product_content')
    .select('*')
    .eq('product_id', productId)
    .maybeSingle()
  if (existingError) {
    return NextResponse.json({ error: 'La migración de fichas todavía no está aplicada.', detail: existingError.message }, { status: 503 })
  }

  if (!force && existing?.research_input_hash === inputHash &&
      existing?.research_prompt_version === PRODUCT_RESEARCH_PROMPT_VERSION && existing?.researched_at) {
    return NextResponse.json({ content: existing, cached: true })
  }

  try {
    const result = await researchProduct(input)
    const nutritionLabelUrl = selectTrustedLabelCandidate(
      result.content.nutrition_label_candidates,
      result.sources,
    ) ?? PILOT_LABEL_SOURCE_URL
    const { data: saved, error: saveError } = await supabase
      .from('store_product_content')
      .upsert({
        product_id: productId,
        status: 'draft',
        reference_variant_id: referenceVariant.id,
        reference_flavor: PILOT_REFERENCE_FLAVOR,
        short_description: result.content.short_description,
        key_features: result.content.key_features,
        serving_size: result.content.serving_size,
        servings_per_container: result.content.servings_per_container,
        presentation: result.content.presentation,
        nutrition_facts: result.content.nutrition_facts,
        ingredients: result.content.ingredients,
        directions: result.content.directions,
        nutrition_label_url: nutritionLabelUrl,
        research_sources: result.sources,
        research_warnings: result.content.research_warnings,
        research_model: result.model,
        research_prompt_version: result.promptVersion,
        research_input_hash: result.inputHash,
        research_usage: result.usage,
        researched_at: new Date().toISOString(),
        published_at: null,
        published_by: null,
      }, { onConflict: 'product_id' })
      .select('*')
      .single()

    if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 })
    return NextResponse.json({ content: saved, cached: false })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo investigar el producto.',
      retried: false,
    }, { status: 422 })
  }
}
