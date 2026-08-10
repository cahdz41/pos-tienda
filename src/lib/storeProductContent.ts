import { jsonrepair } from 'jsonrepair'

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
  research_sources: ResearchSource[]
  research_warnings: string[]
}

export interface GeminiResearchResult {
  identity_match: {
    matched: boolean
    confidence: 'low' | 'medium' | 'high'
    matched_name: string
    matched_flavor: string
    matched_presentation: string
    matched_barcode: string
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

export interface ResearchIdentityExpectation {
  product_name: string
  brand: string
  reference_flavor: string
  reference_barcode: string
  presentation_hint: string
}

export function parseResearchJsonText(text: string, finishReason = ''): unknown {
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini agotó el límite de salida antes de completar la ficha. No se realizó un segundo consumo.')
  }

  const withoutFence = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Gemini no devolvió JSON válido. No se realizó un segundo consumo.')
  }

  const candidate = withoutFence.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      throw new Error('No se pudo interpretar ni reparar la respuesta estructurada de Gemini. No se realizó un segundo consumo.')
    }
  }
}

export function formatProductResearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/INVALID_ARGUMENT|request contains an invalid argument|"code"\s*:\s*400/i.test(message)) {
    return 'Gemini rechazó la configuración de investigación. No se realizó un segundo consumo.'
  }
  return message || 'No se pudo investigar el producto.'
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
  'research_sources',
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

export function normalizeResearchSources(value: unknown): ResearchSource[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const sources: ResearchSource[] = []

  for (const item of value.slice(0, 10)) {
    if (!isRecord(item)) continue
    const url = cleanNullableUrl(item.url)
    if (!url || seen.has(url)) continue
    const parsed = new URL(url)
    seen.add(url)
    sources.push({ title: cleanText(item.title, 240) || parsed.hostname, url })
  }
  return sources
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

function normalizeIdentityText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\b(lbs?|pounds?)\b/g, ' lb ')
    .replace(/\b(kgs?|kilograms?)\b/g, ' kg ')
    .replace(/\b(grs?|grams?|gramos?)\b/g, ' g ')
    .replace(/\b(serv(?:ing)?s?|porciones?)\b/g, ' servings ')
    .replace(/\b(caps?|capsulas?)\b/g, ' caps ')
    .replace(/\b(pzas?|pieces?|unidades?)\b/g, ' unit ')
    .replace(/\bsports\b/g, ' sport ')
    .replace(/\b(reese|hershey)\s+s\b/g, ' $1 ')
    .replace(/\b(reeses|hersheys)\b/g, match => match.slice(0, -1))
    .replace(/\bvanilla\b/g, ' vainilla ')
    .replace(/\bstrawberry\b/g, ' fresa ')
    .replace(/\b(unflavou?red|plain)\b/g, ' sin sabor ')
    .replace(/\b(and|n)\b|&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function identityTokens(value: string): string[] {
  const ignored = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'sabor', 'flavor'])
  return [...new Set(normalizeIdentityText(value).split(' ').filter(token => token && !ignored.has(token)))]
}

function mergeAdjacentCompoundTokens(tokens: string[], referenceTokens: Set<string>): string[] {
  const merged: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const compound = `${tokens[index]}${tokens[index + 1] ?? ''}`
    if (tokens[index + 1] && referenceTokens.has(compound)) {
      merged.push(compound)
      index += 1
    } else {
      merged.push(tokens[index])
    }
  }
  return merged
}

export function areProductNamesCompatible(
  expected: string,
  matched: string,
  brand = '',
  allowedExtrasText = '',
): boolean {
  const rawExpectedTokens = identityTokens(`${brand} ${expected}`)
  const rawMatchedTokens = identityTokens(matched)
  const expectedTokens = mergeAdjacentCompoundTokens(rawExpectedTokens, new Set(rawMatchedTokens))
  const matchedTokens = new Set(mergeAdjacentCompoundTokens(rawMatchedTokens, new Set(rawExpectedTokens)))
  if (expectedTokens.length === 0 || matchedTokens.size === 0) return false

  const brandTokens = new Set(identityTokens(brand))
  const presentationTokens = new Set(['lb', 'kg', 'g', 'oz', 'ml', 'l', 'servings', 'caps', 'unit'])
  const optionalExpectedTokens = new Set<string>()
  if (expectedTokens.includes('protein') && matchedTokens.has('protein')) {
    optionalExpectedTokens.add('pro')
  }
  const coreTokens = expectedTokens.filter(token =>
    !brandTokens.has(token) &&
    !presentationTokens.has(token) &&
    !optionalExpectedTokens.has(token) &&
    !/^\d+$/.test(token),
  )
  const coreMatched = coreTokens.filter(token => matchedTokens.has(token)).length
  if (coreTokens.length > 0 && coreMatched / coreTokens.length < 0.8) return false
  if (brandTokens.size > 0 && ![...brandTokens].some(token => matchedTokens.has(token))) return false

  const coverageTokens = expectedTokens.filter(token =>
    !presentationTokens.has(token) && !optionalExpectedTokens.has(token) && !/^\d+$/.test(token),
  )
  const matchedCount = coverageTokens.filter(token => matchedTokens.has(token)).length
  if (coverageTokens.length > 0 && matchedCount / coverageTokens.length < 0.6) return false

  const genericExtras = new Set([
    '100', 'protein', 'proteina', 'powder', 'polvo', 'supplement', 'suplemento',
    'formula', 'dietary', 'nutrition', 'nutricion', 'percent', 'porciento', 'ice', 'cream',
    'whey', 'isolate', 'isolated', 'aislado', 'servings', 'caps', 'unit',
    ...identityTokens(allowedExtrasText),
  ])
  return [...matchedTokens].every(token =>
    expectedTokens.includes(token) || genericExtras.has(token) || /^\d+$/.test(token),
  )
}

export function areFlavorNamesCompatible(expected: string, matched: string): boolean {
  const expectedNormalized = normalizeIdentityText(expected)
  const matchedNormalized = normalizeIdentityText(matched)
  if (!expectedNormalized || !matchedNormalized) return false
  if (expectedNormalized === matchedNormalized) return true
  if (expectedNormalized.includes('sin sabor') && matchedNormalized.includes('sin sabor')) return true

  const expectedTokens = identityTokens(expectedNormalized).filter(token => !['ice', 'cream'].includes(token))
  const matchedTokens = new Set(identityTokens(matchedNormalized).filter(token => !['ice', 'cream'].includes(token)))
  return expectedTokens.length > 0 && expectedTokens.every(token => matchedTokens.has(token))
}

function presentationWeightsInGrams(value: string): number[] {
  const unitFactors: Record<string, number> = {
    lb: 453.59237,
    lbs: 453.59237,
    pound: 453.59237,
    pounds: 453.59237,
    kg: 1000,
    kgs: 1000,
    kilogram: 1000,
    kilograms: 1000,
    g: 1,
    gr: 1,
    grs: 1,
    gram: 1,
    grams: 1,
    gramo: 1,
    gramos: 1,
  }
  const normalized = value.toLocaleLowerCase('es-MX').replace(/,(?=\d)/g, '.')
  const weights: number[] = []
  const pattern = /(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kgs?|kilograms?|grs?|grams?|gramos?)\b/g

  for (const match of normalized.matchAll(pattern)) {
    const amount = Number(match[1])
    const factor = unitFactors[match[2]]
    if (Number.isFinite(amount) && amount > 0 && factor) weights.push(amount * factor)
  }
  return weights
}

type PresentationCompatibility = 'exact' | 'commercial-size' | 'mismatch'

function comparePresentations(expected: string, matched: string): PresentationCompatibility {
  if (!expected.trim()) return 'exact'
  const expectedWeights = presentationWeightsInGrams(expected)
  const matchedWeights = presentationWeightsInGrams(matched)
  if (expectedWeights.length > 0 && matchedWeights.length > 0) {
    if (expectedWeights.some(expectedWeight =>
      matchedWeights.some(matchedWeight => Math.abs(expectedWeight - matchedWeight) / expectedWeight <= 0.05),
    )) return 'exact'

    const fivePoundsInGrams = 5 * 453.59237
    const expectedIsFivePoundClass = expectedWeights.some(weight =>
      Math.abs(weight - fivePoundsInGrams) / fivePoundsInGrams <= 0.05,
    )
    const matchedIsFivePoundClass = matchedWeights.some(weight =>
      weight >= 4.5 * 453.59237 && weight <= 6 * 453.59237,
    )
    return expectedIsFivePoundClass && matchedIsFivePoundClass ? 'commercial-size' : 'mismatch'
  }

  const expectedTokens = identityTokens(expected)
  const matchedTokens = new Set(identityTokens(matched))
  return expectedTokens.length > 0 && expectedTokens.every(token => matchedTokens.has(token))
    ? 'exact'
    : 'mismatch'
}

export function isPresentationCompatible(expected: string, matched: string): boolean {
  return comparePresentations(expected, matched) !== 'mismatch'
}

function descriptionMentionsReferenceFlavor(description: string, flavor: string): boolean {
  const normalizedFlavor = normalizeIdentityText(flavor)
  if (!normalizedFlavor || normalizedFlavor.includes('sin sabor')) return false
  const descriptionTokens = new Set(identityTokens(description))
  const flavorTokens = identityTokens(flavor).filter(token => !['ice', 'cream'].includes(token))
  return flavorTokens.length > 0 && flavorTokens.every(token => descriptionTokens.has(token))
}

export function parseEditableContent(value: unknown): EditableStoreProductContent {
  if (!isRecord(value)) throw new Error('Contenido inválido.')

  const unknownKeys = Object.keys(value).filter(key => !EDITABLE_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`Campos no permitidos: ${unknownKeys.join(', ')}`)

  const variantId = cleanText(value.reference_variant_id, 100)
  const researchSources = normalizeResearchSources(value.research_sources)
  const researchWarnings = cleanTextArray(value.research_warnings, 20, 500)
    .filter(warning => !(
      researchSources.length > 0 && warning.startsWith('Gemini no devolvió fuentes verificables.')
    ))
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
    research_sources: researchSources,
    research_warnings: researchWarnings,
  }
}

export function parseGeminiResearch(
  value: unknown,
  expectedIdentity?: ResearchIdentityExpectation,
): GeminiResearchResult {
  if (!isRecord(value)) throw new Error('Gemini no devolvió un objeto JSON.')

  const unknownKeys = Object.keys(value).filter(key => !RESEARCH_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`Gemini agregó campos no permitidos: ${unknownKeys.join(', ')}`)

  if (!isRecord(value.identity_match)) throw new Error('Falta la validación de identidad.')
  const identityKeys = new Set(['matched', 'confidence', 'matched_name', 'matched_flavor', 'matched_presentation', 'matched_barcode'])
  const unknownIdentity = Object.keys(value.identity_match).filter(key => !identityKeys.has(key))
  if (unknownIdentity.length) throw new Error('La validación de identidad contiene campos no permitidos.')

  const confidence = value.identity_match.confidence
  if (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high') {
    throw new Error('Nivel de confianza inválido.')
  }

  const matchedName = cleanText(value.identity_match.matched_name, 200)
  const matchedFlavor = cleanText(value.identity_match.matched_flavor, 80)
  const matchedPresentation = cleanText(value.identity_match.matched_presentation, 120)
  const matchedBarcode = cleanText(value.identity_match.matched_barcode, 100).replace(/\s/g, '')
  if (value.identity_match.matched !== true) throw new Error('Gemini no confirmó la identidad del producto.')
  if (confidence === 'low') throw new Error('Gemini devolvió una coincidencia de identidad con confianza baja.')

  let presentationCompatibility: PresentationCompatibility = 'exact'
  if (expectedIdentity) {
    if (!areProductNamesCompatible(
      expectedIdentity.product_name,
      matchedName,
      expectedIdentity.brand,
      `${expectedIdentity.reference_flavor} ${matchedPresentation}`,
    )) {
      throw new Error(`Gemini encontró "${matchedName || 'nombre no identificado'}", que no corresponde a "${expectedIdentity.product_name}".`)
    }
    if (!areFlavorNamesCompatible(expectedIdentity.reference_flavor, matchedFlavor)) {
      throw new Error(`Gemini encontró el sabor "${matchedFlavor || 'no identificado'}", que no corresponde a "${expectedIdentity.reference_flavor}".`)
    }
    presentationCompatibility = comparePresentations(expectedIdentity.presentation_hint, matchedPresentation)
    if (presentationCompatibility === 'mismatch') {
      throw new Error(`La presentación encontrada, "${matchedPresentation || 'no identificada'}", no coincide con ${expectedIdentity.presentation_hint}.`)
    }
    if (matchedBarcode && expectedIdentity.reference_barcode && matchedBarcode !== expectedIdentity.reference_barcode.replace(/\s/g, '')) {
      throw new Error('El código de barras encontrado pertenece a otra variante.')
    }
  }

  const shortDescription = cleanText(value.short_description, 1200)
  if (expectedIdentity && descriptionMentionsReferenceFlavor(shortDescription, expectedIdentity.reference_flavor)) {
    throw new Error('La descripción principal debe ser general y no mencionar el sabor de referencia.')
  }

  const researchWarnings = cleanTextArray(value.research_warnings, 20, 500)
  if (presentationCompatibility === 'commercial-size') {
    researchWarnings.push(
      `La fuente identifica la presentación como ${matchedPresentation}; se aceptó como equivalente comercial de ${expectedIdentity?.presentation_hint}.`,
    )
  }

  return {
    identity_match: {
      matched: true,
      confidence,
      matched_name: matchedName,
      matched_flavor: matchedFlavor,
      matched_presentation: matchedPresentation,
      matched_barcode: matchedBarcode,
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
    research_warnings: researchWarnings.slice(0, 20),
  }
}

export function validateContentForReview(content: Partial<StoreProductContent>): string[] {
  const missing: string[] = []
  if (!content.reference_variant_id?.trim()) missing.push('Variante de referencia')
  if (!content.reference_flavor?.trim()) missing.push('Sabor de referencia')
  if (!content.short_description?.trim()) missing.push('Descripción corta')
  if (!content.key_features || content.key_features.length < 3) missing.push('Al menos 3 características clave')
  if (!content.presentation?.trim()) missing.push('Presentación')
  if (!content.serving_size?.trim()) missing.push('Tamaño de porción')
  if (!content.servings_per_container?.trim()) missing.push('Número de porciones')
  if (!content.nutrition_facts || content.nutrition_facts.length < 4) missing.push('Tabla nutrimental completa')
  if (!content.ingredients?.trim()) missing.push('Ingredientes')
  if (!content.directions?.trim()) missing.push('Modo de uso')
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
