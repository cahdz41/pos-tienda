import 'server-only'

import { generateStructuredText } from '@/lib/aiTextClient'
import { parseAiJsonText, parseCaptionResponse, type ParsedCaption } from '@/lib/socialPostContent'

export const CAPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'hashtags', 'alt_text', 'hook', 'support_points'],
  properties: {
    caption: { type: 'string' },
    hashtags: { type: 'array', maxItems: 15, items: { type: 'string' } },
    alt_text: { type: 'string' },
    hook: { type: 'string' },
    support_points: {
      type: 'array', minItems: 6, maxItems: 8,
      items: { type: 'string' },
    },
  },
} as const

export interface CaptionProductInput {
  name: string
  brand: string | null
  short_description?: string
  sale_price?: number | null
}

export type CaptionIdeaInput =
  | { title: string; angle: string; hook: string; cta: string }
  | { free_text: string }

const SYSTEM_PROMPT = `Eres el community manager de una tienda de suplementos y gimnasio en México. Escribes el texto (caption) final de un post para Facebook e Instagram.

REGLAS DURAS:
1. El caption debe sentirse VIVO: energético, directo, con emojis relevantes (💪🔥🏋️‍♂️🧡, sin saturar), nunca genérico ni de relleno corporativo.
2. Vende, y hazlo con SUSTANCIA. No basta con el gancho y una línea de cierre: desarrolla 2-4 párrafos cortos (unas 100-180 palabras en total) que cubran, en este orden natural: (a) el gancho de apertura, (b) 2-3 razones concretas para comprar ESTE producto — ingredientes o características destacadas, sabor/experiencia si hay datos, qué lo distingue — usando el contexto de investigación si te lo dieron, (c) el cierre con el llamado a la acción. Evita relleno: cada línea debe aportar información o emoción real, no repetir la misma idea con otras palabras.
3. Los "hashtags" deben ser específicos del nicho (suplementos, gimnasio, la marca/producto) — nada de hashtags genéricos de relleno tipo #love #instagood #photooftheday.
4. NO incluyas ningún número de teléfono, WhatsApp ni enlace en el texto del caption — el sistema los agrega automáticamente al final del post. Si los inventas, tu respuesta se descarta.
5. Nunca inventes ingredientes, precios, promociones, existencias, cifras de reseñas ni resultados médicos que no te haya dado el usuario o el contexto de investigación. Si no tienes contexto específico, apóyate en el nombre/tema de marca y en beneficios genéricos y seguros de la categoría — nunca afirmes un ingrediente o dato concreto sin respaldo.
6. "alt_text" describe la imagen en una frase, en español, para accesibilidad — no es parte del post visible.
7. "hook" es la frase corta (máximo 8-10 palabras) que va ESTAMPADA sobre la imagen del post — debe ser grande, impactante y legible a distancia. Si la idea que se te dio ya trae un "Gancho visual" definido, copia ese mismo texto EXACTO en este campo (no inventes uno distinto, no lo repitas literal en el caption). Si el dueño escribió su propia idea libre sin gancho definido, redacta tú un gancho corto e impactante que capture esa idea.
8. "support_points" son SIEMPRE 6 a 8 frases MUY cortas (máximo 5-6 palabras cada una, pueden incluir un emoji al inicio, ej. "⚡ Energía inmediata") que resumen las características o beneficios más destacados de ESTE producto — se van a mostrar como tarjetas gráficas GRANDES a los lados de la imagen, no como parte del caption. Nunca entregues menos de 6, incluso si no tienes contexto de investigación específico: combina lo que sí tengas (ingredientes, cantidades, certificaciones, sabor) con beneficios genéricos y seguros de la categoría del producto para completar el total. Categorías genéricas seguras que puedes usar libremente sin inventar datos concretos, adaptadas al tipo de producto: energía/enfoque mental, rendimiento físico (fuerza, resistencia, bombeo muscular), sabor/experiencia al tomarlo, fácil de mezclar o disolver, tamaño/rendimiento del envase (cuántas porciones, sin cifra exacta si no la tienes), disponibilidad inmediata en tienda, calidad/confianza de marca reconocida. Ejemplo para un pre-entreno sin datos de investigación: "⚡ Energía inmediata", "🎯 Enfoque total", "💪 Más fuerza y resistencia", "🔥 Bombeo muscular intenso", "🥤 Fácil de mezclar", "✅ Disponible en tienda ahora". Nunca inventes un ingrediente, cifra o certificación específica que no te hayan confirmado — las categorías genéricas de arriba son la salida segura.
9. Español de México, cero groserías, cero clickbait falso.

Devuelve únicamente el objeto JSON pedido, sin texto adicional.`

function buildProductsBlock(products: CaptionProductInput[]): string {
  return products.map((product, index) => {
    const parts = [
      `${index + 1}. ${product.name}`,
      product.brand ? `Marca: ${product.brand}` : null,
      product.short_description ? `Descripción: ${product.short_description}` : null,
      typeof product.sale_price === 'number' ? `Precio: $${product.sale_price.toFixed(2)} MXN` : null,
    ].filter(Boolean)
    return parts.join(' — ')
  }).join('\n')
}

function buildResearchBlock(researchBrief?: string): string {
  if (!researchBrief?.trim()) return ''
  return `\n\nContexto de investigación web sobre estos productos (úsalo para dar sustancia real al caption; no afirmes nada que no esté aquí):\n${researchBrief.trim()}`
}

function buildIdeaBlock(idea: CaptionIdeaInput): string {
  if ('free_text' in idea) {
    return `El dueño de la tienda ya definió la idea del post; trabaja directamente sobre ella sin proponer un ángulo distinto:\n"${idea.free_text}"`
  }
  return [
    `Idea elegida: ${idea.title}`,
    `Por qué funciona: ${idea.angle}`,
    `Gancho visual (ya va estampado en la imagen, no lo repitas literal en el caption): ${idea.hook}`,
    `Llamado a la acción sugerido: ${idea.cta}`,
  ].join('\n')
}

export interface GenerateCaptionResult extends ParsedCaption {
  provider: 'openai' | 'deepseek'
  model: string
}

export async function generateCaption(
  products: CaptionProductInput[],
  idea: CaptionIdeaInput,
  researchBrief?: string,
): Promise<GenerateCaptionResult> {
  if (products.length === 0) throw new Error('Selecciona al menos un producto.')

  const userPrompt = [
    'Productos de este post:',
    buildProductsBlock(products),
    '',
    buildIdeaBlock(idea),
  ].join('\n') + buildResearchBlock(researchBrief)

  const result = await generateStructuredText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schemaName: 'social_post_caption',
    jsonSchema: CAPTION_SCHEMA,
    maxOutputTokens: 4000,
    parse: rawText => parseCaptionResponse(parseAiJsonText(rawText)),
  })

  return { ...result.data, provider: result.provider, model: result.model }
}
