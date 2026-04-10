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

---

## Sesión 7 — 2026-03-26

### ✅ Mejoras POS — Pagos y Precios

**PaymentModal — Pagos mixtos y Monedero:**
- Estado `active` migrado de `Set` a objeto plano `Record<SalePaymentMethod, boolean>` — fix de reactividad React que impedía activar múltiples métodos simultáneamente
- Monedero se **auto-activa** al seleccionar un cliente con saldo (antes solo pre-llenaba el monto)
- Wallet se pre-llena con `min(saldo, total)` para no exceder el total
- Todos los métodos combinables: Efectivo + Tarjeta + Transferencia + Monedero

**CartPanel — Precio mayoreo y edición de precio:**
- Botón **"May"** en cada producto del carrito (solo si `wholesale_price ≠ sale_price`): toggle entre precio público y mayoreo. Se resalta en ámbar cuando está activo
- **Doble clic** en el precio abre un input inline para precio personalizado/preferencial. Enter confirma, Escape cancela. Input con `flex:1` y fuente 15px bold para precios >$1,000

### ✅ Programa de Lealtad + Clientes mejorados

*(implementado en sesión anterior, documentado aquí)*
- `schema_lealtad.sql` — nuevas columnas `whatsapp`, `loyalty_balance`, `loyalty_spent` en `customers`; tablas `loyalty_transactions` y `sale_payments`
- $50 de monedero por cada $1,000 gastados (solo en pagos no-monedero)
- Cliente en POS: búsqueda por WhatsApp o nombre, auto-selección si hay 1 resultado
- Página Clientes rehecha: estadísticas, filtros, tabs Compras/Monedero/Crédito por cliente

---

## Deploy a Producción — Estado (2026-03-27) ✅ COMPLETO

### ✅ Completado
- [x] Repo GitHub: `https://github.com/cahdz41/pos-tienda` (privado, branch `main`)
- [x] Workflow CI/CD: `.github/workflows/deploy.yml`
- [x] PM2 config: `ecosystem.config.js` (puerto 3003)
- [x] Repo clonado en VPS → `/var/www/pos-tienda`
- [x] `.env.local` creado en el servidor con credenciales de Supabase
- [x] App corriendo con PM2 (nombre: `pos-tienda`, puerto `3003`)
- [x] **Traefik** rutea `pos-storeonline.duckdns.org` → `172.17.0.1:3003` (config: `/docker/n8n/traefik-dynamic/pos.yml`)
- [x] **SSL/HTTPS** — Certificado Let's Encrypt gestionado automáticamente por Traefik
- [x] DNS resolviendo → `76.13.109.126`
- [x] GitHub Secrets configurados: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
- [x] **Auto-deploy verificado** — push a `main` → GitHub Actions despliega solo ✅

### Notas importantes del VPS
- Puerto 3001 ocupado por `bot-gym` (WhatsApp) — POS usa puerto 3003
- Traefik (Docker) maneja SSL en puertos 80/443 — Nginx está inactivo
- pm2 path: `/usr/lib/node_modules/pm2/bin/pm2`

### Comandos útiles en el VPS
```bash
/usr/lib/node_modules/pm2/bin/pm2 status
/usr/lib/node_modules/pm2/bin/pm2 logs pos-tienda
/usr/lib/node_modules/pm2/bin/pm2 reload pos-tienda
docker ps --format "table {{.Names}}\t{{.Ports}}"
cat /docker/n8n/traefik-dynamic/pos.yml
```

---

## Sesión 8 — 2026-04-06

### ✅ Fix crítico: cuelgue de datos tras inactividad (root cause encontrado)

**Problema:** Después de varios minutos sin usar la app, al regresar el POS y otras pantallas se quedaban cargando indefinidamente (skeleton infinito). Solo se resolvía con F5. Se habían intentado múltiples workarounds sin éxito.

**Root cause real (encontrado leyendo el source de `@supabase/ssr`):**

`createBrowserClient` de `@supabase/ssr` sobreescribe `autoRefreshToken: true` en el browser **sin importar lo que se pase como opción**:

```js
// node_modules/@supabase/ssr/dist/main/createBrowserClient.js
auth: {
  ...options?.auth,                         // ← nuestro autoRefreshToken: false
  autoRefreshToken: isBrowser(),            // ← SOBREESCRIBE a true
}
```

Esto activaba el timer interno de Supabase (dispara cada 30 segundos). En background, el browser throttlea los timers. Al regresar al tab, se acumulaban 10-20 ticks concurrentes que formaban una cola en el lock interno (`lockAcquired`). Durante ese bloqueo (hasta 30 segundos), **todas las queries de DB quedaban paralizadas esperando en la cola**. El `AbortController` de 8s en `ProductPanel` no ayudaba porque solo cancela el HTTP fetch, no la espera en el lock de auth de Supabase.

**Todos los workarounds anteriores** (SessionRefresher, fetch interceptor, custom lock, AbortController) operaban sobre una premisa falsa: que `autoRefreshToken: false` estaba funcionando.

**Archivos modificados:**

1. **`src/lib/supabase/client.ts`** — Cambiado de `createBrowserClient` (`@supabase/ssr`) a `createClient` directo (`@supabase/supabase-js`). Con `createClient`, la opción `autoRefreshToken: false` sí se respeta. Sin timer, sin pile-up, sin bloqueo de lock.

2. **`src/components/SessionRefresher.tsx`** — Simplificado el health check. Ahora verifica correctamente si el token está expirado (con `autoRefreshToken: false` real, `getSession()` ya no intenta refresh automático internamente — solo lo hace si el token venció y `autoRefreshToken: true`).

3. **`src/app/(app)/pos/ProductPanel.tsx`** — Agregado `hardTid` de 14 segundos como seguro de último recurso: si `fetchAll` se traba por cualquier razón en la capa de auth, `loading` se fuerza a `false` antes de que el usuario lo perciba como infinito.

**Nota de migración:** Al hacer deploy, los usuarios necesitan hacer login de nuevo una sola vez. La sesión ahora se almacena en `localStorage` en lugar de cookies (ya que no hay middleware ni server components que requieran auth por cookies).

---

## Sesión 9 — 2026-04-07

### ❌ Bug introducido por Sesión 8: "Sin turno activo" en POS + POS no carga productos

**Síntoma:** Al abrir la app en `/pos`:
- Aparece overlay "Sin turno activo" bloqueando todo
- Ir a `/turnos` muestra el turno como abierto correctamente
- Volver a `/pos` vuelve a mostrar el overlay
- En consola: `[POS load] Error o Timeout: {}`

**Diagnóstico completado (root causes identificados):**

**Bug 1 — ProductPanel crashea al cargar productos:**
- `ProductPanel.tsx` línea 69: `if (combosRes.error) throw combosRes.error`
- Si la tabla `combos` falla (no existe o RLS), se lanza el error y `setAllVariants` nunca se llama → productos no cargan
- El error `{}` en consola era un `PostgrestError` (extiende `Error`, JSON.stringify → `{}`)
- **Fix aplicado:** Se cambió a `console.warn` en lugar de `throw` para que combos sea no-fatal. Los productos SÍ cargan aunque combos falle.

**Bug 2 — Query de turno activo devuelve null (overlay "Sin turno activo"):**
- El cambio de Sesión 8 (`createBrowserClient` → `createClient`) movió la sesión de cookies a localStorage
- El middleware de protección de rutas estaba en `src/proxy.ts` en lugar de `src/middleware.ts` — **NUNCA fue ejecutado por Next.js** (nombre incorrecto)
- Sin sesión válida en localStorage (usuario no ha re-hecho login tras la migración), las queries corren con anon key
- RLS en tabla `shifts` (`auth.uid() IS NOT NULL`) bloquea anon → devuelve `null` → overlay
- Tabla `shift_summary` (usada en `/turnos`) es una VIEW security-definer → **bypasea RLS** → por eso Turnos sí muestra datos aunque no haya sesión
- **Fix parcial aplicado en `pos/page.tsx`:** Se agregó guard `authLoading` (igual que en Turnos) para esperar que auth cargue antes de consultar

**Fixes aplicados en esta sesión (commit pendiente):**
1. `src/app/(app)/pos/ProductPanel.tsx` — combos no-fatal
2. `src/app/(app)/pos/page.tsx` — guard `authLoading` + logging de error en shift query
3. `src/app/(app)/layout.tsx` — convertido a client component con redirect a `/login` si `user = null`

**Estado al terminar la sesión:** App sigue sin funcionar — `.next` cache quedó con referencia a un `middleware.ts` que se creó y eliminó durante la sesión. Requiere limpiar cache.

**⚠️ Pasos para resolver al retomar:**

1. **Limpiar cache y reiniciar dev server:**
   ```bash
   cd "c:/Users/kurtd/visual studio code/pos+tienda"
   # Detener el servidor primero (Ctrl+C)
   rm -rf .next
   npm run dev
   ```

2. **Verificar que el layout fix funciona:** Al ir a `localhost:3000/pos` sin sesión, debe redirigir a `/login`

3. **Iniciar sesión:** Ir a `localhost:3000/login` → ingresar credenciales → esto crea la sesión en localStorage (nuevo sistema)

4. **Verificar que el POS funciona:** Después del login, el turno debe detectarse correctamente y los productos deben cargar

5. **Si aún falla después del login:** El bug puede estar en el `AuthContext` que corre con timeout de 8 segundos — si `getSession()` tarda más de 8s en refrescar el token, recarga la página en loop. Revisar `src/contexts/AuthContext.tsx` línea ~40-58.

**Último estado observado al terminar la sesión:**
Después del cambio en `src/app/(app)/layout.tsx` (convertir a client component con `'use client'` y guard de auth), al probar en local:
- Pantalla completamente negra
- No carga nada
- Sin errores en consola
- Probablemente causado por el layout devolviendo `null` mientras `loading = true`, combinado con el cache corrupto de `.next` (referencia a `middleware.ts` eliminado)

**Archivos modificados en esta sesión (estado actual del código):**
- `src/app/(app)/pos/ProductPanel.tsx` — combos no lanza error fatal
- `src/app/(app)/pos/page.tsx` — importa `useAuth`, guard `authLoading`, logs error shift
- `src/app/(app)/layout.tsx` — `'use client'`, redirige a login si no hay usuario
