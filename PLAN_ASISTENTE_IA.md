# Plan de Implementación — Asistente IA Chocholand

> Fecha de elaboración: 2026-05-11
> Estado: Pendiente de implementación

---

## Resumen ejecutivo

Implementar un widget de chat con IA directamente en la tienda web de Chocholand
(`/tienda`), alimentado por Gemini 2.0 Flash, con acceso al inventario (solo
precios públicos), búsqueda web restringida a temas de suplementos/fitness, y
notificaciones al administrador vía Telegram. El código existente no se modifica
salvo dos adiciones mínimas y controladas.

---

## Decisiones de diseño tomadas

| Pregunta | Decisión |
|---|---|
| Canal del chat | Web widget en la página (no WhatsApp directo) |
| WhatsApp | No se usa — el número de la tienda queda libre |
| Backend de notificaciones | Telegram Bot (API oficial, gratuita, sin riesgo de baneo) |
| Modelo de IA | Gemini 2.0 Flash (barato, con Google Search grounding integrado) |
| Búsqueda en internet | Google Search grounding de Gemini (no requiere API extra) |
| Despliegue | VPS Hostinger — soporta procesos persistentes sin limitación serverless |
| Rate limit | Por sesión (10 msg) + por usuario/día (3 sesiones) + guard global de API |
| Acceso | Solo usuarios registrados en la tienda pueden chatear |
| Modo manual | Admin responde desde Telegram en celular O desde panel en el POS |
| Delay modo manual | Polling cada 3 segundos (aceptable) |
| Idioma | Español por defecto, se adapta si detecta otro idioma |
| Estilo UI | Floating bubble glassmorphism — glow rojo, dark glass, slide-up animation |

---

## Arquitectura general

```
[Cliente en tienda web]
       │
       │ fetch (HTTPS)
       ▼
[Next.js API Routes — VPS Hostinger]
       │
       ├──► Supabase
       │     ├── chat_settings   (configuración del bot)
       │     ├── chat_sessions   (sesiones y rate limiting)
       │     ├── chat_messages   (historial de conversaciones)
       │     └── tablas existentes (inventario — solo lectura)
       │
       ├──► Gemini 2.0 Flash API
       │     ├── Google Search grounding (suplementos/fitness)
       │     └── Tool: search_inventory() — consulta Supabase
       │
       └──► Telegram Bot API
             ├── Notifica al admin cuando llega mensaje nuevo
             ├── Admin responde desde celular vía Telegram
             └── Webhook → Next.js → Supabase → cliente via polling
```

---

## Archivos nuevos (no modifican código existente)

```
src/
├── lib/
│   ├── gemini.ts               ← Cliente Gemini + system prompt + tool de inventario
│   └── telegram.ts             ← Cliente Telegram Bot (envío de notificaciones)
│
├── components/tienda/
│   └── ChatWidget.tsx          ← Widget completo de chat (UI + lógica de cliente)
│
└── app/api/
    ├── chat/
    │   ├── session/
    │   │   └── route.ts        ← POST: crear o recuperar sesión del usuario logueado
    │   ├── message/
    │   │   └── route.ts        ← POST: enviar mensaje, obtener respuesta de IA o admin
    │   ├── messages/
    │   │   └── route.ts        ← GET: polling del cliente cada 3s para ver respuestas
    │   ├── admin-reply/
    │   │   └── route.ts        ← POST: el admin responde desde el panel del POS
    │   └── conversations/
    │       └── route.ts        ← GET: lista de conversaciones activas para el POS
    │
    └── telegram/
        └── webhook/
            └── route.ts        ← POST: recibe respuesta del admin enviada desde Telegram
```

---

## Archivos existentes modificados (cambios mínimos)

| Archivo | Cambio |
|---|---|
| `src/app/tienda/layout.tsx` | Agregar `<ChatWidget />` al final del JSX, dentro del `StoreAuthProvider` |
| `src/app/(app)/configuracion/page.tsx` | Agregar sección "Asistente IA" con dos toggles y enlace a conversaciones |

---

## Base de datos — Tablas nuevas en Supabase

### `chat_settings`

Almacena configuración global del bot. Usa patrón key/value.

```sql
CREATE TABLE chat_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Valores iniciales
INSERT INTO chat_settings (key, value) VALUES
  ('bot_enabled', 'true'),
  ('bot_mode',    'auto'),   -- 'auto' | 'manual'
  ('daily_api_calls', '0'),
  ('daily_api_calls_date', CURRENT_DATE::TEXT),
  ('daily_api_limit', '500');
```

### `chat_sessions`

Una sesión por conversación. Un usuario puede tener múltiples sesiones
(máximo 3 por día para evitar bypass del rate limit).

```sql
CREATE TABLE chat_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_count     INT         NOT NULL DEFAULT 0,
  is_blocked        BOOLEAN     NOT NULL DEFAULT FALSE,
  block_reason      TEXT,       -- 'limit_reached' | 'spam_detected' | 'admin'
  detected_language TEXT        NOT NULL DEFAULT 'es',
  telegram_thread   BIGINT,     -- ID del hilo en Telegram si aplica
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas por usuario y fecha
CREATE INDEX idx_chat_sessions_user_date
  ON chat_sessions(user_id, created_at);
```

### `chat_messages`

Todos los mensajes de todas las conversaciones.

```sql
CREATE TABLE chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'admin')),
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_read     BOOLEAN     NOT NULL DEFAULT FALSE
);

-- Índice para polling eficiente
CREATE INDEX idx_chat_messages_session_time
  ON chat_messages(session_id, created_at);
```

### Row Level Security (RLS)

```sql
-- Los usuarios solo pueden ver sus propias sesiones y mensajes
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_sessions" ON chat_sessions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_own_messages" ON chat_messages
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    )
  );
```

---

## Reglas del asistente (System Prompt de Gemini)

```
Eres el asistente virtual de Chocholand, una tienda especializada en
suplementos deportivos y nutrición.

REGLAS ABSOLUTAS — NUNCA las incumplas:
1. Solo respondes preguntas sobre: suplementos, proteínas, creatinas,
   vitaminas, nutrición deportiva, fitness, entrenamiento y salud.
2. Si te preguntan sobre cualquier otro tema, declina amablemente y
   redirige al tema de suplementos.
3. Cuando consultes el inventario, NUNCA menciones precios de costo
   ni precios de mayoreo. Solo puedes compartir el precio de venta
   al público (sale_price).
4. No inventes productos que no estén en el inventario.
5. Responde en español por defecto. Si el usuario escribe en otro
   idioma, adáptate a ese idioma automáticamente.
6. Sé amigable, profesional y conciso. Máximo 3 párrafos por respuesta.

CAPACIDADES:
- Puedes buscar productos disponibles en el inventario usando la
  función search_inventory().
- Puedes buscar información en internet sobre suplementos y fitness
  usando Google Search, pero SOLO para temas de salud/deporte.

CUANDO EL USUARIO PREGUNTE POR PRODUCTOS:
- Indica nombre, sabores disponibles y precio público.
- Si no hay stock, dilo claramente.
- Sugiere alternativas si no encuentras lo que piden.
```

---

## Tool: `search_inventory()`

Función que Gemini puede llamar para buscar en el inventario.
Filtra explícitamente los campos sensibles.

```typescript
// src/lib/gemini.ts (fragmento)
async function search_inventory({ query }: { query: string }) {
  const supabase = createClient()

  const { data } = await supabase
    .from('product_variants')
    .select(`
      flavor,
      stock,
      sale_price,
      product:products (
        name,
        category
      )
    `)
    // NOTA: cost_price y wholesale_price quedan excluidos del SELECT
    .ilike('products.name', `%${query}%`)
    .gt('stock', 0)
    .limit(10)

  return data ?? []
}
```

---

## Rate Limiting

### Límites por nivel

| Nivel | Límite | Acción al superarlo |
|---|---|---|
| Mensajes por sesión | 10 mensajes | Muestra mensaje de límite, bloquea sesión |
| Sesiones por usuario por día | 3 sesiones | No permite crear nueva sesión hasta el día siguiente |
| Llamadas API globales por día | Configurable (default: 500) | Bot se pausa automáticamente, admin recibe alerta en Telegram |

### Lógica de bloqueo por spam

Si en una sesión el usuario envía más de 5 mensajes en menos de 60 segundos,
se marca la sesión como bloqueada con `block_reason = 'spam_detected'` y se
notifica al admin vía Telegram.

### Mensaje al usuario cuando se alcanza el límite

```
Has alcanzado el límite de respuestas del asistente para esta sesión.
Si tienes más dudas, puedes contactarnos directamente o iniciar
una nueva conversación más tarde.
```

---

## Flujo de mensajes — Modo Automático (Bot)

```
1. Usuario escribe mensaje en el widget
2. POST /api/chat/message
   a. Verifica que el usuario esté autenticado
   b. Verifica que el bot esté habilitado (chat_settings)
   c. Verifica que la sesión no esté bloqueada
   d. Verifica rate limit (10 msg/sesión, 3 sesiones/día)
   e. Verifica guard global de API calls
3. Llamada a Gemini 2.0 Flash con:
   - System prompt
   - Historial de la sesión (últimos 10 mensajes)
   - Tool search_inventory disponible
   - Google Search grounding activo
4. Guarda respuesta en chat_messages (role: 'assistant')
5. Incrementa contadores (message_count, daily_api_calls)
6. Envía notificación a Telegram del admin (opcional en modo auto)
7. Cliente recibe respuesta directamente en el POST o via polling
```

---

## Flujo de mensajes — Modo Manual (Humano)

```
1. Usuario escribe mensaje en el widget
2. POST /api/chat/message
   a. Verifica autenticación y estado del bot
   b. Guarda mensaje del usuario en chat_messages
   c. Envía notificación al admin vía Telegram con el mensaje
   d. Responde al cliente: "Un asesor te responderá en breve"
3. Admin ve el mensaje en Telegram (celular) O en panel del POS
4. Admin responde:
   - DESDE TELEGRAM: el bot de Telegram recibe la respuesta →
     POST /api/telegram/webhook → guarda en chat_messages (role: 'admin')
   - DESDE POS: POST /api/chat/admin-reply → guarda en chat_messages
5. Cliente hace polling GET /api/chat/messages cada 3s
6. Al detectar mensaje nuevo, lo muestra en el widget
```

---

## Widget de Chat — Especificación UI

### Botón flotante (estado cerrado)

- Posición: `fixed bottom-6 right-6`
- Forma: Pill horizontal con ícono de chat + texto "Asistente"
- Colores: Fondo `rgba(204, 32, 32, 0.15)`, borde `rgba(255, 96, 32, 0.4)`
- Efecto: `box-shadow: 0 0 20px rgba(255, 96, 32, 0.3)` (glow rojo suave)
- Hover: glow más intenso, ligero scale-up
- Animación de entrada: bounce suave después de 2s en la página

### Panel de chat (estado abierto)

- Posición: `fixed bottom-24 right-6`
- Tamaño: `380px × 520px` (en móvil: `100vw × 70vh` desde abajo)
- Animación: slide-up con fade-in, `transform: translateY(0)` desde `translateY(20px)`
- Fondo: `rgba(10, 10, 10, 0.95)` con `backdrop-filter: blur(20px)`
- Borde: `1px solid rgba(255, 255, 255, 0.08)`
- Border-radius: `20px`
- Shadow: `0 25px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,96,32,0.1)`

### Header del panel

```
┌─────────────────────────────────────────────┐
│  ⚡ Asistente Chocholand        ● En línea  │  ← rojo si bot, naranja si manual
└─────────────────────────────────────────────┘
```

- Fondo: gradiente sutil `from-[#1a0a0a] to-[#0a0a0a]`
- Indicador de estado: punto verde (bot activo) / naranja (modo manual) / gris (deshabilitado)

### Área de mensajes

- Fondo: transparente (muestra el glass del panel)
- Mensajes del usuario: alineados a la derecha, fondo `rgba(204,32,32,0.2)`, borde `rgba(204,32,32,0.3)`
- Mensajes del bot/admin: alineados a la izquierda, fondo `rgba(255,255,255,0.05)`, borde `rgba(255,255,255,0.08)`
- Avatar del bot: ícono de rayo `⚡` en círculo rojo
- Typing indicator: tres puntos animados mientras Gemini procesa

### Input de mensaje

```
┌────────────────────────────────────┬──────┐
│ Escribe tu pregunta...             │  ▶   │
└────────────────────────────────────┴──────┘
```

- Fondo: `rgba(255,255,255,0.05)`
- Borde: `rgba(255,255,255,0.1)`, focus: `rgba(204,32,32,0.5)`
- Botón enviar: fondo rojo `#cc2020`, hover con glow

### Estados especiales

- **Bot deshabilitado**: panel muestra mensaje de "Asistente temporalmente no disponible" con ícono
- **Límite alcanzado**: banner rojo dentro del chat con el mensaje de límite, input deshabilitado
- **Modo manual sin respuesta**: banner informativo "Un asesor te responderá en breve"

---

## Configuración en el POS — Sección "Asistente IA"

Agregada en `src/app/(app)/configuracion/page.tsx` como una nueva sección,
usando los mismos componentes `Section` y `Field` ya existentes en el archivo.

```
┌─────────────────────────────────────────────────┐
│  ASISTENTE IA                                   │
│                                                 │
│  Bot habilitado                                 │
│  [●────────] ON   ← toggle (guardado en Supabase)│
│  El asistente responde a los clientes           │
│                                                 │
│  Modo de respuesta                              │
│  [──────●] Manual  ← toggle automático/manual   │
│  Automático: IA responde — Manual: tú respondes │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Conversaciones activas hoy: 12         │    │
│  │  Mensajes sin leer: 3                   │    │
│  │  [Ver conversaciones →]                 │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Límite diario de API                           │
│  [████████░░] 234 / 500 llamadas               │
└─────────────────────────────────────────────────┘
```

---

## Panel de Conversaciones en el POS

Panel modal/drawer accesible desde la configuración para que el admin
vea y responda conversaciones en modo manual.

```
┌─────────────────────────────────────────────────┐
│  Conversaciones activas                    [✕]  │
├──────────────┬──────────────────────────────────┤
│ Lista        │ Conversación seleccionada        │
│              │                                  │
│ ● Juan P.    │  Juan Pérez — hace 2 min         │
│   hace 2min  │  ─────────────────────────────   │
│   "Tienen    │                                  │
│   proteína?" │  Juan: Tienen proteína de fresa? │
│              │                                  │
│ ○ María G.   │  Bot: Hola! Sí, tenemos...      │
│   hace 15min │                                  │
│   "Qué ..."  │  Juan: Y cuánto cuesta?         │
│              │  ─────────────────────────────   │
│              │  [Escribe tu respuesta...] [▶]   │
└──────────────┴──────────────────────────────────┘
```

---

## Configuración de Telegram Bot

### Paso a paso para crear el bot

1. Abrir Telegram y buscar `@BotFather`
2. Enviar `/newbot`
3. Darle un nombre: `Chocholand Admin Bot`
4. Darle un username: `chocholand_admin_bot`
5. Guardar el **token** que genera BotFather
6. Crear un grupo privado en Telegram para las notificaciones
7. Agregar el bot al grupo y hacerlo admin
8. Obtener el `chat_id` del grupo

### Variables de entorno necesarias

```env
# Gemini
GEMINI_API_KEY=AIza...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_ADMIN_CHAT_ID=-1001234567890

# Ya existente
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Registro del webhook de Telegram

Una vez desplegado en el VPS, registrar el webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tu-dominio.com/api/telegram/webhook"}'
```

---

## Orden de implementación

| Paso | Tarea | Riesgo para código existente |
|---|---|---|
| 0 | `git tag v-before-chatbot` — punto de restauración | Ninguno |
| 1 | Crear 3 tablas en Supabase (migration) | Ninguno — tablas nuevas |
| 2 | Agregar variables de entorno al `.env.local` | Ninguno — variables nuevas |
| 3 | Crear `src/lib/gemini.ts` | Ninguno — archivo nuevo |
| 4 | Crear `src/lib/telegram.ts` | Ninguno — archivo nuevo |
| 5 | Crear las 5 rutas API en `src/app/api/chat/` y `api/telegram/` | Ninguno — rutas nuevas |
| 6 | Crear `src/components/tienda/ChatWidget.tsx` | Ninguno — componente nuevo |
| 7 | Agregar `<ChatWidget />` al final de `tienda/layout.tsx` | Mínimo — 1 línea de import + 1 línea de JSX |
| 8 | Crear panel de conversaciones en el POS | Ninguno — componente nuevo |
| 9 | Agregar sección bot en `configuracion/page.tsx` | Mínimo — nueva sección al final |
| 10 | Registrar webhook de Telegram en el VPS | Ninguno — configuración externa |
| 11 | Pruebas completas en staging antes de producción | — |

---

## Checklist de pruebas antes de ir a producción

- [ ] Usuario no registrado ve widget deshabilitado / redirige a login
- [ ] Usuario registrado puede abrir el chat
- [ ] El bot responde sobre suplementos correctamente
- [ ] El bot rechaza preguntas fuera del tema de fitness/salud
- [ ] El bot NO revela precios de costo ni mayoreo
- [ ] La búsqueda de inventario retorna sabores y precio público
- [ ] Google Search grounding funciona para recomendaciones de suplementos
- [ ] El bot rechaza búsquedas de temas no relacionados (ej: noticias, cocina)
- [ ] Al llegar a 10 mensajes, muestra el mensaje de límite y bloquea input
- [ ] Al crear la 4a sesión en el día, muestra mensaje de límite diario
- [ ] El toggle "Bot habilitado" apaga/enciende el bot inmediatamente
- [ ] El toggle "Modo manual" cambia el comportamiento correctamente
- [ ] En modo manual, el admin recibe notificación en Telegram
- [ ] En modo manual, el admin puede responder desde Telegram y el cliente lo ve
- [ ] En modo manual, el admin puede responder desde el panel del POS
- [ ] El guard global de API calls pausa el bot cuando se supera el límite
- [ ] El widget se ve correcto en móvil y desktop
- [ ] El código existente del POS y la tienda funciona sin cambios

---

## Estimación de costos aproximados

| Servicio | Costo estimado |
|---|---|
| Gemini 2.0 Flash | ~$0.075 por 1M tokens input / $0.30 por 1M output — muy barato |
| Google Search grounding | ~$35 por 1,000 búsquedas (opcional, solo cuando busca en internet) |
| Telegram Bot API | Gratuito |
| Supabase (tablas nuevas) | Sin costo adicional en plan actual |

Con 500 llamadas/día de límite y conversaciones normales de tienda, el costo
mensual de Gemini debería estar por debajo de $5-10 USD.

---

---

---

# FASE 2 — IA en el POS

> Iniciar solo después de que la Fase 1 (Asistente de Tienda) esté completa y estable.
> Prerequisito: la integración con Gemini ya existe y está funcionando.

---

## Feature 1 — Análisis Conversacional en Reportes

### Qué es

Un panel de chat integrado directamente en la sección de Reportes del POS.
El administrador puede hacer preguntas en lenguaje natural sobre sus datos de ventas,
inventario y clientes, y Gemini consulta Supabase para responder con datos reales.

### Ejemplos de preguntas reales

```
"¿Cuál fue mi producto más vendido este mes?"
"¿Qué días de la semana vendo más?"
"¿Cuánto margen generé esta semana?"
"¿Qué clientes no han comprado en más de 30 días?"
"¿Qué producto me está generando más pérdida de margen?"
"¿Cuántas ventas a crédito tengo pendientes?"
"Compara mis ventas de este mes vs el mes pasado"
"¿Cuál es mi sabor más vendido de proteína?"
```

### Arquitectura

```
[Panel de Reportes — chat lateral]
       │ pregunta en texto
       ▼
POST /api/analytics/chat
       │
       ├── Gemini interpreta la pregunta
       │   → genera query lógico (no SQL directo, por seguridad)
       │
       ├── Server ejecuta consulta controlada en Supabase
       │   (ventas, inventario, clientes, encargos)
       │
       └── Gemini formatea respuesta con los datos reales
           → texto + opcional: tabla o gráfica simple
```

> **Seguridad**: Gemini nunca genera SQL directo. El servidor tiene un set
> limitado de funciones de consulta que Gemini puede invocar como tools,
> similar al `search_inventory()` de la Fase 1. Esto evita inyección o
> exposición de datos no deseados.

### Tools disponibles para Gemini en Analytics

| Tool | Datos que consulta |
|---|---|
| `get_sales_summary(from, to)` | Total vendido, unidades, ticket promedio |
| `get_top_products(from, to, limit)` | Productos más vendidos por unidad y por ingreso |
| `get_sales_by_day(from, to)` | Ventas agrupadas por día de semana |
| `get_margin_by_product(from, to)` | Margen bruto por producto |
| `get_inactive_clients(days)` | Clientes sin compra en N días |
| `get_credit_sales_pending()` | Ventas a crédito sin liquidar |
| `get_stock_alerts()` | Productos con stock bajo o próximos a vencer |
| `get_flavor_sales(product_name)` | Desglose de ventas por sabor de un producto |

### Archivos nuevos

```
src/
├── components/(app)/
│   └── AnalyticsChat.tsx          ← componente chat lateral para reportes
└── app/api/
    └── analytics/
        └── chat/
            └── route.ts           ← POST: procesa pregunta, ejecuta tools, devuelve respuesta
```

### Archivos existentes modificados (mínimo)

| Archivo | Cambio |
|---|---|
| `src/app/(app)/reportes/page.tsx` | Agregar `<AnalyticsChat />` como panel lateral o drawer |

### UI del Chat de Análisis

```
┌─────────────────────────────────────────────────────────────┐
│  REPORTES                          [📊 Preguntale a la IA]  │
├─────────────────────────────────────────┬───────────────────┤
│                                         │ 🤖 Análisis IA    │
│   [Gráficas y tablas existentes]        │───────────────────│
│                                         │ Hola, puedo       │
│                                         │ analizar tus      │
│                                         │ datos. ¿Qué       │
│                                         │ quieres saber?    │
│                                         │                   │
│                                         │ ┌───────────────┐ │
│                                         │ │¿Top productos │ │
│                                         │ │ este mes?     │ │
│                                         │ └───────────────┘ │
│                                         │                   │
│                                         │ Los 3 más         │
│                                         │ vendidos fueron:  │
│                                         │ 1. Whey Choco 42u │
│                                         │ 2. Creatina   38u │
│                                         │ 3. Pre-Work   21u │
│                                         │                   │
│                                         │ [Pregunta...] [▶] │
└─────────────────────────────────────────┴───────────────────┘
```

---

## Feature 2 — Resumen Inteligente al Cerrar Turno

### Qué es

Al hacer clic en "Cerrar turno" en la sección de Turnos, antes de confirmar el
cierre, Gemini genera automáticamente un resumen del turno con insights accionables.
El resumen se muestra en pantalla y queda guardado en el registro del turno.

### Qué incluye el resumen

```
📊 RESUMEN DEL TURNO — Lunes 12 mayo, 10:00 AM – 6:30 PM
──────────────────────────────────────────────────────────

💰 Ventas totales:     $4,850.00   (+18% vs último lunes)
🧾 Transacciones:      23 ventas
🛒 Ticket promedio:    $210.87

🏆 Producto estrella:  Proteína Chocolate — 14 unidades
📦 Stock crítico:      Creatina Limón (3 unidades restantes)
⚠️  Por vencer pronto: Aminoácidos Tropical — lote vence en 12 días

💳 Ventas a crédito:   2 pendientes ($680.00 sin cobrar)
👥 Clientes nuevos:    3 registrados hoy

💡 Observación:  Las ventas de esta tarde fueron 40% más altas
   que la mañana. Los jueves y lunes son tus días más fuertes.
```

### Flujo de implementación

```
1. Admin hace clic en "Cerrar turno"
2. Se muestra spinner: "Generando resumen del turno..."
3. POST /api/turnos/summary
   a. Consulta todas las ventas del turno actual
   b. Consulta stock actual vs stock al inicio del turno
   c. Consulta ventas a crédito generadas en el turno
   d. Envía datos a Gemini para generar resumen en lenguaje natural
4. Se muestra el resumen con opción:
   [Descargar resumen]  [Confirmar cierre de turno]
5. El resumen se guarda en la tabla de turnos en Supabase
```

### Archivos nuevos

```
src/
├── components/(app)/
│   └── TurnSummaryModal.tsx        ← modal con el resumen generado
└── app/api/
    └── turnos/
        └── summary/
            └── route.ts            ← POST: genera resumen con Gemini
```

### Archivos existentes modificados (mínimo)

| Archivo | Cambio |
|---|---|
| `src/app/(app)/turnos/page.tsx` | Interceptar "Cerrar turno" → mostrar `<TurnSummaryModal />` antes de confirmar |

### Columna nueva en tabla `turnos` (si existe)

```sql
ALTER TABLE turnos ADD COLUMN IF NOT EXISTS ai_summary TEXT;
```

---

## Feature 3 — Búsqueda por Voz en Barras de Búsqueda

### Qué es

Ícono de micrófono al lado derecho de las barras de búsqueda existentes en
el POS (productos, inventario, clientes, encargos). Al mantener presionado
o hacer clic, el navegador escucha la voz del usuario y llena el campo de
búsqueda automáticamente. **Sin API externa — usa el Web Speech API del navegador.**

### Factibilidad

| Aspecto | Detalle |
|---|---|
| Tecnología | Web Speech API (nativa del navegador, sin costo) |
| Compatibilidad | Chrome, Edge, Firefox — funciona en desktop (POS es desktop) |
| Costo adicional | $0 — no requiere ninguna API externa |
| Requiere HTTPS | Sí — ya tienen dominio con SSL en el VPS |
| Idioma | `lang: 'es-MX'` para español mexicano |

### Dónde aparece el micrófono

```
Secciones con barra de búsqueda que recibirían el micrófono:

├── POS           → buscar productos para agregar al carrito
├── Inventario    → buscar productos en el inventario
├── Productos     → buscar en el catálogo
├── Clientes      → buscar cliente por nombre
└── Encargos      → buscar encargo por cliente
```

### UI del botón de micrófono

```
┌─────────────────────────────────────────┬──────┐
│ Buscar producto...                      │  🎙️  │
└─────────────────────────────────────────┴──────┘
                                            ↑
                              Gris en reposo, rojo pulsando
                              Animación de onda al escuchar
```

Estados visuales:
- **Reposo**: ícono gris, sin borde
- **Escuchando**: ícono rojo, pulso animado, tooltip "Escuchando..."
- **Procesando**: spinner breve mientras llena el campo
- **Error**: tooltip "Micrófono no disponible" si el browser no soporta

### Archivos nuevos

```
src/
└── hooks/
    └── useSpeechRecognition.ts     ← hook reutilizable que envuelve Web Speech API
src/
└── components/(app)/
    └── VoiceSearchButton.tsx       ← botón de micrófono para insertar en cualquier input
```

### Integración en archivos existentes

El botón se agrega al lado del input de búsqueda. Cambio mínimo:
reemplazar `<input ... />` por `<input ... /> <VoiceSearchButton onResult={setQuery} />`.

---

## Feature 4 — Comandos de Voz Globales en el POS

### Qué es

Un botón de micrófono flotante (o activado con una tecla) que escucha
comandos de voz para ejecutar acciones dentro del POS sin necesidad de
hacer clic. Gemini interpreta el comando en lenguaje natural y el sistema
ejecuta la acción correspondiente.

### Comandos soportados (lista inicial)

| Lo que dices | Acción que ejecuta |
|---|---|
| "Abrir nuevo producto" | Abre el modal de crear producto |
| "Abrir nuevo cliente" | Abre el modal de crear cliente |
| "Abre las ventas de [fecha]" | Navega a /ventas con filtro de fecha aplicado |
| "Exportar inventario a Excel" | Ejecuta la exportación con preset predefinido |
| "Crear encargo para [nombre cliente]" | Abre el modal de encargo con el cliente buscado |
| "Agregar foto al producto [nombre]" | Abre la sección de fotos para ese producto en configuración |
| "Ir a inventario" | Navega a /inventario |
| "Ir a reportes" | Navega a /reportes |
| "Cerrar turno" | Inicia el flujo de cierre de turno |

### Flujo de interpretación

```
1. Usuario activa el micrófono (clic en botón flotante o tecla configurada)
2. Web Speech API transcribe lo que dice
3. Texto va a POST /api/voice/command
4. Gemini recibe el texto + lista de comandos disponibles (como JSON schema)
5. Gemini devuelve: { action: "open_modal", params: { modal: "new_product" } }
6. VoiceCommandContext despacha la acción en el POS
7. UI ejecuta la acción y muestra confirmación visual
```

> **Por qué Gemini y no solo regex**: El lenguaje natural varía mucho.
> "Quiero registrar un producto nuevo", "nuevo producto", "agregar producto"
> son la misma intención. Gemini maneja todas las variaciones sin necesidad
> de mantener listas de sinónimos.

### Arquitectura de contexto global

```
src/
├── contexts/
│   └── VoiceCommandContext.tsx     ← Provider global que gestiona estado del micrófono
│                                      y despacha acciones al resto del POS
├── hooks/
│   └── useSpeechRecognition.ts     ← (compartido con Feature 3)
├── components/(app)/
│   └── VoiceCommandButton.tsx      ← botón flotante del micrófono global
└── app/api/
    └── voice/
        └── command/
            └── route.ts            ← POST: Gemini interpreta el comando → JSON de acción
```

### Archivos existentes modificados (mínimo)

| Archivo | Cambio |
|---|---|
| `src/app/(app)/layout.tsx` | Envolver con `<VoiceCommandProvider>` + agregar `<VoiceCommandButton />` |

### UI del botón flotante de comandos

```
┌──────────────────────────────────────────────────┐
│  POS Layout                                      │
│                                                  │
│   [contenido del POS]                            │
│                                                  │
│                                    ┌───────────┐ │
│                                    │  🎙️ Voz   │ │  ← botón fijo arriba-derecha
│                                    └───────────┘ │
└──────────────────────────────────────────────────┘

Al activar:
┌──────────────────────────────────────────────────┐
│  🎙️ Escuchando comando...                        │  ← banner superior
│  "Abrir nuevo cliente"                            │
│  ✓ Abriendo formulario de cliente...             │
└──────────────────────────────────────────────────┘
```

---

## Resumen de archivos — Fase 2

### Archivos completamente nuevos (no tocan nada existente)

```
src/hooks/useSpeechRecognition.ts
src/contexts/VoiceCommandContext.tsx
src/components/(app)/AnalyticsChat.tsx
src/components/(app)/TurnSummaryModal.tsx
src/components/(app)/VoiceSearchButton.tsx
src/components/(app)/VoiceCommandButton.tsx
src/app/api/analytics/chat/route.ts
src/app/api/turnos/summary/route.ts
src/app/api/voice/command/route.ts
```

### Archivos existentes con cambios mínimos

| Archivo | Qué se agrega |
|---|---|
| `src/app/(app)/reportes/page.tsx` | Panel lateral con `<AnalyticsChat />` |
| `src/app/(app)/turnos/page.tsx` | Interceptar cierre → `<TurnSummaryModal />` |
| `src/app/(app)/layout.tsx` | `<VoiceCommandProvider>` + `<VoiceCommandButton />` |
| Barras de búsqueda en POS, Inventario, Productos, Clientes, Encargos | `<VoiceSearchButton />` al lado de cada input |

---

## Orden de implementación — Fase 2

| Paso | Tarea | Dependencia |
|---|---|---|
| 1 | `git tag v-before-fase2` — nuevo punto de restauración | Fase 1 completa |
| 2 | `useSpeechRecognition.ts` — hook base compartido | Nada |
| 3 | `VoiceSearchButton.tsx` + agregar a barras de búsqueda | Paso 2 |
| 4 | Analytics tools en Gemini + ruta `/api/analytics/chat` | Gemini lib de Fase 1 |
| 5 | `AnalyticsChat.tsx` + agregar a reportes | Paso 4 |
| 6 | Ruta `/api/turnos/summary` + `TurnSummaryModal.tsx` | Gemini lib de Fase 1 |
| 7 | Integrar modal en página de turnos | Paso 6 |
| 8 | Ruta `/api/voice/command` con Gemini | Gemini lib de Fase 1 |
| 9 | `VoiceCommandContext.tsx` + `VoiceCommandButton.tsx` | Pasos 2 y 8 |
| 10 | Agregar Provider y botón al layout del POS | Paso 9 |
| 11 | Pruebas completas de Fase 2 | — |

---

## Checklist de pruebas — Fase 2

**Análisis conversacional:**
- [ ] El chat en reportes responde preguntas de ventas con datos reales
- [ ] No expone datos sensibles fuera de los tools definidos
- [ ] Maneja preguntas sin resultados gracefully ("No hay ventas en ese período")
- [ ] Las fechas relativas funcionan ("este mes", "la semana pasada", "hoy")

**Resumen de turno:**
- [ ] El resumen se genera antes de confirmar el cierre
- [ ] Los datos del resumen coinciden con las ventas reales del turno
- [ ] El resumen se guarda correctamente en Supabase
- [ ] Si Gemini falla, el cierre de turno puede completarse sin resumen

**Búsqueda por voz:**
- [ ] El micrófono aparece en todas las barras de búsqueda designadas
- [ ] Transcribe correctamente en español mexicano
- [ ] El resultado de voz llena el campo y dispara la búsqueda
- [ ] Muestra error claro si el micrófono no está disponible o se deniega el permiso
- [ ] No bloquea el flujo normal de búsqueda por teclado/escáner

**Comandos de voz:**
- [ ] Todos los comandos de la lista inicial funcionan correctamente
- [ ] Variaciones naturales del mismo comando se interpretan bien
- [ ] Comandos con nombre de cliente/producto buscan y pre-llenan correctamente
- [ ] Comandos no reconocidos muestran sugerencia en lugar de error silencioso
- [ ] El resto del POS funciona normalmente cuando los comandos no están activos

---

## Estimación de costos adicionales — Fase 2

| Feature | Costo adicional |
|---|---|
| Análisis conversacional | Mínimo — solo llamadas Gemini cuando el admin pregunta algo (bajo volumen) |
| Resumen de turno | Mínimo — 1 llamada Gemini por cierre de turno al día |
| Búsqueda por voz | $0 — Web Speech API es gratuita |
| Comandos de voz | Muy bajo — 1 llamada Gemini por comando, uso esporádico |

El costo adicional de la Fase 2 debería ser menos de $2-3 USD/mes extra
considerando el volumen de uso interno del POS.

---

*Documento generado como referencia de implementación. No ejecutar código hasta que el usuario confirme inicio.*
