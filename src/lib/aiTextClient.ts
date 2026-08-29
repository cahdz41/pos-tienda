import 'server-only'

// Orquestador de texto para redes sociales: OpenAI (gpt-5.6-luna) es el
// proveedor primario, DeepSeek (deepseek-v4-flash) es el respaldo automático
// cuando OpenAI no está disponible. Nada de Claude ni ChatGPT vía CLI — solo
// estas dos APIs REST, sin SDK de terceros.
//
// Este cliente es intencionalmente genérico (no conoce nada de "ideas" ni
// "caption") para poder reutilizarse más adelante si se migra la
// investigación de fichas de producto (hoy en Gemini, ver productResearch.ts)
// a OpenAI/DeepSeek.

export const OPENAI_TEXT_MODEL = 'gpt-5.6-luna'
export const DEEPSEEK_TEXT_MODEL = 'deepseek-v4-flash'

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions'
const DEEPSEEK_CHAT_URL = 'https://api.deepseek.com/chat/completions'

export interface StructuredTextRequest<T> {
  systemPrompt: string
  userPrompt: string
  schemaName: string
  jsonSchema: Record<string, unknown>
  maxOutputTokens?: number
  // Parsea/valida el texto crudo del modelo. Si lanza, se trata como un
  // intento fallido igual que un error de red — dispara el respaldo al otro
  // proveedor en vez de romper toda la generación. Esto es importante porque
  // gpt-5.6-luna es un modelo con razonamiento interno: ese razonamiento
  // consume parte del presupuesto de max_completion_tokens antes de escribir
  // la respuesta visible, así que a veces el JSON sale cortado a pesar de que
  // la llamada HTTP fue exitosa (200). Sin este mecanismo, esos cortes
  // aleatorios obligaban al usuario a reintentar manualmente varias veces.
  parse: (rawText: string) => T
}

export interface StructuredTextResult<T> {
  data: T
  provider: 'openai' | 'deepseek'
  model: string
}

interface RawTextResult {
  rawText: string
  provider: 'openai' | 'deepseek'
  model: string
}

async function callOpenAI<T>(request: StructuredTextRequest<T>, apiKey: string): Promise<RawTextResult> {
  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      reasoning_effort: 'low',
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      max_completion_tokens: request.maxOutputTokens ?? 4000,
      response_format: {
        type: 'json_schema',
        json_schema: { name: request.schemaName, schema: request.jsonSchema, strict: true },
      },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`OpenAI respondió ${response.status}: ${detail.slice(0, 300)}`)
  }

  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
  }
  const choice = body.choices?.[0]
  const rawText = choice?.message?.content ?? ''
  if (!rawText) {
    throw new Error(choice?.finish_reason === 'length'
      ? 'OpenAI cortó la respuesta antes de terminar (se quedó sin espacio de salida).'
      : 'OpenAI no devolvió contenido.')
  }
  return { rawText, provider: 'openai', model: OPENAI_TEXT_MODEL }
}

async function callDeepSeek<T>(request: StructuredTextRequest<T>, apiKey: string): Promise<RawTextResult> {
  const response = await fetch(DEEPSEEK_CHAT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: DEEPSEEK_TEXT_MODEL,
      messages: [
        {
          role: 'system',
          content: `${request.systemPrompt}\n\nDevuelve únicamente un objeto JSON válido que cumpla exactamente este esquema, sin markdown ni texto adicional:\n${JSON.stringify(request.jsonSchema)}`,
        },
        { role: 'user', content: request.userPrompt },
      ],
      max_tokens: request.maxOutputTokens ?? 4000,
      response_format: { type: 'json_object' },
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`DeepSeek respondió ${response.status}: ${detail.slice(0, 300)}`)
  }

  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const rawText = body.choices?.[0]?.message?.content ?? ''
  if (!rawText) throw new Error('DeepSeek no devolvió contenido.')
  return { rawText, provider: 'deepseek', model: DEEPSEEK_TEXT_MODEL }
}

export async function generateStructuredText<T>(request: StructuredTextRequest<T>): Promise<StructuredTextResult<T>> {
  const openaiKey = process.env.OPENAI_API_KEY
  const deepseekKey = process.env.DEEPSEEK_API_KEY

  const attempts: Array<() => Promise<RawTextResult>> = []
  if (openaiKey) attempts.push(() => callOpenAI(request, openaiKey))
  if (deepseekKey) attempts.push(() => callDeepSeek(request, deepseekKey))
  if (attempts.length === 0) throw new Error('Falta configurar OPENAI_API_KEY o DEEPSEEK_API_KEY en el servidor.')

  // Se intenta cada proveedor en orden (OpenAI primero). Cualquier falla —de
  // red, HTTP, o de parseo/validación del JSON devuelto— pasa al siguiente
  // proveedor en vez de fallar de inmediato. Solo se lanza un error visible
  // al usuario si NINGÚN proveedor disponible produjo una respuesta válida.
  for (let index = 0; index < attempts.length; index += 1) {
    try {
      const raw = await attempts[index]()
      const data = request.parse(raw.rawText)
      return { data, provider: raw.provider, model: raw.model }
    } catch (error) {
      if (index === attempts.length - 1) {
        throw new Error('No se pudo generar contenido con IA en este momento. Intenta de nuevo en unos minutos.')
      }
      // Sigue con el siguiente proveedor disponible.
      void error
    }
  }

  throw new Error('No se pudo generar contenido con IA en este momento. Intenta de nuevo en unos minutos.')
}
