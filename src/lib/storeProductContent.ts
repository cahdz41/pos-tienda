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

export interface GeminiResearchParseOptions {
  allow_unconfirmed_identity?: boolean
  allow_product_name_mismatch?: boolean
  allow_presentation_mismatch?: boolean
  allow_barcode_mismatch?: boolean
  record_manual_identity_confirmation?: boolean
}

export class IdentityConfirmationRequiredError extends Error {
  readonly code: string = 'IDENTITY_CONFIRMATION_REQUIRED'
}

export class ProductNameMismatchError extends IdentityConfirmationRequiredError {
  readonly code = 'PRODUCT_NAME_MISMATCH'
}

export class PresentationMismatchError extends IdentityConfirmationRequiredError {
  readonly code = 'PRESENTATION_MISMATCH'
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

const PRESENTATION_IDENTITY_TOKENS = new Set([
  'lb', 'kg', 'g', 'oz', 'ml', 'l', 'servings', 'caps', 'unit',
])

const NON_LINE_IDENTITY_TOKENS = new Set([
  '100', 'powder', 'polvo', 'supplement', 'suplemento', 'formula', 'dietary',
  'nutrition', 'nutricion', 'percent', 'porciento', 'ice', 'cream', 'pre', 'workout',
])

const CATEGORY_DESCRIPTOR_TOKENS = new Set([
  'protein', 'proteina', 'whey', 'isolate', 'isolated', 'aislado',
])

function identityTokensMatch(expected: string, matched: string): boolean {
  if (expected === matched) return true
  if (Math.min(expected.length, matched.length) < 5) return false
  if (Math.abs(expected.length - matched.length) > 1) return false

  let expectedIndex = 0
  let matchedIndex = 0
  let edits = 0
  while (expectedIndex < expected.length && matchedIndex < matched.length) {
    if (expected[expectedIndex] === matched[matchedIndex]) {
      expectedIndex += 1
      matchedIndex += 1
      continue
    }
    edits += 1
    if (edits > 1) return false
    if (expected.length > matched.length) expectedIndex += 1
    else if (matched.length > expected.length) matchedIndex += 1
    else {
      expectedIndex += 1
      matchedIndex += 1
    }
  }
  if (expectedIndex < expected.length || matchedIndex < matched.length) edits += 1
  return edits <= 1
}

function matchIdentityTokenGroups(expectedTokens: string[], matchedTokens: string[]) {
  const usedMatched = new Set<number>()
  const shared: string[] = []

  for (const expectedToken of expectedTokens) {
    let matchedIndex = matchedTokens.findIndex((matchedToken, index) =>
      !usedMatched.has(index) && expectedToken === matchedToken,
    )
    if (matchedIndex < 0) {
      matchedIndex = matchedTokens.findIndex((matchedToken, index) =>
        !usedMatched.has(index) && identityTokensMatch(expectedToken, matchedToken),
      )
    }
    if (matchedIndex < 0) continue
    usedMatched.add(matchedIndex)
    shared.push(expectedToken)
  }

  return {
    shared,
    unexpectedMatched: matchedTokens.filter((_, index) => !usedMatched.has(index)),
  }
}

function resolveBrandIdentity(brand: string, matchedTokens: string[]) {
  const rawBrandTokens = identityTokens(brand)
  const expectedBrandTokens = mergeAdjacentCompoundTokens(rawBrandTokens, new Set(matchedTokens))
  if (expectedBrandTokens.length === 0) {
    return { compatible: true, expectedBrandTokens: new Set<string>(), matchedBrandTokens: new Set<string>() }
  }

  const directMatch = matchIdentityTokenGroups(expectedBrandTokens, matchedTokens)
  if (directMatch.shared.length === expectedBrandTokens.length) {
    const matchedBrandTokens = matchedTokens.filter(token =>
      expectedBrandTokens.some(expectedToken => identityTokensMatch(expectedToken, token)),
    )
    return {
      compatible: true,
      expectedBrandTokens: new Set(expectedBrandTokens),
      matchedBrandTokens: new Set(matchedBrandTokens),
    }
  }

  const compactBrand = rawBrandTokens.join('')
  const compactMatch = matchedTokens.find(token => identityTokensMatch(compactBrand, token))
  if (compactMatch) {
    return {
      compatible: true,
      expectedBrandTokens: new Set([compactBrand]),
      matchedBrandTokens: new Set([compactMatch]),
    }
  }

  const rawBrand = brand.replace(/[^A-Za-z0-9]/g, '')
  const isInventoryAcronym = /^[A-Z0-9]{2,6}$/.test(rawBrand)
  if (isInventoryAcronym && rawBrandTokens.length === 1) {
    const acronym = rawBrandTokens[0]
    for (let index = 0; index <= matchedTokens.length - acronym.length; index += 1) {
      const expansion = matchedTokens.slice(index, index + acronym.length)
      if (expansion.map(token => token[0]).join('') === acronym) {
        return {
          compatible: true,
          expectedBrandTokens: new Set(rawBrandTokens),
          matchedBrandTokens: new Set(expansion),
        }
      }
    }
  }

  if (rawBrandTokens.length > 1) {
    const acronym = rawBrandTokens.map(token => token[0]).join('')
    const acronymMatch = matchedTokens.find(token => token === acronym)
    if (acronymMatch) {
      return {
        compatible: true,
        expectedBrandTokens: new Set(expectedBrandTokens),
        matchedBrandTokens: new Set([acronymMatch]),
      }
    }
  }

  return {
    compatible: false,
    expectedBrandTokens: new Set(expectedBrandTokens),
    matchedBrandTokens: new Set<string>(),
  }
}

function productNameParts(
  expected: string,
  matched: string,
  brand: string,
  allowedExtrasText: string,
) {
  const rawExpectedTokens = identityTokens(`${brand} ${expected}`)
  const rawMatchedTokens = identityTokens(matched)
  const expectedTokens = mergeAdjacentCompoundTokens(rawExpectedTokens, new Set(rawMatchedTokens))
  const matchedTokens = mergeAdjacentCompoundTokens(rawMatchedTokens, new Set(rawExpectedTokens))
  const brandIdentity = resolveBrandIdentity(brand, matchedTokens)
  const allowedAttributeTokens = identityTokens(allowedExtrasText)
  const isExpectedLineToken = (token: string) =>
    !brandIdentity.expectedBrandTokens.has(token) &&
    !PRESENTATION_IDENTITY_TOKENS.has(token) &&
    !NON_LINE_IDENTITY_TOKENS.has(token) &&
    !allowedAttributeTokens.some(attribute => identityTokensMatch(attribute, token)) &&
    !/^\d+$/.test(token)
  const isMatchedLineToken = (token: string) =>
    !brandIdentity.matchedBrandTokens.has(token) &&
    !PRESENTATION_IDENTITY_TOKENS.has(token) &&
    !NON_LINE_IDENTITY_TOKENS.has(token) &&
    !allowedAttributeTokens.some(attribute => identityTokensMatch(attribute, token)) &&
    !/^\d+$/.test(token)

  return {
    brandCompatible: brandIdentity.compatible,
    expectedLineTokens: [...new Set(expectedTokens.filter(isExpectedLineToken))],
    matchedLineTokens: [...new Set(matchedTokens.filter(isMatchedLineToken))],
  }
}

function hasExplicitProductNameConflict(
  expected: string,
  matched: string,
  brand: string,
  allowedExtrasText: string,
): boolean {
  const { expectedLineTokens, matchedLineTokens } = productNameParts(
    expected,
    matched,
    brand,
    allowedExtrasText,
  )
  if (expectedLineTokens.length === 0 || matchedLineTokens.length === 0) return false

  const { shared, unexpectedMatched } = matchIdentityTokenGroups(expectedLineTokens, matchedLineTokens)
  const conflictingMatched = unexpectedMatched.filter(token => !CATEGORY_DESCRIPTOR_TOKENS.has(token))
  const expectedCoverage = shared.length / expectedLineTokens.length

  return conflictingMatched.length > 0 || (unexpectedMatched.length > 0 && expectedCoverage < 0.8)
}

export function areProductNamesCompatible(
  expected: string,
  matched: string,
  brand = '',
  allowedExtrasText = '',
): boolean {
  const {
    brandCompatible,
    expectedLineTokens,
    matchedLineTokens,
  } = productNameParts(expected, matched, brand, allowedExtrasText)

  if (expectedLineTokens.length === 0 || matchedLineTokens.length === 0) return false

  // A multi-word brand is one identity signal. Matching only "Nutrition" or
  // "Labs" is not enough to claim the same manufacturer.
  if (!brandCompatible) return false

  const { shared, unexpectedMatched } = matchIdentityTokenGroups(expectedLineTokens, matchedLineTokens)
  const conflictingMatched = unexpectedMatched.filter(token => !CATEGORY_DESCRIPTOR_TOKENS.has(token))

  // Extra line words in the web result are dangerous: "Hardcore", "Ripped"
  // or another edition name can identify a genuinely different formula.
  // Conversely, the POS name may legitimately append one internal qualifier
  // (colour, edition or package nickname) that the canonical name omits.
  if (conflictingMatched.length > 0 || shared.length === 0) return false

  const expectedCoverage = shared.length / expectedLineTokens.length
  const matchedCoverage = shared.length / matchedLineTokens.length
  if (unexpectedMatched.length > 0 && expectedCoverage < 0.8) return false
  return matchedCoverage >= 0.5 && expectedCoverage >= 0.5
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

    if (expectedWeights.some(expectedWeight =>
      matchedWeights.some(matchedWeight => Math.abs(expectedWeight - matchedWeight) / expectedWeight <= 0.10),
    )) return 'commercial-size'

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
  options: GeminiResearchParseOptions = {},
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
  let identityUnconfirmed = false
  if (value.identity_match.matched !== true || confidence === 'low') {
    if (!options.allow_unconfirmed_identity) {
      throw new IdentityConfirmationRequiredError(
        value.identity_match.matched !== true
          ? 'Gemini no confirmó la identidad del producto.'
          : 'Gemini devolvió una coincidencia de identidad con confianza baja.',
      )
    }
    identityUnconfirmed = true
  }

  let presentationCompatibility: PresentationCompatibility = 'exact'
  let productNameMismatchConfirmed = false
  let presentationMismatchConfirmed = false
  let barcodeMismatchConfirmed = false
  let flavorDiffers = false
  if (expectedIdentity) {
    const expectedBarcode = expectedIdentity.reference_barcode.replace(/\s/g, '')
    const barcodeMatches = Boolean(matchedBarcode && expectedBarcode && matchedBarcode === expectedBarcode)
    const allowedNameAttributes = `${expectedIdentity.reference_flavor} ${expectedIdentity.presentation_hint} ${matchedPresentation}`
    if (matchedBarcode && expectedBarcode && !barcodeMatches) {
      if (!options.allow_barcode_mismatch) {
        throw new IdentityConfirmationRequiredError('El código de barras encontrado pertenece a otra variante.')
      }
      barcodeMismatchConfirmed = true
    }
    const productNameMatches = areProductNamesCompatible(
      expectedIdentity.product_name,
      matchedName,
      expectedIdentity.brand,
      allowedNameAttributes,
    )
    const nameHasConflict = hasExplicitProductNameConflict(
      expectedIdentity.product_name,
      matchedName,
      expectedIdentity.brand,
      allowedNameAttributes,
    )
    if (!productNameMatches && (!barcodeMatches || nameHasConflict)) {
      if (!options.allow_product_name_mismatch) {
        throw new ProductNameMismatchError(
          `Gemini encontró "${matchedName || 'nombre no identificado'}", que no corresponde a "${expectedIdentity.product_name}".`,
        )
      }
      productNameMismatchConfirmed = true
    }
    if (!areFlavorNamesCompatible(expectedIdentity.reference_flavor, matchedFlavor)) {
      flavorDiffers = true
    }
    presentationCompatibility = comparePresentations(expectedIdentity.presentation_hint, matchedPresentation)
    if (presentationCompatibility === 'mismatch') {
      if (!options.allow_presentation_mismatch) {
        throw new PresentationMismatchError(
          `La presentación encontrada, "${matchedPresentation || 'no identificada'}", no coincide con ${expectedIdentity.presentation_hint}.`,
        )
      }
      presentationMismatchConfirmed = true
    }
  }

  const shortDescription = cleanText(value.short_description, 1200)
  const descriptionIncludesReferenceFlavor = Boolean(
    expectedIdentity && descriptionMentionsReferenceFlavor(shortDescription, expectedIdentity.reference_flavor),
  )

  const researchWarnings = cleanTextArray(value.research_warnings, 20, 500)
  if (presentationCompatibility === 'commercial-size') {
    researchWarnings.push(
      `La fuente identifica la presentación como ${matchedPresentation}; se aceptó como equivalente comercial de ${expectedIdentity?.presentation_hint}.`,
    )
  }
  if (flavorDiffers && expectedIdentity) {
    researchWarnings.push(
      `Gemini encontró el sabor "${matchedFlavor || 'no identificado'}" en lugar de "${expectedIdentity.reference_flavor}"; se conservó porque el sabor no determina la identidad del producto.`,
    )
  }
  if (descriptionIncludesReferenceFlavor) {
    researchWarnings.push('La descripción principal menciona el sabor de referencia; revísala si deseas que sea general para todas las variantes.')
  }
  if (productNameMismatchConfirmed && options.record_manual_identity_confirmation && expectedIdentity) {
    researchWarnings.push(
      `El propietario confirmó manualmente que "${matchedName}" corresponde a "${expectedIdentity.product_name}".`,
    )
  }
  if (presentationMismatchConfirmed && options.record_manual_identity_confirmation && expectedIdentity) {
    researchWarnings.push(
      `El propietario confirmó manualmente que la presentación "${matchedPresentation}" corresponde a "${expectedIdentity.presentation_hint}".`,
    )
  }
  if (identityUnconfirmed && options.record_manual_identity_confirmation) {
    researchWarnings.push('El propietario confirmó manualmente una coincidencia que Gemini marcó con identidad o confianza insuficiente.')
  }
  if (barcodeMismatchConfirmed && options.record_manual_identity_confirmation && expectedIdentity) {
    researchWarnings.push(
      `El propietario confirmó manualmente la coincidencia aunque el código "${matchedBarcode}" difiere de "${expectedIdentity.reference_barcode}".`,
    )
  }

  return {
    identity_match: {
      matched: value.identity_match.matched === true,
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
  // El número de filas depende del tipo de suplemento. Una proteína suele
  // declarar varios nutrimentos, mientras que un preentreno con mezcla
  // propietaria puede tener una sola fila legítima con el total de la mezcla.
  // La completitud se revisa por la validez de la fila, no por un mínimo fijo.
  if (normalizeNutritionFacts(content.nutrition_facts).length === 0) {
    missing.push('Tabla nutrimental con al menos una fila válida')
  }
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
