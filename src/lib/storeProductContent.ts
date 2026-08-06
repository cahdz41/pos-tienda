export const CONTENT_STATUSES = ['draft', 'review', 'published'] as const
export type StoreProductContentStatus = (typeof CONTENT_STATUSES)[number]

export interface NutritionFactRow {
  name: string
  amount: string
  unit: string
  daily_value: string | null
  indent: number
}

export interface ResearchSource {
  title: string
  url: string
}

export interface StoreProductContent {
  product_id: string
  status: StoreProductContentStatus
  reference_variant_id: string | null
  reference_flavor: string
  short_description: string
  key_features: string[]
  serving_size: string
  servings_per_container: string
  presentation: string
  nutrition_facts: NutritionFactRow[]
  ingredients: string
  directions: string
  nutrition_label_url: string | null
  research_sources: ResearchSource[]
  research_warnings: string[]
  research_model: string | null
  research_prompt_version: string | null
  research_input_hash: string | null
  research_usage: Record<string, unknown> | null
  researched_at: string | null
  published_at: string | null
  published_by: string | null
  created_at?: string
  updated_at?: string
}

export interface EditableStoreProductContent {
  reference_variant_id: string | null
  reference_flavor: string
  short_description: string
  key_features: string[]
  serving_size: string
  servings_per_container: string
  presentation: string
  nutrition_facts: NutritionFactRow[]
  ingredients: string
  directions: string
  nutrition_label_url: string | null
  research_warnings: string[]
}

export interface GeminiResearchResult {
  identity_match: {
    matched: boolean
    confidence: 'low' | 'medium' | 'high'
    matched_name: string
    matched_flavor: string
    matched_presentation: string
  }
  short_description: string
  key_features: string[]
  presentation: string
  serving_size: string
  servings_per_container: string
  nutrition_facts: NutritionFactRow[]
  ingredients: string
  directions: string
  nutrition_label_candidates: string[]
  research_warnings: string[]
}

const EDITABLE_KEYS = new Set([
  'reference_variant_id',
  'reference_flavor',
  'short_description',
  'key_features',
  'serving_size',
  'servings_per_container',
  'presentation',
  'nutrition_facts',
  'ingredients',
  'directions',
  'nutrition_label_url',
  'research_warnings',
])

const RESEARCH_KEYS = new Set([
  'identity_match',
  'short_description',
  'key_features',
  'presentation',
  'serving_size',
  'servings_per_container',
  'nutrition_facts',
  'ingredients',
  'directions',
  'nutrition_label_candidates',
  'research_warnings',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function cleanTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function cleanNullableUrl(value: unknown): string | null {
  const text = cleanText(value, 2000)
  if (!text) return null
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

export function normalizeNutritionFacts(value: unknown): NutritionFactRow[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, 40)
    .map(row => {
      if (!isRecord(row)) return null
      const name = cleanText(row.name, 100)
      const amount = cleanText(row.amount, 40)
      if (!name || !amount) return null
      const dailyValue = cleanText(row.daily_value, 30)
      const rawIndent = typeof row.indent === 'number' && Number.isFinite(row.indent)
        ? Math.trunc(row.indent)
        : 0
      return {
        name,
        amount,
        unit: cleanText(row.unit, 20),
        daily_value: dailyValue || null,
        indent: Math.min(2, Math.max(0, rawIndent)),
      }
    })
    .filter((row): row is NutritionFactRow => row !== null)
}

export function parseEditableContent(value: unknown): EditableStoreProductContent {
  if (!isRecord(value)) throw new Error('Contenido inválido.')

  const unknownKeys = Object.keys(value).filter(key => !EDITABLE_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`Campos no permitidos: ${unknownKeys.join(', ')}`)

  const variantId = cleanText(value.reference_variant_id, 100)
  return {
    reference_variant_id: variantId || null,
    reference_flavor: cleanText(value.reference_flavor, 80),
    short_description: cleanText(value.short_description, 1200),
    key_features: cleanTextArray(value.key_features, 6, 240),
    serving_size: cleanText(value.serving_size, 120),
    servings_per_container: cleanText(value.servings_per_container, 120),
    presentation: cleanText(value.presentation, 120),
    nutrition_facts: normalizeNutritionFacts(value.nutrition_facts),
    ingredients: cleanText(value.ingredients, 5000),
    directions: cleanText(value.directions, 2000),
    nutrition_label_url: cleanNullableUrl(value.nutrition_label_url),
    research_warnings: cleanTextArray(value.research_warnings, 20, 500),
  }
}

export function parseGeminiResearch(value: unknown): GeminiResearchResult {
  if (!isRecord(value)) throw new Error('Gemini no devolvió un objeto JSON.')

  const unknownKeys = Object.keys(value).filter(key => !RESEARCH_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`Gemini agregó campos no permitidos: ${unknownKeys.join(', ')}`)

  if (!isRecord(value.identity_match)) throw new Error('Falta la validación de identidad.')
  const identityKeys = new Set(['matched', 'confidence', 'matched_name', 'matched_flavor', 'matched_presentation'])
  const unknownIdentity = Object.keys(value.identity_match).filter(key => !identityKeys.has(key))
  if (unknownIdentity.length) throw new Error('La validación de identidad contiene campos no permitidos.')

  const confidence = value.identity_match.confidence
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
    throw new Error('Nivel de confianza inválido.')
  }

  const matchedName = cleanText(value.identity_match.matched_name, 200)
  const matchedFlavor = cleanText(value.identity_match.matched_flavor, 80)
  const normalizedName = matchedName.toLocaleLowerCase('es-MX')
  if (value.identity_match.matched !== true) throw new Error('Gemini no confirmó la identidad del producto.')
  if (!normalizedName.includes('mutant') || !normalizedName.includes('whey')) {
    throw new Error('La fuente encontrada no corresponde a Mutant Whey.')
  }
  if (/hardcore|mass|iso\s*surge/i.test(matchedName)) {
    throw new Error('Se rechazó información de otra línea de Mutant.')
  }
  if (!/vainilla|vanilla/i.test(matchedFlavor)) {
    throw new Error('La información nutrimental no corresponde a Vainilla.')
  }

  const shortDescription = cleanText(value.short_description, 1200)
  if (/vainilla|vanilla/i.test(shortDescription)) {
    throw new Error('La descripción principal debe ser general y no mencionar el sabor de referencia.')
  }

  return {
    identity_match: {
      matched: true,
      confidence,
      matched_name: matchedName,
      matched_flavor: matchedFlavor,
      matched_presentation: cleanText(value.identity_match.matched_presentation, 120),
    },
    short_description: shortDescription,
    key_features: cleanTextArray(value.key_features, 6, 240),
    presentation: cleanText(value.presentation, 120),
    serving_size: cleanText(value.serving_size, 120),
    servings_per_container: cleanText(value.servings_per_container, 120),
    nutrition_facts: normalizeNutritionFacts(value.nutrition_facts),
    ingredients: cleanText(value.ingredients, 5000),
    directions: cleanText(value.directions, 2000),
    nutrition_label_candidates: cleanTextArray(value.nutrition_label_candidates, 6, 2000)
      .map(cleanNullableUrl)
      .filter((url): url is string => url !== null),
    research_warnings: cleanTextArray(value.research_warnings, 20, 500),
  }
}

export function validateContentForReview(content: Partial<StoreProductContent>): string[] {
  const missing: string[] = []
  if (!content.reference_flavor?.trim()) missing.push('Sabor de referencia')
  if (!content.short_description?.trim()) missing.push('Descripción corta')
  if (!content.key_features || content.key_features.length < 3) missing.push('Al menos 3 características clave')
  if (!content.presentation?.trim()) missing.push('Presentación')
  if (!content.serving_size?.trim()) missing.push('Tamaño de porción')
  if (!content.servings_per_container?.trim()) missing.push('Número de porciones')
  if (!content.nutrition_facts || content.nutrition_facts.length < 4) missing.push('Tabla nutrimental completa')
  if (!content.ingredients?.trim()) missing.push('Ingredientes')
  if (!content.directions?.trim()) missing.push('Modo de uso')
  if (!content.research_sources || content.research_sources.length < 1) missing.push('Al menos una fuente')
  return missing
}

export function canTransitionContentStatus(
  from: StoreProductContentStatus,
  to: StoreProductContentStatus,
): boolean {
  if (from === to) return true
  if (from === 'draft') return to === 'review'
  if (from === 'review') return to === 'draft' || to === 'published'
  return to === 'draft'
}
