import 'server-only'

// Investigación web real para que las ideas y el caption hablen del producto
// EXACTO seleccionado (ingredientes, experiencia de sabor, opiniones), no de
// la categoría en general. OpenAI usa su herramienta de búsqueda web nativa
// (Responses API); si no está disponible, se cae a Serper.dev para darle
// contexto de búsqueda real también al respaldo de DeepSeek (que no tiene
// búsqueda propia). Si ninguna está disponible, se sigue generando contenido
// sin investigación en vez de bloquear el flujo — es una mejora de calidad,
// no un requisito duro.

export interface ResearchBrief {
  text: string
  provider: 'openai' | 'serper' | 'none'
}

export interface ResearchProductInput {
  name: string
  brand: string | null
  category: string | null
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_RESEARCH_MODEL = 'gpt-5.6-luna'
const SERPER_SEARCH_URL = 'https://google.serper.dev/search'

function formatProductList(products: ResearchProductInput[]): string {
  return products.map(product =>
    `- ${[product.brand, product.name].filter(Boolean).join(' ')}${product.category ? ` (${product.category})` : ''}`,
  ).join('\n')
}

function buildInstructions(products: ResearchProductInput[]): string {
  return `Eres un investigador de productos de suplementos deportivos. Busca información real y actual en internet sobre EXACTAMENTE el/los producto(s) listados abajo — no una categoría genérica ni un producto parecido.

Reporta en español de México, en viñetas breves, SOLO información que encuentres respaldada por fuentes reales:
- Ingredientes o compuestos destacados que mencionen las fuentes.
- Sabor / experiencia de uso, si hay reseñas reales de compradores.
- Qué hace diferente a este producto frente a otros similares, según las fuentes.
- Opiniones o quejas recurrentes de compradores reales, si las encuentras.

Si no encuentras información confiable sobre alguno de estos productos exactos, dilo explícitamente ("no se encontró información confiable sobre X") en vez de inventar. No agregues afirmaciones médicas ni datos que no puedas respaldar con lo que encontraste.

Productos a investigar:
${formatProductList(products)}`
}

async function researchWithOpenAI(products: ResearchProductInput[], apiKey: string): Promise<ResearchBrief> {
  let response: Response
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_RESEARCH_MODEL,
        tools: [{ type: 'web_search' }],
        input: buildInstructions(products),
      }),
    })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Error de red al investigar con OpenAI.')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI respondió ${response.status} al investigar: ${detail.slice(0, 300)}`)
  }

  const body = await response.json() as { output_text?: string }
  const text = body.output_text?.trim()
  if (!text) throw new Error('OpenAI no devolvió resultados de investigación.')
  return { text, provider: 'openai' }
}

interface SerperOrganicResult {
  title?: string
  snippet?: string
  link?: string
}

async function researchWithSerper(products: ResearchProductInput[], apiKey: string): Promise<ResearchBrief> {
  const sections: string[] = []

  for (const product of products) {
    const query = [product.brand, product.name, 'ingredientes reseña opiniones'].filter(Boolean).join(' ')
    let response: Response
    try {
      response = await fetch(SERPER_SEARCH_URL, {
        method: 'POST',
        headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5, gl: 'mx', hl: 'es' }),
      })
    } catch {
      continue // un producto sin resultados no debe tumbar toda la investigación
    }
    if (!response.ok) continue

    const body = await response.json().catch(() => null) as { organic?: SerperOrganicResult[] } | null
    const organic = body?.organic ?? []
    if (organic.length === 0) continue

    const snippetLines = organic.slice(0, 5)
      .map(item => `  - ${item.title ?? ''}: ${item.snippet ?? ''} (${item.link ?? ''})`)
      .join('\n')
    sections.push(`${[product.brand, product.name].filter(Boolean).join(' ')}:\n${snippetLines}`)
  }

  if (sections.length === 0) return { text: '', provider: 'none' }
  return {
    text: `Resultados de búsqueda web (resúmenes de Google, verifica que apliquen antes de usarlos):\n${sections.join('\n\n')}`,
    provider: 'serper',
  }
}

export async function researchProducts(products: ResearchProductInput[]): Promise<ResearchBrief> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) {
    try {
      return await researchWithOpenAI(products, openaiKey)
    } catch {
      // Sigue al respaldo de Serper en vez de tirar todo el flujo.
    }
  }

  const serperKey = process.env.SERPER_API_KEY
  if (serperKey) {
    try {
      return await researchWithSerper(products, serperKey)
    } catch {
      return { text: '', provider: 'none' }
    }
  }

  return { text: '', provider: 'none' }
}
