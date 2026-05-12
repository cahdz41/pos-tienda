import { GoogleGenAI } from '@google/genai'
import { createAdminClient } from './supabase-admin'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

const MODEL = 'gemini-2.5-flash'

// ── Caché de inventario (5 min) ───────────────────────────────────────────────
let _inventoryCache: { text: string; at: number } | null = null
const CACHE_TTL = 5 * 60 * 1000

async function getInventoryContext(): Promise<string> {
  if (_inventoryCache && Date.now() - _inventoryCache.at < CACHE_TTL) {
    return _inventoryCache.text
  }

  const supabase = createAdminClient()

  const [{ data: variants }, { data: products }] = await Promise.all([
    supabase
      .from('product_variants')
      .select('product_id, flavor, sale_price, stock')
      .gt('stock', 0)
      .order('sale_price'),
    supabase
      .from('products')
      .select('id, name, category'),
  ])

  if (!products || !variants) return 'INVENTARIO: No disponible.'

  type Product = { id: string; name: string; category: string | null }
  type Variant = { product_id: string; flavor: string | null; sale_price: number; stock: number }

  const productMap = Object.fromEntries((products as Product[]).map((p) => [p.id, p]))

  const grouped: Record<string, { name: string; category: string | null; items: string[] }> = {}

  for (const v of variants as Variant[]) {
    const p = productMap[v.product_id]
    if (!p) continue
    if (!grouped[v.product_id]) {
      grouped[v.product_id] = { name: p.name, category: p.category, items: [] }
    }
    const label = v.flavor ? `${v.flavor} $${v.sale_price}` : `$${v.sale_price}`
    grouped[v.product_id].items.push(label)
  }

  const lines = Object.values(grouped).map((g) => {
    const cat = g.category ? ` [${g.category}]` : ''
    return `• ${g.name}${cat}: ${g.items.join(' | ')}`
  })

  const text = lines.length
    ? `INVENTARIO CON STOCK:\n${lines.join('\n')}`
    : 'INVENTARIO: Sin productos disponibles actualmente.'

  _inventoryCache = { text, at: Date.now() }
  return text
}

// ── System prompt base ────────────────────────────────────────────────────────
const BASE_PROMPT = `Eres el asistente virtual de Chocholand, tienda de suplementos deportivos. Tu nombre es "Asistente Chocholand".

REGLAS — nunca las incumplas:
1. Solo respondes sobre: suplementos, proteínas, creatinas, vitaminas, pre-workouts, aminoácidos, nutrición deportiva, fitness y salud.
2. Otros temas: declina amablemente. "Solo puedo ayudarte con suplementos y fitness 💪".
3. Del inventario muestra ÚNICAMENTE: nombre, sabores y precio de venta. NUNCA precio de costo ni mayoreo.
4. No inventes productos. Usa solo lo que aparece en el inventario que se te proporciona.
5. Respuestas concisas: máximo 3 párrafos. Emojis con moderación.
6. Responde en español por defecto. Si el usuario escribe en otro idioma, adáptate.

CÓMO USAR EL INVENTARIO:
- Al inicio del contexto recibes el inventario actualizado con stock disponible.
- Busca de forma inteligente: "creatina Dragon Pharma" puede coincidir con un producto que en el inventario diga "Dragon Pharma Creatine 1kg" o "Creatina DP".
- Si no encuentras algo exacto, ofrece la alternativa más cercana que SÍ tengas.
- Muestra sabores y precios de forma clara y ordenada.`

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── Función principal ─────────────────────────────────────────────────────────
export async function getChatResponse(history: ChatMessage[]): Promise<string> {
  const inventory = await getInventoryContext()

  const systemInstruction = `${BASE_PROMPT}\n\n${inventory}`

  // Limita el historial a los últimos 10 mensajes para controlar tokens
  const recentHistory = history.slice(-10)

  const contents = recentHistory.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const result = await ai.models.generateContent({
    model: MODEL,
    contents,
    config: { systemInstruction },
  })

  return result.text?.trim() ?? 'Lo siento, no pude procesar tu pregunta en este momento.'
}
