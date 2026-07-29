import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import {
  buildSalesVoicePath,
  isSalesVoiceQueryCandidate,
  parseSalesVoiceQuery,
} from '@/lib/salesVoiceQuery'
import {
  buildVoiceCartPath,
  isVoiceCartCommandCandidate,
  isVoiceCheckoutCommand,
  parseVoiceCartCommand,
} from '@/lib/voiceCartCommand'
import {
  buildVoiceInventoryPath,
  isVoiceInventoryCommandCandidate,
  parseVoiceInventoryCommand,
} from '@/lib/voiceInventoryCommand'
import { buildVoicePhotoPath, parseVoicePhotoCommand } from '@/lib/voicePhotoCommand'

const geminiApiKey = process.env.GEMINI_API_KEY
const ai = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null
const MODEL = 'gemini-2.5-flash'

const SYSTEM_PROMPT = `Eres el intérprete de comandos de voz del POS de Chocholand, tienda de suplementos deportivos.
El usuario habla un comando en voz y tu tarea es mapearlo a una acción disponible en el sistema.

RESPONDE ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto adicional.
Formato cuando reconoces el comando:
{"action":"navigate","path":"/ruta?params","label":"Nombre legible de la acción"}

Formato cuando NO reconoces:
{"action":"unknown","message":"Descripción breve"}

━━━ ACCIONES DISPONIBLES ━━━

## SECCIÓN POS (/pos)

Filtrar por categoría:
  Trigger: "filtra por [categoría]", "muestra [categoría]", "ver [categoría]", etc.
  Path: /pos?filtro=NOMBRE_CATEGORIA_EN_MAYUSCULAS
  Ejemplos: "filtra por proteínas" → /pos?filtro=PROTEINAS
            "muestra creatinas" → /pos?filtro=CREATINAS
            "ver pre-entrenos" → /pos?filtro=PRE-ENTRENOS

Solo existencias (solo con stock > 0):
  Trigger: "solo existencias", "solo con stock", "quita sin stock", "oculta agotados", etc.
  Path: /pos?existencias=true
  Label: "Solo con existencias"

Agregar un producto al carrito (siempre requiere confirmación visual):
  Trigger: "agrégame [descripción]", "pon [descripción] en el carrito", "quiero agregar [descripción]", etc.
  Path: /pos?agregar=DESCRIPCION_DEL_PRODUCTO
  Label: "Buscar producto para agregar"
  NOTA: Conserva marca, nombre parcial, presentación y sabor que haya dicho el usuario.

Cobrar o procesar una venta por voz está DESHABILITADO. Nunca devuelvas una ruta de cobro.

## SECCIÓN INVENTARIO (/inventario)

Reporte de inventario:
  Trigger: "reporte de inventario", "ver reporte", "generar reporte", "abrir reporte", etc.
  Path: /inventario?modal=reporte
  Label: "Reporte de inventario"

Exportar a Excel:
  Trigger: "exportar inventario", "exportar a excel", "descargar excel", "exportar excel", etc.
  Path: /inventario?modal=exportar
  Label: "Exportar inventario a Excel"

Ajustar stock de un producto (siempre requiere selección y confirmación visual):
  Trigger: "agregar inventario [producto]", "agregar [producto] al inventario", "ajustar stock de [producto]", etc.
  Path: /inventario?ajustar=DESCRIPCION_DEL_PRODUCTO
  Label: "Buscar producto para ajustar stock"
  NOTA: Nunca incluyas cantidades de ajuste ni guardes cambios directamente desde la voz.

## SECCIÓN PRODUCTOS (/productos)

Nuevo producto:
  Trigger: "nuevo producto", "agregar producto", "crear producto", "registrar producto", etc.
  Path: /productos?nuevo=true
  Label: "Nuevo producto"

Abrir categorías:
  Trigger: "abrir categorías", "ver categorías", "gestionar categorías", "categorías", etc.
  Path: /productos?categorias=true
  Label: "Gestión de categorías"

Agregar nueva categoría con nombre:
  Trigger: "agregar categoría [nombre]", "nueva categoría [nombre]", "crear categoría [nombre]", etc.
  Path: /productos?categorias=true&nueva=NOMBRE_CATEGORIA
  Ejemplo: "agregar categoría aminoácidos" → /productos?categorias=true&nueva=aminoácidos
  Label: "Nueva categoría: [nombre]"

Editar producto (por nombre):
  Trigger: "editar [nombre de producto]", "busca [nombre] y edítalo", "abrir [nombre] para editar", etc.
  Path: /productos?editar=NOMBRE_PRODUCTO (URL-encoded)
  Ejemplo: "editar iso100 5lbs" → /productos?editar=iso100%205lbs
  Label: "Editar: [nombre]"

## SECCIÓN CLIENTES (/clientes)

Nuevo cliente:
  Trigger: "nuevo cliente", "agregar cliente", "registrar cliente", etc.
  Path: /clientes?nuevo=true
  Label: "Nuevo cliente"

Abonar a cliente (con nombre y monto):
  Trigger: "abonar a [nombre] [monto]", "registra abono de [nombre] [monto]", "[nombre] abona [monto]", etc.
  Path: /clientes?abono=NOMBRE&monto=NUMERO
  Ejemplo: "abonar a dorian $3000" → /clientes?abono=dorian&monto=3000
  Ejemplo: "dorian abona 500" → /clientes?abono=dorian&monto=500
  Label: "Abono a [nombre]: $[monto]"

Ver historial de cliente:
  Trigger: "ver historial de [nombre]", "historial de [nombre]", "movimientos de [nombre]", etc.
  Path: /clientes?historial=NOMBRE
  Ejemplo: "ver historial de dorian" → /clientes?historial=dorian
  Label: "Historial de [nombre]"

## SECCIÓN ENCARGOS (/encargos)

Nuevo encargo:
  Trigger: "nuevo encargo", "crear encargo", "agregar encargo", etc.
  Path: /encargos?nuevo=true
  Label: "Nuevo encargo"

## SECCIÓN TURNOS (/turnos)

Cerrar turno:
  Trigger: "cerrar turno", "finalizar turno", "terminar turno", "cierra caja", etc.
  Path: /turnos?accion=cerrar
  Label: "Cerrando turno"

## SECCIÓN REPORTES (/reportes)

Reporte de hoy:
  Trigger: "reporte de hoy", "ventas de hoy", "ver hoy", etc.
  Path: /reportes?periodo=today
  Label: "Reporte de hoy"

Reporte última semana:
  Trigger: "reporte de la semana", "últimos 7 días", "ventas de esta semana", etc.
  Path: /reportes?periodo=7days
  Label: "Reporte últimos 7 días"

Reporte este mes (mes en curso, desde el día 1):
  Trigger: "reporte de este mes", "mes actual", "ventas del mes", etc.
  Path: /reportes?periodo=month
  Label: "Reporte de este mes"

Reporte últimos 30 días:
  Trigger: "últimos 30 días", "últimas 4 semanas", "reporte mensual", etc.
  Path: /reportes?periodo=30days
  Label: "Últimos 30 días"

## SECCIÓN CONFIGURACIÓN (/configuracion)

Ir a asignación de fotos (IA):
  Trigger: "subir foto de producto", "asignar foto", "fotos de productos", "fotos IA", "ir a fotos", "agregar foto a producto", etc.
  Path: /configuracion?seccion=fotos-ia
  Label: "Asignación de fotos IA"

Buscar un producto para asignarle una foto:
  Trigger: "agregar imagen de producto [nombre]", "asignar foto a [nombre]", "subir foto de [nombre]", etc.
  Path: /configuracion?seccion=fotos-ia&producto=NOMBRE_PRODUCTO
  Ejemplo: "agregar imagen de producto iso100 5lbs" → /configuracion?seccion=fotos-ia&producto=iso100%205lbs
  Label: "Asignar foto: [nombre]"

Habilitar asistente (bot):
  Trigger: "habilita el bot", "activa el asistente", "enciende el bot", "habilitar asistente", etc.
  Path: /configuracion?bot_enabled=true
  Label: "Asistente IA habilitado"

Deshabilitar asistente (bot):
  Trigger: "deshabilita el bot", "desactiva el asistente", "apaga el bot", "deshabilitar asistente", etc.
  Path: /configuracion?bot_enabled=false
  Label: "Asistente IA deshabilitado"

Modo automático (IA responde):
  Trigger: "modo automático", "pon el bot en automático", "activa modo auto", "que responda la IA", etc.
  Path: /configuracion?bot_modo=auto
  Label: "Modo automático activado"

Modo manual (admin responde):
  Trigger: "modo manual", "pon el bot en manual", "que responda el admin", "tomar control del chat", etc.
  Path: /configuracion?bot_modo=manual
  Label: "Modo manual activado"

━━━ NAVEGACIÓN SIMPLE (sin acción adicional) ━━━
Si el usuario solo quiere ir a una sección sin acción específica:
- /pos, /inventario, /productos, /clientes, /reportes, /turnos, /encargos, /ventas, /configuracion

━━━ INSTRUCCIONES IMPORTANTES ━━━
- Sé flexible con variaciones naturales del lenguaje
- Para nombres de clientes y productos, usa lo que el usuario diga textualmente (URL-encoded si tiene espacios o caracteres especiales)
- Para categorías en el POS, convierte a mayúsculas
- Para montos, extrae solo el número (sin $ ni comas)
- Si el comando es ambiguo, elige la interpretación más probable según el contexto del POS`

export async function POST(req: NextRequest) {
  try {
    const { command, alternatives } = await req.json() as { command?: string; alternatives?: string[] }
    if (!command?.trim()) {
      return NextResponse.json({ action: 'unknown', message: 'Comando vacío' }, { status: 400 })
    }

    const extras = (alternatives ?? []).filter(a => a && a !== command)
    const candidates = [command, ...extras]

    // Resolver fotos primero evita confundir "agregar imagen" con agregar al carrito.
    const photoCommand = candidates
      .map(candidate => parseVoicePhotoCommand(candidate))
      .find(candidate => candidate !== null)

    if (photoCommand) {
      return NextResponse.json(
        {
          action: 'navigate',
          path: buildVoicePhotoPath(photoCommand),
          label: photoCommand.label,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (candidates.some(candidate => isVoiceCheckoutCommand(candidate))) {
      return NextResponse.json(
        {
          action: 'unknown',
          message: 'Por seguridad, la voz puede agregar productos pero no procesar el cobro.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // El contexto explícito de inventario tiene prioridad sobre "agregar" al carrito.
    const inventoryCommand = candidates
      .map(candidate => parseVoiceInventoryCommand(candidate))
      .find(candidate => candidate !== null)

    if (inventoryCommand) {
      return NextResponse.json(
        {
          action: 'navigate',
          path: buildVoiceInventoryPath(inventoryCommand),
          label: inventoryCommand.label,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (candidates.some(candidate => isVoiceInventoryCommandCandidate(candidate))) {
      return NextResponse.json(
        {
          action: 'unknown',
          message: 'Dime qué producto, presentación o sabor quieres ajustar en inventario.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const cartCommand = candidates
      .map(candidate => parseVoiceCartCommand(candidate))
      .find(candidate => candidate !== null)

    if (cartCommand) {
      return NextResponse.json(
        {
          action: 'navigate',
          path: buildVoiceCartPath(cartCommand),
          label: cartCommand.label,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (isVoiceCartCommandCandidate(command)) {
      return NextResponse.json(
        {
          action: 'unknown',
          message: 'Dime qué producto, presentación o sabor quieres agregar.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const salesQuery = candidates
      .map(candidate => parseSalesVoiceQuery(candidate))
      .find(candidate => candidate !== null)

    if (salesQuery) {
      return NextResponse.json(
        {
          action: 'navigate',
          path: buildSalesVoicePath(salesQuery),
          label: salesQuery.label,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (isSalesVoiceQueryCandidate(command)) {
      return NextResponse.json(
        {
          action: 'unknown',
          message: 'Puedo consultar ventas de hoy, de ayer o de una fecha específica.',
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const userText = extras.length > 0
      ? `Transcripción principal: "${command}"\nAlternativas posibles (en orden de confianza):\n${extras.map((a, i) => `${i + 2}. "${a}"`).join('\n')}\n\nElige la interpretación más probable como comando.`
      : command

    if (!ai) {
      return NextResponse.json(
        { action: 'unknown', message: 'No reconocí el comando. Intenta decirlo de otra forma.' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      config: { systemInstruction: SYSTEM_PROMPT },
    })

    const raw = result.text?.trim() ?? ''

    // Extraer JSON aunque Gemini agregue markdown
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ action: 'unknown', message: 'No entendí el comando' })
    }

    const parsed = JSON.parse(jsonMatch[0]) as { action: string; path?: string; label?: string; message?: string }

    if (parsed.action === 'navigate' && parsed.path) {
      const proposed = new URL(parsed.path, 'http://pos.local')

      if (proposed.pathname === '/pos' && proposed.searchParams.has('cobrar')) {
        return NextResponse.json(
          {
            action: 'unknown',
            message: 'Por seguridad, la voz puede agregar productos pero no procesar el cobro.',
          },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      }

      const proposedAdd = proposed.pathname === '/pos'
        ? proposed.searchParams.get('agregar')
        : null
      if (proposedAdd !== null) {
        const safeAdd = parseVoiceCartCommand(`agrega ${proposedAdd}`)
        if (!safeAdd || [...proposed.searchParams.keys()].some(key => key !== 'agregar')) {
          return NextResponse.json({ action: 'unknown', message: 'Búsqueda de producto inválida.' })
        }
        parsed.path = buildVoiceCartPath(safeAdd)
      }

      const proposedInventoryAdjust = proposed.pathname === '/inventario'
        ? proposed.searchParams.get('ajustar')
        : null
      if (proposedInventoryAdjust !== null) {
        const safeAdjust = parseVoiceInventoryCommand(`ajustar stock de ${proposedInventoryAdjust}`)
        if (!safeAdjust || [...proposed.searchParams.keys()].some(key => key !== 'ajustar')) {
          return NextResponse.json({ action: 'unknown', message: 'Búsqueda de inventario inválida.' })
        }
        parsed.path = buildVoiceInventoryPath(safeAdjust)
      }
    }

    return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[voice/command]', e)
    return NextResponse.json({ action: 'unknown', message: 'Error al procesar el comando' }, { status: 500 })
  }
}
