import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = 'gemini-2.5-flash'

const SYSTEM_PROMPT = `Eres el intérprete de comandos de voz del POS de Chocholand, tienda de suplementos deportivos.
El usuario habla un comando en voz y tu tarea es mapearlo a una acción disponible en el sistema.

RUTAS DISPONIBLES:
- /pos → POS (punto de venta, caja, cobrar)
- /inventario → Inventario (stock, existencias)
- /productos → Catálogo de productos
- /productos?nuevo=true → Crear nuevo producto (agregar, registrar producto nuevo)
- /clientes → Clientes
- /reportes → Reportes y estadísticas (ventas del día, análisis)
- /turnos → Gestión de turnos (abrir turno, cerrar turno)
- /encargos → Encargos y pedidos
- /ventas → Historial de ventas
- /configuracion → Configuración y ajustes

RESPONDE ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional.
Formato cuando reconoces el comando:
{"action":"navigate","path":"/ruta","label":"Nombre de la sección"}

Formato cuando NO reconoces el comando:
{"action":"unknown","message":"Descripción breve de qué no entendiste"}

Sé flexible con variaciones: "quiero ver reportes", "abre los clientes", "ir al inventario", etc.`

export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json() as { command?: string }
    if (!command?.trim()) {
      return NextResponse.json({ action: 'unknown', message: 'Comando vacío' }, { status: 400 })
    }

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: command }] }],
      config: { systemInstruction: SYSTEM_PROMPT },
    })

    const raw = result.text?.trim() ?? ''

    // Extraer JSON aunque Gemini agregue markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ action: 'unknown', message: 'No entendí el comando' })
    }

    const parsed = JSON.parse(jsonMatch[0]) as { action: string; path?: string; label?: string; message?: string }
    return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[voice/command]', e)
    return NextResponse.json({ action: 'unknown', message: 'Error al procesar el comando' }, { status: 500 })
  }
}
