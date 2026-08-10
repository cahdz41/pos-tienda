import 'server-only'

import { createHash } from 'node:crypto'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import {
  parseGeminiResearch,
  parseResearchJsonText,
  type GeminiResearchResult,
  type ResearchSource,
} from '@/lib/storeProductContent'

export const PRODUCT_RESEARCH_MODEL = 'gemini-3.5-flash'
export const PRODUCT_RESEARCH_PROMPT_VERSION = 'catalog-general-v3'

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
}

const SYSTEM_PROMPT = `Eres un extractor de información comercial y nutrimental para fichas de una tienda de suplementos.

Tu única tarea es investigar el producto exacto recibido y devolver un único objeto JSON.
No converses. No escribas Markdown. No propongas código, pantallas, tablas de base de datos ni nuevas funcionalidades.
No cambies el producto, sabor o presentación solicitados.

REGLAS DE IDENTIDAD:
1. El producto debe coincidir en marca, línea, presentación y, cuando exista, código de barras.
2. Rechaza resultados de productos con nombres parecidos pero líneas distintas.
3. No uses información de otra presentación, fórmula, versión, tamaño o variante aunque la marca sea la misma.
4. La tabla, ingredientes y porciones deben corresponder al sabor de referencia indicado.
5. matched_name, matched_flavor, matched_presentation y matched_barcode describen lo que realmente confirman las fuentes. Si el código no aparece en una fuente, matched_barcode debe ser una cadena vacía.

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
4. No mezcles datos de varios sabores para completar huecos.
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

export async function researchProduct(input: ProductResearchInput): Promise<ProductResearchResponse> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('Falta configurar GEMINI_API_KEY en el servidor.')

  const inputHash = buildResearchInputHash(input)
  if (activeResearch.has(inputHash)) throw new Error('Ya hay una investigación en curso para este producto.')

  activeResearch.add(inputHash)
  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: PRODUCT_RESEARCH_MODEL,
      contents: [{ role: 'user', parts: [{ text: `Investiga este único producto:\n${JSON.stringify(input)}` }] }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseJsonSchema: RESEARCH_RESPONSE_SCHEMA,
        tools: [{ googleSearch: {} }],
      },
    })

    const finishReason = response.candidates?.[0]?.finishReason ?? ''
    const content = parseGeminiResearch(
      parseResearchJsonText(response.text ?? '', finishReason),
      input,
    )
    const sources = extractSources(response)
    return {
      content,
      sources,
      usage: serializeUsage(response.usageMetadata),
      inputHash,
      model: PRODUCT_RESEARCH_MODEL,
      promptVersion: PRODUCT_RESEARCH_PROMPT_VERSION,
    }
  } finally {
    activeResearch.delete(inputHash)
  }
}
