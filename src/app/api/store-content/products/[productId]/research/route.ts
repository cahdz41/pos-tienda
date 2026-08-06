import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'
import {
  buildResearchInputHash,
  PRODUCT_RESEARCH_PROMPT_VERSION,
  researchProduct,
  selectTrustedLabelCandidate,
  type ProductResearchInput,
} from '@/lib/productResearch'
import {
  deriveProductBrand,
  extractPresentationHint,
  referenceFlavor,
  uniqueKnownFlavors,
} from '@/lib/productResearchInput'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Context = { params: Promise<{ productId: string }> }

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { productId } = await params
  let force = false
  let requestedVariantId = ''
  try {
    const body = await request.json()
    force = body?.force === true
    requestedVariantId = typeof body?.reference_variant_id === 'string'
      ? body.reference_variant_id.trim().slice(0, 100)
      : ''
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
    .eq('store_visible', true)
    .single()

  if (productError || !product) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const variants = (product.product_variants ?? []) as Array<{
    id: string
    flavor: string | null
    barcode: string
    stock: number
  }>
  const referenceVariant = requestedVariantId
    ? variants.find(variant => variant.id === requestedVariantId)
    : variants.length === 1 ? variants[0] : null
  if (!referenceVariant) {
    return NextResponse.json({
      error: requestedVariantId
        ? 'La variante seleccionada no pertenece a este producto.'
        : 'Selecciona el sabor o variante que se usará como referencia.',
    }, { status: 409 })
  }

  const selectedFlavor = referenceFlavor(referenceVariant.flavor)
  const input: ProductResearchInput = {
    product_name: product.name,
    brand: deriveProductBrand(product.name, product.brand),
    category: product.category,
    presentation_hint: extractPresentationHint(product.name),
    reference_flavor: selectedFlavor,
    reference_barcode: referenceVariant.barcode?.trim() || '',
    known_flavors: uniqueKnownFlavors(variants.map(variant => variant.flavor)),
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
    )
    const researchWarnings = [...result.content.research_warnings]
    if (result.sources.length === 0) {
      researchWarnings.push('Gemini no devolvió fuentes verificables. Agrega una fuente antes de enviar la ficha a revisión.')
    }
    if (!result.content.identity_match.matched_barcode && input.reference_barcode) {
      researchWarnings.push('Las fuentes no permitieron confirmar el código de barras; verifica manualmente la variante elegida.')
    }
    const { data: saved, error: saveError } = await supabase
      .from('store_product_content')
      .upsert({
        product_id: productId,
        status: 'draft',
        reference_variant_id: referenceVariant.id,
        reference_flavor: selectedFlavor,
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
        research_warnings: researchWarnings,
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
