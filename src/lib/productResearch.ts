import 'server-only'

import { createHash } from 'node:crypto'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import {
  IdentityConfirmationRequiredError,
  normalizeResearchSources,
  parseGeminiResearch,
  parseResearchJsonText,
  type GeminiResearchResult,
  type ResearchSource,
} from '@/lib/storeProductContent'
import { buildProductSearchQueries } from '@/lib/productResearchInput'

export const PRODUCT_RESEARCH_MODEL = 'gemini-3.5-flash'
export const PRODUCT_RESEARCH_PROMPT_VERSION = 'catalog-owner-confirmed-v6'

const MAX_OUTPUT_TOKENS = 6000

const RESEARCH_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
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
  ],
  properties: {
    identity_match: {
      type: 'object',
      additionalProperties: false,
      required: ['matched', 'confidence', 'matched_name', 'matched_flavor', 'matched_presentation', 'matched_barcode'],
      properties: {
        matched: { type: 'boolean' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        matched_name: { type: 'string' },
        matched_flavor: { type: 'string' },
        matched_presentation: { type: 'string' },
        matched_barcode: { type: 'string' },
      },
    },
    short_description: { type: 'string' },
    key_features: { type: 'array', maxItems: 6, items: { type: 'string' } },
    presentation: { type: 'string' },
    serving_size: { type: 'string' },
    servings_per_container: { type: 'string' },
    nutrition_facts: {
      type: 'array',
      maxItems: 40,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'amount', 'unit', 'daily_value', 'indent'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'string' },
          unit: { type: 'string' },
          daily_value: { type: ['string', 'null'] },
          indent: { type: 'integer', minimum: 0, maximum: 2 },
        },
      },
    },
    ingredients: { type: 'string' },
    directions: { type: 'string' },
    nutrition_label_candidates: { type: 'array', maxItems: 6, items: { type: 'string' } },
    research_warnings: { type: 'array', maxItems: 20, items: { type: 'string' } },
  },
} as const

export interface ProductResearchInput {
  product_name: string
  brand: string
  category: string | null
  presentation_hint: string
  reference_flavor: string
  reference_barcode: string
  known_flavors: string[]
  language: 'es-MX'
}

export interface ProductResearchResponse {
  content: GeminiResearchResult
  sources: ResearchSource[]
  usage: Record<string, unknown> | null
  inputHash: string
  model: string
  promptVersion: string
  requiresIdentityConfirmation: boolean
}

export interface ProductResearchOptions {
  searchDeeper?: boolean
  rejectedMatches?: string[]
}

const SYSTEM_PROMPT = `Eres un extractor de información comercial y nutrimental para fichas de una tienda de suplementos.

Tu única tarea es investigar el producto exacto recibido y devolver un único objeto JSON.
No converses. No escribas Markdown. No propongas código, pantallas, tablas de base de datos ni nuevas funcionalidades.
No cambies el producto, sabor o presentación solicitados.

REGLAS DE IDENTIDAD:
1. El producto debe coincidir en marca, línea, presentación y, cuando exista, código de barras.
2. Rechaza resultados de productos con nombres parecidos pero líneas distintas.
3. No uses información de otra presentación, fórmula, versión, tamaño o variante aunque la marca sea la misma.
4. El sabor no determina la identidad del producto y nunca debe impedir devolver la mejor coincidencia de marca y línea.
5. matched_name, matched_flavor, matched_presentation y matched_barcode describen lo que realmente confirman las fuentes. Si el código no aparece en una fuente, matched_barcode debe ser una cadena vacía.
6. Distingue el nombre canónico del fabricante de los sufijos internos del inventario. Un color, número de porciones, tamaño o apodo de empaque puede no formar parte del nombre oficial; compruébalo con las demás señales de identidad en vez de inventarlo dentro de matched_name.
7. Aunque la coincidencia sea incierta, devuelve siempre en matched_name, matched_flavor y matched_presentation la mejor opción encontrada para que el propietario pueda confirmarla manualmente.

PROCESO DE BÚSQUEDA:
1. Ejecuta primero las consultas sugeridas en la entrada, en el orden indicado.
2. Si existe código de barras, úsalo como ancla exacta y contrástalo con marca, sabor y presentación.
3. Contrasta como mínimo dos señales independientes además del nombre: sabor, presentación, código de barras, etiqueta o página oficial.
4. Si una consulta exacta no devuelve resultados, busca el nombre canónico sin separadores ni sufijos administrativos, conservando marca y línea.
5. No declares una línea distinta solamente para hacer coincidir todos los términos del inventario.

PRIORIDAD DE FUENTES:
1. Etiqueta física, PDF de etiqueta o página oficial del fabricante.
2. Distribuidor reconocido que muestre la etiqueta completa.
3. Comercio reconocido que identifique exactamente producto, presentación y sabor.
4. Marketplace solamente como respaldo y nunca para reemplazar una etiqueta oficial disponible.
5. Usa Google Search en cada investigación para contrastar los datos con páginas actuales.

REGLAS DE EXTRACCIÓN:
1. Usa español de México.
2. Conserva cantidades y unidades exactamente como aparecen en la fuente.
3. No calcules valores nutrimentales faltantes.
4. No mezcles datos de varios sabores para completar huecos. Si no encuentras el sabor solicitado, usa una sola variante documentada y registra claramente cuál fue en research_warnings.
5. Si un dato no se encuentra, devuelve cadena vacía o arreglo vacío según el esquema.
6. Registra cualquier conflicto o dato faltante en research_warnings.
7. Las características clave deben ser concretas, comerciales y respaldadas por las fuentes encontradas.
8. No agregues afirmaciones que no aparezcan en las fuentes.
9. short_description debe describir la línea completa del producto y no debe mencionar el sabor de referencia. El sabor se usa solamente para la tabla nutrimental, los ingredientes y la validación de identidad.
10. Devuelve solo las propiedades definidas. No añadas campos.

Devuelve exactamente este objeto JSON y ningún texto adicional:
{
  "identity_match": {
    "matched": true,
    "confidence": "high",
    "matched_name": "",
    "matched_flavor": "",
    "matched_presentation": "",
    "matched_barcode": ""
  },
  "short_description": "",
  "key_features": [],
  "presentation": "",
  "serving_size": "",
  "servings_per_container": "",
  "nutrition_facts": [
    { "name": "", "amount": "", "unit": "", "daily_value": null, "indent": 0 }
  ],
  "ingredients": "",
  "directions": "",
  "nutrition_label_candidates": [],
  "research_warnings": []
}`

const activeResearch = new Set<string>()

export function buildResearchInputHash(input: ProductResearchInput): string {
  return createHash('sha256')
    .update(JSON.stringify({ promptVersion: PRODUCT_RESEARCH_PROMPT_VERSION, input }))
    .digest('hex')
}

function extractSources(response: unknown): ResearchSource[] {
  const candidate = response as {
    candidates?: Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>
      }
    }>
  }
  const chunks = candidate.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  const seen = new Set<string>()
  const sources: ResearchSource[] = []

  for (const chunk of chunks) {
    const url = chunk.web?.uri?.trim()
    if (!url || seen.has(url)) continue
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:') continue
      seen.add(url)
      sources.push({ title: chunk.web?.title?.trim() || parsed.hostname, url })
    } catch {
      continue
    }
    if (sources.length >= 10) break
  }

  return sources
}

function serializeUsage(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function confirmResearchCandidate(
  value: unknown,
  input: ProductResearchInput,
): ProductResearchResponse {
  if (!isRecord(value)) throw new Error('La coincidencia pendiente no es válida.')
  const expectedInputHash = buildResearchInputHash(input)
  if (value.inputHash !== expectedInputHash || value.model !== PRODUCT_RESEARCH_MODEL ||
      value.promptVersion !== PRODUCT_RESEARCH_PROMPT_VERSION) {
    throw new Error('La coincidencia pendiente ya no corresponde al producto o variante seleccionados.')
  }

  return {
    content: parseGeminiResearch(value.content, input, {
      allow_unconfirmed_identity: true,
      allow_product_name_mismatch: true,
      allow_presentation_mismatch: true,
      allow_barcode_mismatch: true,
      record_manual_identity_confirmation: true,
    }),
    sources: normalizeResearchSources(value.sources),
    usage: serializeUsage(value.usage),
    inputHash: expectedInputHash,
    model: PRODUCT_RESEARCH_MODEL,
    promptVersion: PRODUCT_RESEARCH_PROMPT_VERSION,
    requiresIdentityConfirmation: false,
  }
}

export function selectTrustedLabelCandidate(candidates: string[], sources: ResearchSource[]): string | null {
  const sourceHosts = new Set<string>()
  for (const source of sources) {
    try { sourceHosts.add(new URL(source.url).hostname.replace(/^www\./, '')) } catch { /* ignore */ }
  }

  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate)
      const host = parsed.hostname.replace(/^www\./, '')
      if (parsed.protocol === 'https:' && sourceHosts.has(host)) return parsed.toString()
    } catch {
      continue
    }
  }
  return null
}

export async function researchProduct(
  input: ProductResearchInput,
  options: ProductResearchOptions = {},
): Promise<ProductResearchResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en el servidor.')

  const inputHash = buildResearchInputHash(input)
  if (activeResearch.has(inputHash)) throw new Error('Ya hay una investigación en curso para este producto.')

  activeResearch.add(inputHash)
  try {
    const ai = new GoogleGenAI({ apiKey })
    const rejectedMatches = [...new Set((options.rejectedMatches ?? [])
      .map(value => value.trim().slice(0, 200))
      .filter(Boolean))].slice(0, 5)
    const searchQueries = buildProductSearchQueries(input, { deep: options.searchDeeper === true })
    const deeperSearchInstructions = options.searchDeeper ? [
      'BÚSQUEDA PROFUNDA SOLICITADA POR EL PROPIETARIO:',
      'No te detengas en el primer resultado de Google. Ejecuta por separado todas las consultas sugeridas.',
      'Compara al menos cinco resultados cuando estén disponibles y revisa más de un dominio antes de elegir.',
      'Prioriza páginas donde aparezcan juntos la marca y la línea exactas del inventario.',
      rejectedMatches.length
        ? `No vuelvas a elegir estas coincidencias rechazadas: ${JSON.stringify(rejectedMatches)}.`
        : 'La coincidencia anterior fue rechazada; busca una alternativa distinta.',
    ] : []
    const response = await ai.models.generateContent({
      model: PRODUCT_RESEARCH_MODEL,
      contents: [{ role: 'user', parts: [{ text: [
        'Investiga este único producto:',
        JSON.stringify(input),
        'Consultas de Google sugeridas, de mayor a menor precisión:',
        ...searchQueries.map((query, index) => `${index + 1}. ${query}`),
        ...deeperSearchInstructions,
      ].join('\n') }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: options.searchDeeper ? ThinkingLevel.HIGH : ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseJsonSchema: RESEARCH_RESPONSE_SCHEMA,
        tools: [{ googleSearch: {} }],
      },
    })

    const finishReason = response.candidates?.[0]?.finishReason ?? ''
    const parsedResponse = parseResearchJsonText(response.text ?? '', finishReason)
    let requiresIdentityConfirmation = true
    let content: GeminiResearchResult
    try {
      content = parseGeminiResearch(parsedResponse, input)
    } catch (error) {
      if (!(error instanceof IdentityConfirmationRequiredError)) throw error
      content = parseGeminiResearch(parsedResponse, input, {
        allow_unconfirmed_identity: true,
        allow_product_name_mismatch: true,
        allow_presentation_mismatch: true,
        allow_barcode_mismatch: true,
      })
      requiresIdentityConfirmation = true
    }
    const sources = extractSources(response)
    return {
      content,
      sources,
      usage: serializeUsage(response.usageMetadata),
      inputHash,
      model: PRODUCT_RESEARCH_MODEL,
      promptVersion: PRODUCT_RESEARCH_PROMPT_VERSION,
      requiresIdentityConfirmation,
    }
  } finally {
    activeResearch.delete(inputHash)
  }
}
