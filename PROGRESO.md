# Progreso del Proyecto — POS + Tienda Online

## Stack
- **Framework:** Next.js 16.2 (App Router, TypeScript, Tailwind)
- **Base de datos:** Supabase (PostgreSQL + Auth + Realtime)
- **Imágenes:** Cloudinary (pendiente de integrar)
- **Deploy:** Hostinger VPS KVM2
- **Pago:** Por definir (Stripe o MercadoPago)

---

## Sesión 1 — 2026-03-23

### ✅ Fase 1 completada: El Núcleo

**Configuración inicial**
- Proyecto Next.js creado con TypeScript + Tailwind + App Router
- Supabase conectado vía `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Cliente Supabase en `src/lib/supabase.ts`

**Esquema de base de datos** (`src/lib/schema.sql`)
- `products` — producto padre (agrupa variantes, usado en tienda online)
- `product_variants` — cada código de barras (usado en POS). Campos: `barcode`, `flavor` (null si no aplica), `cost_price`, `sale_price`, `wholesale_price`, `stock`, `min_stock`, `max_stock`
- `sales` — cabecera de venta
- `sale_items` — detalle de venta
- Índices en `barcode`, `product_id`, `sale_id`
- Trigger `update_updated_at` en `products` y `product_variants`
- Constraint `UNIQUE` en `products.name`

**Lógica de parseo de nombres desde Excel**
- 2 separadores ` - ` → tiene sabor: `Marca - Producto - Sabor`
- 1 separador ` - ` → sin sabor: `Marca - Producto`

**Importador de Excel** (`src/app/admin/import/page.tsx`)
- Lee archivo `.xlsx` con librería `xlsx`
- Columnas: `Código`, `Producto`, `P. Costo`, `P. Venta`, `P. Mayoreo`, `Existencia`, `Inv. Mínimo`, `Inv. Máximo`, `Departamento`
- Muestra preview antes de importar
- Hace `upsert` en `products` (por `name`) y `product_variants` (por `barcode`)
- Datos del catálogo real ya importados y verificados en Supabase

---

## Sesión 2 — 2026-03-24

### ✅ Plan de implementación POS completo definido

**Diseño visual:** Dark industrial-premium con acentos ámbar/dorado
- Fuentes: Syne (display) + JetBrains Mono (precios) + DM Sans (UI)
- Paleta: fondo `#0D0D12`, acento `#F0B429`

**Fases planificadas:**
1. Schema DB extendido ✅
2. Auth + Login + Middleware
3. Layout principal + navegación
4. Pantalla POS + carrito + pagos (cash/card/credit)
5. Lector de barras + impresión de tickets
6. Inventario completo
7. Corte de caja + movimientos de efectivo
8. Clientes + crédito
9. Reportes + gráficas

### ✅ Migración V2 — Schema extendido (`src/lib/schema_v2.sql`)

**Tablas nuevas:**
- `profiles` — usuarios con roles (`owner` | `cashier`), vinculado a `auth.users`
- `customers` — clientes con límite y saldo de crédito
- `shifts` — turnos de caja (apertura/cierre)
- `cash_movements` — entradas/salidas de efectivo por turno
- `credit_payments` — abonos a deuda de clientes
- `inventory_adjustments` — trazabilidad de cambios de stock

**Modificaciones a tablas existentes:**
- `sales` → `shift_id`, `cashier_id`, `customer_id`, `amount_paid`, `change_given`, `discount`, payment_method ahora incluye `'credit'`
- `sale_items` → `discount`, `subtotal`

**Extras:**
- RLS habilitado en todas las tablas
- Triggers automáticos: actualiza `credit_balance` al vender a crédito o registrar abono
- Vista `shift_summary` para resumen de turno en tiempo real

---

## Sesión 3 — 2026-03-24

### ✅ Fase 2: Auth + Login + Middleware

- `src/app/login/page.tsx` — login con email/password, acepta username corto (agrega `@chocholand.com` automáticamente)
- `src/contexts/AuthContext.tsx` — contexto global con `user`, `profile`, `signOut`; carga perfil desde tabla `profiles`
- `src/proxy.ts` — protección de rutas: sin sesión → `/login`, con sesión en `/login` → `/pos`
- Fix RLS: recursión infinita en `profiles` resuelta con función `get_my_role()` (`SECURITY DEFINER`)

### ✅ Fase 3: Layout + Navegación

- Route group `(app)` con `layout.tsx` compartido (sidebar + main)
- `src/components/Sidebar.tsx` — navegación vertical con íconos, ruta activa resaltada, avatar de usuario, botón signout; ítem Configuración visible solo para `owner`
- Rutas: `/pos`, `/inventario`, `/clientes`, `/turnos`, `/reportes`, `/configuracion`

### ✅ Fase 4: Pantalla POS

- `ProductPanel.tsx` — carga paginada (`.range()`) para superar límite de 1000 filas de Supabase; filtrado por categoría y búsqueda 100% en cliente (instantáneo); 10 categorías ordenadas según prioridad de negocio; badges de cantidad en carrito
- `CartPanel.tsx` — carrito con controles de cantidad, totales automáticos, 3 botones de pago
- `PaymentModal.tsx` — efectivo (cambio automático + montos rápidos), tarjeta, crédito (búsqueda de cliente con límite/saldo); inserta en `sales` + `sale_items` + decrementa stock
- Fix RLS: políticas `FOR ALL USING` reemplazadas por `FOR SELECT/INSERT/UPDATE` explícitas en `sales` y `sale_items`
- Fix RLS: política `UPDATE` agregada a `product_variants` para cajeros

### ✅ Fase 5: Lector de barras + Impresión de tickets

- Lector de barras: `onKeyDown` en campo de búsqueda — Enter con código exacto agrega al carrito y limpia el campo
- `Receipt.tsx` — ticket post-venta con preview en pantalla; botón "Imprimir" abre ventana con `@page { size: 80mm 3276mm }` para EPSON TM-T20II (rollo continuo, corte automático)
- `src/app/(app)/configuracion/page.tsx` — ajustes de impresora (nombre de referencia, ancho de papel 58/80mm, auto-print toggle, nombre y pie del ticket); ticket de prueba; guardado en `localStorage`

### ✅ Inventario (adelantado desde Fase 6)

- `src/app/(app)/inventario/page.tsx` — lista completa con paginación, búsqueda en cliente, filtro "Solo con existencias", badges de stock verde/amarillo/rojo
- Importador de Excel integrado en inventario: preview de primeros 20 registros, `upsert` por barcode

---

## Sesión 4 — 2026-03-24

### ✅ Fase 6: Inventario completo

- **Ajustes manuales de stock** (`AdjustModal` en `inventario/page.tsx`) — modal con 3 tipos: Entrada (+), Salida (−), Corrección (absoluto); preview de stock resultante en tiempo real; registra en `inventory_adjustments` con `quantity_before`, `quantity_change`, `quantity_after`, `cashier_id`, `reason`
- **Edición de precios inline** (`PriceCell`) — clic en P.Venta / P.Costo / P.Mayoreo convierte la celda en input; Enter o blur guarda con UPDATE en Supabase; solo visible para `owner`
- Fix RLS: políticas `FOR ALL USING` reemplazadas por explícitas en `inventory_adjustments`; política `UPDATE` de `product_variants` corregida con `WITH CHECK`

### ✅ Fase 7: Turnos / Corte de caja

- `src/app/(app)/turnos/page.tsx` — máquina de estados: sin turno abierto / turno activo
- **Abrir turno:** fondo inicial de caja → inserta en `shifts` con `status: 'open'`
- **Dashboard de turno activo:** banner con indicador pulsante, stats (fondo inicial, total ventas, efectivo, tarjeta, crédito, efectivo estimado en caja)
- **Movimientos de efectivo:** modal Entrada/Salida con monto y motivo obligatorio; lista en tiempo real; registra en `cash_movements`
- **Cerrar turno:** resumen completo (ventas por método, movimientos manuales, efectivo esperado), conteo físico, cálculo automático de diferencia sobrante/faltante; actualiza `shifts` con `status: 'closed'`, `closing_amount`, `cash_difference`
- **Historial de turnos cerrados** — últimos 10 con fecha, cajero, hora apertura/cierre, diferencia
- `PaymentModal.tsx` actualizado — consulta turno activo al abrir y pasa `shift_id` en cada venta
- Fix RLS: políticas explícitas `FOR SELECT/INSERT/UPDATE` en `shifts` y `cash_movements`; `.single()` → `.maybeSingle()` en consulta de `shift_summary`

### ✅ Fase 8: Clientes + Crédito

- `src/app/(app)/clientes/page.tsx` — lista con avatar, nombre, teléfono, correo, límite, saldo de deuda con barra de progreso (verde/amarillo/rojo), disponible; stats en header (total clientes, con deuda, monto pendiente); filtro "Con deuda"
- **Crear/Editar cliente** (`CustomerModal`) — nombre, teléfono, correo, dirección, límite de crédito, notas; grid 2 columnas
- **Abonar a crédito** (`AbonoModal`) — panel estado de cuenta (saldo/límite/disponible); atajos 25%/50%/todo; selección efectivo/tarjeta; historial de últimos 8 abonos; registra en `credit_payments` + trigger de Supabase actualiza `credit_balance`
- **Historial / Estado de cuenta** (`HistorialModal`) — timeline combinado de compras a crédito y abonos ordenado por fecha; saldo corrido por movimiento; resumen total compras vs total abonado vs saldo actual
- Fix RLS: políticas explícitas `FOR SELECT/INSERT/UPDATE` en `customers` y `credit_payments`

---

---

## Sesión 5 — 2026-03-25

### ✅ Fase 9: Reportes + Gráficas

- `src/app/(app)/reportes/page.tsx` — página completa sin dependencias externas (SVG puro)
- **Selector de período:** Hoy / 7 días / Este mes / 30 días
- **KPIs:** Ingresos totales, transacciones, ticket promedio, efectivo cobrado (% del total)
- **Gráfica de barras SVG:** ventas por día con tooltip hover (monto + número de ventas); rellena días sin ventas en cero; etiquetas adaptativas según densidad
- **Desglose por método de pago:** barras horizontales animadas con porcentaje para Efectivo / Tarjeta / Crédito
- **Top 10 productos más vendidos:** tabla con ranking, nombre + sabor, unidades, ingresos, barra de participación relativa; top 3 resaltados en ámbar
- Datos obtenidos con 2 queries Supabase: `sales` filtrado por `created_at`, luego `sale_items` filtrado por `sale_id IN [...]`

### ✅ Trazabilidad: Fecha de caducidad

- Campo `expiration_date date` agregado a `product_variants` (nullable)
- **Inventario:** columna de caducidad con edición inline; badge de color: rojo (vencido / ≤7 días), amarillo (≤30 días), verde (>30 días)
- **POS — ProductPanel:** función `getExpLabel()` calcula días restantes y muestra tag en cada tarjeta; tarjetas vencidas o con vencimiento hoy resaltadas con borde rojo (`product-card--expired`)
- Alerta visual escalonada: VENCIDO (rojo), Vence hoy (rojo), Vence en Nd ≤7 (rojo), Vence en Nd ≤30 (amarillo)

### ✅ Venta en Espera (Multi-ticket)

- **`pos/page.tsx`** — estado `heldTickets: HeldTicket[]` con persistencia en `localStorage` (`pos_holds`); funciones `holdCart`, `recallTicket`, `deleteHeld`
- **`CartPanel.tsx`** — botón "Espera" (pausa la venta actual y limpia el carrito); badge ámbar "X en espera" que abre el panel
- **`HoldsPanel`** (en `pos/page.tsx`) — modal overlay con lista de tickets pausados; muestra productos (preview 3 + contador), total, tiempo transcurrido; botón "Recuperar" carga el ticket (si hay carrito activo lo pone en espera primero); botón eliminar para descartar
- Tickets numerados automáticamente (`Ticket #N`); persisten entre recargas de página

### ✅ Fix: paquete `xlsx`

- `npm install xlsx` — paquete no estaba instalado en el entorno actual; necesario para el importador de Excel en inventario

---

---

## Sesión 6 — 2026-03-25

### ✅ Arquitectura Offline-First (PWA)

**Objetivo:** POS e Inventario funcionan sin conexión a internet; resto de módulos bloqueados offline.

**Nuevos archivos:**
- `src/lib/db.ts` — Base de datos local con Dexie.js (IndexedDB). Tablas: `product_variants` (LocalVariant — estructura plana), `active_shift`, `offline_queue` (QueueEntry), `sync_meta`
- `src/lib/sync.ts` — `SyncEngine` singleton con: `shouldResync()`, `syncCatalog()`, `getProducts()`, `processSale()`, `flushQueue()`, `getQueueCount()`, `getLastSyncTime()`. Mapea `LocalVariant → ProductVariant` con nested `product`. Sync automático cada 30 minutos.
- `src/contexts/OfflineContext.tsx` — Proveedor global con estado `isOnline`, `queueCount`, `lastSync`, `isSyncing`. Flush automático de cola al reconectar (`window 'online'`). Exporta `useOffline()`.
- `src/components/OfflineBanner.tsx` — Banner flotante con 3 estados: rojo (offline + contador de ventas en cola), morado (sincronizando con progreso), verde (reconectado, desaparece solo).
- `src/components/SwRegister.tsx` — Registra el Service Worker y pre-cachea `/pos` e `/inventario` al iniciar.
- `public/sw.js` — Service Worker: cache-first para `/_next/static/` (assets inmutables), network-first con fallback de app shell para navegaciones completas.

**Archivos modificados:**
- `src/app/(app)/layout.tsx` — Envuelve todo en `OfflineProvider`; añade `OfflineBanner` y `SwRegister`
- `src/app/layout.tsx` — Añade `SwRegister` para registrar SW desde la raíz
- `src/components/Sidebar.tsx` — Íconos 🔒 para módulos sin soporte offline (Clientes, Turnos, Reportes, Config); `prefetch` en todos los links
- `src/app/(app)/pos/ProductPanel.tsx` — Lee siempre desde Dexie (`syncEngine.getProducts()`); sincroniza con Supabase solo cuando hay conexión y el caché tiene >30 min
- `src/app/(app)/pos/PaymentModal.tsx` — `syncEngine.processSale()`: online = escribe en Supabase + Dexie; offline = guarda en `offline_queue` + decremento optimista de stock
- `src/app/(app)/pos/CartPanel.tsx` — Botón "Crédito" deshabilitado offline
- `src/app/(app)/pos/page.tsx` — Fix hydration: `heldTickets` se inicializa en `[]` y se carga desde `localStorage` en `useEffect`
- `src/app/(app)/inventario/page.tsx` — Lee desde Dexie igual que POS; botones de ajuste/edición deshabilitados offline; badge "Solo lectura" en header

### ✅ Fix: Inventario offline — datos y permisos

- `loadInventory()` usa `syncEngine.getProducts()` + `try/finally` para que nunca quede en estado "Cargando..." indefinido
- Todos los `canEdit` en `PriceCell` y `DateCell` condicionados a `isOnline && isOwner`
- Botones Ajustar stock, importar Excel ocultos/deshabilitados cuando `!isOnline`

### ✅ Cancelar / Anular ventas

**Migración SQL:** `src/lib/schema_cancelaciones.sql`
- Agrega columna `status TEXT DEFAULT 'completed' CHECK ('completed','cancelled')` a `sales`
- Agrega `cancelled_at`, `cancelled_by`, `cancel_reason`
- Índice `idx_sales_status`

**Nuevo componente:** `src/app/(app)/pos/VoidSaleModal.tsx`
- Lista ventas completadas de las **últimas 48 horas** con búsqueda por monto, cajero, cliente o producto
- Pantalla de confirmación con detalle completo de artículos y campo de motivo opcional
- Al confirmar: marca `status = 'cancelled'` en Supabase + **restaura el stock** de cada artículo
- Solo visible cuando hay conexión (`isOnline`)

**Modificado:** `src/app/(app)/pos/CartPanel.tsx`
- Botón "Anular" (rojo, con ícono de papelera) en el header del carrito → abre `VoidSaleModal`
- Solo visible cuando `isOnline`

**Tipo actualizado:** `Sale` en `src/types/index.ts` — agrega `status`, `cancelled_at`, `cancelled_by`, `cancel_reason`

---

## Pendiente
- Mejoras adicionales a criterio del dueño (próximas features por definir)
- Probar offline en producción (`npm run build && npm start`) — el modo dev con Turbopack no cachea correctamente por diseño
