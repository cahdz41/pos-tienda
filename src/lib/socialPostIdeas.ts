import 'server-only'

import { generateStructuredText } from '@/lib/aiTextClient'
import { parseAiJsonText, parseIdeaOptionsResponse, type SocialPostIdeaOption } from '@/lib/socialPostContent'

export const IDEA_OPTIONS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['options'],
  properties: {
    options: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'angle', 'hook', 'cta'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          angle: { type: 'string' },
          hook: { type: 'string' },
          cta: { type: 'string' },
        },
      },
    },
  },
} as const

export interface IdeaProductInput {
  name: string
  brand: string | null
  category: string | null
  short_description?: string
}

const SYSTEM_PROMPT = `Eres un redactor publicitario (copywriter) especializado en ventas de suplementos deportivos por Facebook e Instagram para una tienda de gimnasio en México.

Tu única tarea es proponer 5 IDEAS DE VENTA distintas entre sí para un post con los productos indicados. No estás escribiendo el post final, solo el concepto y el gancho.

REGLAS DURAS:
1. Cada idea debe ser un GANCHO DE VENTA real, no una descripción genérica del producto. Piensa en lo que haría a alguien detenerse a media hora de scroll: dolor/beneficio concreto, urgencia, comparación, resultado físico, rutina, antes/después, oferta, mito vs realidad, reto, etc.
2. PROHIBIDO escribir un gancho genérico que serviría igual para cualquier otro producto de la misma categoría. Cada idea debe anclarse en ALGO ESPECÍFICO de ESTE producto exacto: su nombre/tema de marca, un ingrediente o dato que sí tengas en el contexto de investigación, su sabor, o alguna opinión real de compradores que se te haya dado. Si tienes contexto de investigación, úsalo como fuente principal de especificidad.
3. Las 5 ideas deben tener ángulos genuinamente distintos entre sí, no 5 variaciones del mismo gancho con sinónimos.
4. "hook" es la frase corta (máximo 8-10 palabras) que va a aparecer ESTAMPADA sobre la imagen del post. Debe ser corta, impactante y legible a distancia — nada de frases largas ni tecnicismos.
5. "cta" es el llamado a la acción para el texto del post (ej. "Pídelo hoy y arranca tu transformación").
6. "title" es un nombre corto interno para identificar la idea en una lista; no aparece en el post.
7. "angle" explica en una frase por qué ese gancho va a vender, mencionando qué dato específico del producto usaste.
8. Nunca inventes ingredientes, datos nutricionales, precios, cifras de reseñas ni resultados médicos que no aparezcan en la información del producto o el contexto de investigación que se te dio. Si no tienes contexto específico suficiente, apóyate en el nombre/tema de marca del producto y en verdades genéricas y seguras de su categoría (ej. "un pre-entreno da energía y enfoque"), pero jamás afirmes un ingrediente o dato concreto que no te hayan confirmado.
9. Español de México, tono directo y motivador, cero relleno corporativo.

Devuelve exactamente 5 opciones en el campo "options", sin texto adicional.`

function buildProductsBlock(products: IdeaProductInput[]): string {
  return products.map((product, index) => {
    const parts = [
      `${index + 1}. ${product.name}`,
      product.brand ? `Marca: ${product.brand}` : null,
      product.category ? `Categoría: ${product.category}` : null,
      product.short_description ? `Descripción: ${product.short_description}` : null,
    ].filter(Boolean)
    return parts.join(' — ')
  }).join('\n')
}

function buildResearchBlock(researchBrief?: string): string {
  if (!researchBrief?.trim()) return ''
  return `\n\nContexto de investigación web sobre estos productos (úsalo como fuente principal de especificidad; no lo repitas literal, y no afirmes nada que no esté aquí):\n${researchBrief.trim()}`
}

export interface GenerateIdeaOptionsResult {
  options: SocialPostIdeaOption[]
  provider: 'openai' | 'deepseek'
  model: string
}

const activeGeneration = new Set<string>()

export async function generateIdeaOptions(products: IdeaProductInput[], researchBrief?: string): Promise<GenerateIdeaOptionsResult> {
  if (products.length === 0) throw new Error('Selecciona al menos un producto.')
  const key = products.map(product => product.name).sort().join('|')
  if (activeGeneration.has(key)) throw new Error('Ya hay una generación de ideas en curso para estos productos.')

  activeGeneration.add(key)
  try {
    const userPrompt = [
      'Productos seleccionados para este post:',
      buildProductsBlock(products),
    ].join('\n\n') + buildResearchBlock(researchBrief)

    const result = await generateStructuredText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      schemaName: 'idea_options',
      jsonSchema: IDEA_OPTIONS_SCHEMA,
      maxOutputTokens: 4000,
      parse: rawText => parseIdeaOptionsResponse(parseAiJsonText(rawText)),
    })

    return { options: result.data, provider: result.provider, model: result.model }
  } finally {
    activeGeneration.delete(key)
  }
}
