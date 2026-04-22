# Progreso del Proyecto — POS + Tienda Online

## Repositorio

**GitHub (ya existe, no crear nuevo):** https://github.com/cahdz41/pos-tienda  
Rama principal: `main` — disponible en ambas PCs y en el VPS.

---

## Sincronización entre PCs — LEER ANTES DE EMPEZAR

Este proyecto se trabaja desde **dos PCs distintas**. La rama activa es `main`.  
**Nunca uses `master`** — esa rama quedó obsoleta en PC1.

### Al empezar a trabajar (en cualquier PC):
```bash
git pull origin main
```

### Al terminar de trabajar (en cualquier PC):
```bash
git add -A
git commit -m "descripción de lo que hiciste"
git push origin main
```

### Si una PC no tiene remote configurado (caso nuevo o reinstalación):
```bash
git remote add origin https://github.com/cahdz41/pos-tienda.git
git fetch origin
git checkout -b main origin/main
```

### Notas importantes:
- El error **"refusing to merge unrelated histories"** ocurre cuando una PC nunca estuvo conectada al remoto. Se resuelve con los comandos de arriba (no usar `--allow-unrelated-histories`).
- Si hay archivos locales sin commitear antes de cambiar a `main`, hacer `git stash` primero y recuperarlos después con `git stash pop`.
- Los warnings de **LF/CRLF** son normales en Windows y no afectan el código.

---

## Stack
- **Framework:** Next.js 16.2 (App Router, TypeScript, Tailwind)
- **Base de datos:** Supabase (PostgreSQL + Auth + Realtime)
- **Imágenes:** Cloudinary (pendiente de integrar)
- **Deploy:** Hostinger VPS KVM2 — ver `DEPLOY.md` para el procedimiento completo
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

---

## Sesión 10 — 2026-04-12 (pos-v2)

> Este proyecto es el **reinicio limpio** de pos+tienda, construido desde cero en `pos-v2` para evitar el acumulado de deuda técnica y bugs de sesiones anteriores.

### ✅ Bugs corregidos al arranque

**Bug 1 — Deadlock Supabase / spinner infinito al cargar**
- **Root cause:** `onAuthStateChange` usaba un callback `async` que hacía `await fetchProfile(...)` directamente. Supabase sostiene su lock interno (`_initialize` vía `locks.ts`) mientras notifica suscriptores. La query de BD llama `getSession()` internamente, que hace `await this.initializePromise` — que nunca resuelve porque `_initialize` espera que el callback termine. Deadlock perfecto.
- **Fix:** El callback de `onAuthStateChange` ahora es síncrono. El `fetchProfile` se difiere con `setTimeout(0)` para ejecutarse en una nueva task, después de que el lock se libera.
- Archivo: `src/contexts/AuthContext.tsx`

**Bug 2 — 0 productos en el POS ("Sin resultados")**
- **Root cause:** Los IDs en la base de datos son UUIDs (strings). El código hacía `Number(v.id)` → `NaN`. Se filtró con `!isNaN(v.id)` → todos los productos eliminados. Además `productsMap[Number(v.product_id)]` nunca encontraba el producto → "Sin nombre".
- **Fix:** IDs cambiados a `string` en toda la cadena: types, ProductPanel, CartPanel, page.tsx.
- Archivos: `src/types/index.ts`, `src/app/(app)/pos/ProductPanel.tsx`, `src/app/(app)/pos/CartPanel.tsx`, `src/app/(app)/pos/page.tsx`

**Bug 3 — Hydration error en `<body>`**
- **Root cause:** Extensión del navegador inyecta atributos en `<body>` antes de que React hidrate.
- **Fix:** `suppressHydrationWarning` en `<body>`.
- Archivo: `src/app/layout.tsx`

---

## 🔖 Punto de retorno estable — `fase-3-estable`

**Estado:** POS completamente funcional — login, productos, búsqueda, filtros por categoría, carrito.

| | |
|---|---|
| **Tag git** | `fase-3-estable` |
| **Commit** | `2f5f4b7` |
| **Rama** | `master` |

### Cómo volver a este punto

```bash
# Opción A — Crear rama desde el punto estable (recomendado, no destruye nada)
git checkout -b recuperacion fase-3-estable

# Opción B — Ver qué había en ese punto sin cambiar nada
git show fase-3-estable --stat

# Opción C — Descartar TODO lo que vino después y volver aquí (destructivo)
git reset --hard fase-3-estable
```

---

## Sesión 11 — 2026-04-12 (pos-v2, continuación)

### ✅ Fase 4 — Turnos / Corte de caja `v0.5-turnos`

- `src/app/(app)/turnos/page.tsx` — 3 estados: sin turno / turno activo / cerrando
- Abrir turno: fondo inicial → inserta en `shifts` con `status: 'open'`
- Dashboard: stats en tiempo real (ventas, efectivo, tarjeta, efectivo estimado), indicador pulsante
- Movimientos de efectivo: modal Entrada/Salida con monto y motivo, registra en `cash_movements`
- Cerrar turno: resumen completo, conteo físico, diferencia sobrante/faltante automática
- Guard en POS: overlay bloqueante si no hay turno activo con botón "Ir a Turnos"

### ✅ Fase 5 — Pagos (efectivo + tarjeta) `v0.6-pagos`

- `src/app/(app)/pos/PaymentModal.tsx` — modal de cobro con métodos Efectivo y Tarjeta
- Efectivo: input de monto recibido, cambio automático, atajos de importes rápidos ($50/$100/$200/$500)
- Tarjeta: confirmación del total sin campos adicionales
- Transacción: insert `sales` → insert `sale_items` → decremento de stock con `Promise.allSettled`
- Rollback manual: borra la venta si `sale_items` falla
- `refreshKey` en `ProductPanel`: al completar una venta el panel de productos recarga el stock inmediatamente

### ✅ Fase 6 — Tickets e Impresión térmica `v0.7-tickets`

- `src/app/(app)/pos/Receipt.tsx` — exporta `Receipt` (preview en pantalla, fuente legible 14px) y `printReceipt()` (ventana 80mm para EPSON TM-T20II)
- `@page { size: 80mm auto; margin: 0 }` — imprime solo el largo del ticket, sin papel de sobra. Papel recomendado en driver: **Roll Paper 80 x 3276 mm**
- Auto-print: si `localStorage.pos_autoprint === 'true'` imprime automáticamente al registrar venta
- Nombre del negocio y pie de ticket desde `localStorage` (`pos_business_name`, `pos_receipt_footer`)
- Modal de éxito rediseñado: preview del ticket + botón "Imprimir" + botón "Nueva venta"
- `next.config.ts` — `typescript.ignoreBuildErrors: true` para errores de tipo de Supabase sin schema generado

### ✅ Fase 7 (parcial) — Inventario `commit c335f8f`

**7.1 — Lista de inventario**
- `src/app/(app)/inventario/page.tsx` — carga paginada (500/página, mismo patrón que POS), búsqueda en cliente instantánea, filtro "Solo con existencias"
- Tabla con columnas: Producto, Código, Categoría, Stock, Vencimiento, P. Venta, P. Costo, P. Mayoreo
- Badges de stock: 🟢 verde (sobre mínimo) / 🟡 amarillo (en o bajo mínimo) / 🔴 rojo (sin existencias)
- Colores de vencimiento: rojo (vencido / ≤7 días), amarillo (≤30 días), gris (>30 días)

**7.2 — Fecha de caducidad editable inline**
- Clic en la celda de vencimiento (solo `owner`) → input de fecha con borde acento
- Enter o blur guarda en Supabase y actualiza la tabla al instante; Escape cancela
- Variantes sin fecha muestran `+ fecha` clickeable para owners

**7.3 — Ajuste manual de stock**
- `src/app/(app)/inventario/AdjustModal.tsx` — modal con 3 tipos: Entrada (+), Salida (−), Corrección (=)
- Preview del stock resultante en tiempo real con color (verde sube, rojo baja, amarillo corrección)
- **En Entrada**: muestra campos de Costo, Precio Público y Precio Mayoreo pre-cargados — permite actualizar precios al recibir mercancía con diferente costo
- Motivo opcional (no bloquea el guardado)
- Registra en `inventory_adjustments` (no-fatal si falla) y actualiza la tabla al instante

---

## ✅ POS Completado (fases 8–11)

Fases completadas después de Sesión 11 (ver commits en git):
- **Fase 8** — Multi-ticket en espera, anular venta, pago mixto, precio mayoreo
- **Fase 9** — Clientes + Crédito (CustomerModal, AbonoModal, HistorialModal)
- **Fase 10** — Lealtad / Monedero electrónico
- **Fase 11** — Reportes con SVG puro (KPIs, gráfica de barras, top 10 productos)

---

## 🛍️ Tienda Online — `/tienda`

### Decisiones de arquitectura

- **Visibilidad automática:** todos los productos con `stock > 0` aparecen en la tienda. No hay toggle manual.
- **Auth de servidor:** todas las rutas API y server components de tienda usan `SUPABASE_SERVICE_ROLE_KEY` para bypassar RLS. El anon key no funciona sin sesión.
- **NO usar `@supabase/ssr`** — el proyecto usa `@supabase/supabase-js` directo.
- **Carrito:** persistido en `localStorage` con key `store_cart`. Contexto: `src/contexts/StoreCartContext.tsx`.
- **Categorías:** mapeo por keywords en `src/app/tienda/page.tsx` (PROTEINAS, GANADORES, PRE-ENTRENOS, CREATINAS, AMINOACIDOS, TERMOGENICOS, ACCESORIOS, SNACKS).
- **WhatsApp del negocio:** `NEXT_PUBLIC_STORE_WHATSAPP=524427086715` en `.env.local`.

### ✅ Fase 1 — Catálogo (`tienda-fase1-estable`)

- `src/app/tienda/layout.tsx` — layout oscuro, fuentes Syne + DM_Sans, StoreCartProvider, StoreNav, CartDrawer
- `src/app/tienda/page.tsx` — hero + sidebar de categorías + grid de productos con cards estilo Ghost Lifestyle
- `src/app/api/store/products/route.ts` — GET público con service role key, filtra variantes con stock > 0
- `src/components/tienda/` — StoreNav, CartDrawer, CartItem, ProductCard, ProductGrid, CategoryFilter, FlavorSelector
- `src/contexts/StoreCartContext.tsx` — cart con localStorage, hydration-safe
- `src/types/index.ts` — StoreVariant, StoreProduct añadidos al final

### ✅ Fase 2A — Detalle de producto + carrito (`tienda-fase2A-estable`)

- `src/app/tienda/productos/[productId]/page.tsx` — server component con service role key, sin filtro store_visible
- FlavorSelector activo: selección de sabor, precio dinámico, badge de stock, botón "Agregar al carrito"
- CartDrawer con lista de items, total, link a `/tienda/carrito`
- Configuración: sección "Tienda Online" en `/configuracion` con conteo de productos con stock

**Fix crítico:** el anon key en server-side routes devuelve 0 filas por RLS. Siempre usar service role key en API routes y server components de tienda.

### ✅ Fase 2B — Checkout + Órdenes (`2026-04-14`)

**SQL ejecutado en Supabase:**
```sql
CREATE TABLE store_orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), customer_name text NOT NULL, customer_phone text NOT NULL, notes text, total numeric(10,2) NOT NULL, status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now());
CREATE TABLE store_order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE, variant_id text NOT NULL, product_id text NOT NULL, product_name text NOT NULL, flavor text, quantity int NOT NULL, unit_price numeric(10,2) NOT NULL, subtotal numeric(10,2) NOT NULL);
CREATE INDEX idx_store_orders_status ON store_orders(status);
CREATE INDEX idx_store_orders_created ON store_orders(created_at DESC);
CREATE INDEX idx_store_order_items_order ON store_order_items(order_id);
```

**Archivos nuevos:**
- `src/app/tienda/carrito/page.tsx` — página de checkout: resumen de artículos, formulario (nombre, teléfono, notas), botón WhatsApp
- `src/app/api/store/orders/route.ts` — POST: crea `store_order` + `store_order_items`, retorna `order_id`

**Flujo:**
1. Usuario agrega al carrito → CartDrawer → "IR AL CHECKOUT" → `/tienda/carrito`
2. Llena nombre + teléfono → "Confirmar por WhatsApp"
3. La orden se guarda en Supabase **antes** de abrir WhatsApp
4. Se abre WhatsApp con mensaje pre-llenado al número del negocio (524427086715)
5. El carrito se limpia

**Nota importante:** la orden queda en DB aunque el cliente no envíe el mensaje de WhatsApp.

---

## Sesión 12 — 2026-04-15 (pos-v2)

### ✅ Fase 2C — Panel de órdenes en Configuración

**Archivos nuevos:**
- `src/components/tienda/StoreOrdersPanel.tsx` — panel completo de gestión de pedidos:
  - Filtros por estado: Todos / Pendientes / Confirmados / Listos / Entregados / Cancelados
  - Tarjetas de orden: `#shortId · fecha`, nombre del cliente, teléfono, resumen de artículos, notas, badge de estado
  - Dropdown para cambiar estado con actualización optimista y rollback si falla
  - Botón WhatsApp por orden para contactar al cliente directo
  - Botón recargar manual; error no-fatal (el resto de configuración sigue funcionando)
- `src/app/api/store/orders/[orderId]/route.ts` — PATCH: actualiza `status` de una orden (valida contra `VALID_STATUSES`)
- `src/lib/whatsapp.ts` — helper `openWhatsApp(phone, text)`:
  - Móvil: `wa.me` directo
  - Desktop: intenta `whatsapp://` (app nativa), detecta blur de ventana en 1.5s; fallback a `web.whatsapp.com`

**Archivos modificados:**
- `src/app/api/store/orders/route.ts` — GET agregado con filtro por status opcional
- `src/app/(app)/configuracion/page.tsx` — nueva sección "Pedidos de la tienda" con `<StoreOrdersPanel />`
- `src/types/index.ts` — `StoreOrderStatus`, `StoreOrderItem`, `StoreOrder` añadidos

### ✅ Checkout modal rediseñado

- `src/app/tienda/carrito/page.tsx` reescrito — modal overlay con:
  - Ícono WhatsApp en caja verde, título, callout "Sin pagos en línea"
  - Resumen compacto con total
  - Campos: Nombre, WhatsApp, Indicaciones (opcional)
  - Botón verde "Confirmar por WhatsApp" con spinner
  - Fix React Hooks: `useState(false)` movido antes de early returns

### ✅ Fase 3 — Auth de clientes para la tienda

**SQL ejecutado en Supabase (requerido antes de implementar):**
```sql
CREATE TABLE IF NOT EXISTS store_customers (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, phone TEXT, email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE store_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_customers_self" ON store_customers
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES store_customers(id) ON DELETE SET NULL;
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_orders_customer_read" ON store_orders FOR SELECT USING (customer_id = auth.uid());
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_order_items_customer_read" ON store_order_items
  FOR SELECT USING (EXISTS (SELECT 1 FROM store_orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));
```

**Archivos nuevos:**
- `src/lib/supabase-store.ts` — cliente Supabase aislado con `storageKey: 'store_sb'` para que la sesión de la tienda NO colisione con el POS
- `src/contexts/StoreAuthContext.tsx` — `StoreAuthProvider` + `useStoreAuth()`. Callback de `onAuthStateChange` síncrono; fetch de perfil diferido con `setTimeout(0)` para evitar deadlock de Supabase
- `src/app/api/store/auth/register/route.ts` — POST: crea usuario en `auth.users` (service role, `email_confirm: true`) + perfil en `store_customers`; rollback con `deleteUser` si falla el perfil
- `src/app/tienda/auth/login/page.tsx` — login con email/password, redirige a `/tienda/cuenta/pedidos` si ya hay sesión
- `src/app/tienda/auth/registro/page.tsx` — registro + auto-login al crear cuenta
- `src/app/tienda/cuenta/layout.tsx` — guard: redirige a `/tienda/auth/login` si no hay sesión
- `src/app/tienda/cuenta/pedidos/page.tsx` — historial de pedidos del cliente; usa `getStoreSupabase()` directo (RLS filtra por `customer_id = auth.uid()`)

**Archivos modificados:**
- `src/app/tienda/layout.tsx` — envuelve en `<StoreAuthProvider>`
- `src/components/tienda/StoreNav.tsx` — botón "Mi cuenta" → si hay sesión muestra primer nombre + link a pedidos; si no hay sesión link a login
- `src/app/tienda/carrito/page.tsx` — incluye `customer_id` en el POST si el usuario está logueado; checkbox "Hacer pedido para otra persona": pre-llena con datos del cliente registrado, toggle limpia/restaura campos
- `src/app/api/store/orders/route.ts` — acepta y persiste `customer_id` en el insert

**Flujo completo Fase 3:**
1. Cliente navega a `/tienda` → ve "Mi cuenta" en la nav
2. Se registra → auto-login → redirige a `/tienda/cuenta/pedidos`
3. Al hacer pedido, el `customer_id` se vincula al `store_order` automáticamente
4. En la página de pedidos, RLS de Supabase filtra solo sus órdenes
5. Botón "Cerrar sesión" en la página de cuenta

---

## Sesión 13 — 2026-04-15 (pos-v2)

### ✅ Fix POS — Carrito desaparecía tras cargar productos

**Síntoma:** Al entrar al POS, el carrito se veía mientras cargaban los productos, pero en cuanto terminaba de cargar desaparecía.

**Root cause:** `ProductPanel` usa `flex-1` como hijo de un contenedor flex. Sin `min-w-0`, CSS flexbox permite que el ítem se expanda más allá de su parte del ancho (el grid de productos y las tarjetas de categorías lo ensanchaban). Esto empujaba `CartPanel` fuera de la pantalla hacia la derecha.

**Fix:** Agregado `min-w-0 overflow-hidden` a los tres `return` de `ProductPanel` (loading, error y el return principal).

- Archivo: `src/app/(app)/pos/ProductPanel.tsx`

### ✅ Fix POS — Filtro de categorías dinámico

Las categorías ahora se derivan directamente de los datos reales en BD (en lugar de una lista hardcodeada). Se construyen con `.trim().toUpperCase()` en ambos lados del filtro para garantizar que siempre coincidan con los valores reales de Supabase, independientemente de cómo estén guardados.

- Archivo: `src/app/(app)/pos/ProductPanel.tsx`

### ✅ Fix POS — Botón editar precio en el carrito

**Problema:** El botón ✏️ para editar el precio unitario de un producto en el carrito no era visible (estaba con `opacity-40` sobre fondo oscuro, prácticamente invisible).

**Fix:** Cambiado a color ámbar (`var(--accent)`) con `opacity: 0.7`. Al hacer clic se abre un input inline; Enter confirma, Escape cancela.

**Archivos:**
- `src/app/(app)/pos/CartPanel.tsx` — botón de edición visible + `onPriceChange` prop
- `src/app/(app)/pos/page.tsx` — `setPriceOverride` callback conectado

### ✅ Fix Cloudinary — Error 500 al subir imágenes

**Causas identificadas:**

1. **En producción:** Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` no estaban en el archivo `.env.production` del VPS. Solo había variables de Supabase y Resend. **Fix:** agregar las 3 variables manualmente en el VPS con `nano /var/www/pos-v2/.env.production` + `pm2 restart pos-v2`.

2. **En el route:** `crop: 'pad'` + `background: 'auto'` puede requerir plan de pago de Cloudinary. `fetch_format` no es el parámetro correcto del SDK para forzar el formato. **Fix:** cambiado a `crop: 'fill'` + `format: 'webp'` (elimina la necesidad de color de fondo).

3. **Error silencioso:** PhotoManager lanzaba `"Error al subir a Cloudinary"` genérico sin mostrar el detalle real. **Fix:** el route ahora retorna `error.message` en el JSON, y PhotoManager lo muestra en pantalla.

**Archivos:**
- `src/app/api/cloudinary/route.ts` — transformación simplificada + mejor mensaje de error
- `src/components/PhotoManager.tsx` — muestra el error real del servidor en la UI

### ✅ Deploy a Hostinger

- Commit: `88cc7fe` — todos los fixes anteriores
- Push a `main` → `git pull` + `npm run build` + `pm2 reload pos-v2` en el VPS
- Variables de Cloudinary agregadas a `/var/www/pos-v2/.env.production` manualmente

---

## ⏳ Pendiente — Próxima sesión

### Fase 5 — SEO + Performance
- Metadata dinámica por producto (`generateMetadata` en `tienda/productos/[productId]`)
- Sitemap automático (`app/sitemap.ts`)
- Loading skeletons mientras cargan los productos

---

## 🎨 Encabezado Neon Energy — Plan de implementación (Opción 3)

> Diseño exportado desde Claude Design (`claude.ai/design`).  
> Archivo final de referencia: `Encabezado Chocholand v2.html` (bundle descargado vía API).

### Descripción del diseño

Estilo **gaming/esports** — fondo oscuro casi negro-morado, partículas rojas flotantes, efecto glitch en el logo, scanlines, y texto hero con efecto neon rojo pulsante. Toda la animación se reinicia automáticamente cada 8 segundos (truco `key` de React).

---

### Archivos a modificar

#### 1. `src/app/tienda/layout.tsx` — Agregar fuentes Barlow

El diseño usa `Barlow Condensed` (700, 900) y `Barlow` (400, 600) de Google Fonts.  
Se añaden junto a las fuentes actuales (Syne + DM Sans) con `next/font/google`.

```tsx
import { Syne, DM_Sans, Barlow_Condensed, Barlow } from 'next/font/google'
```

Las variables CSS nuevas: `--font-barlow-condensed`, `--font-barlow`.

---

#### 2. `src/components/tienda/StoreNav.tsx` — Navbar neon

Reemplaza la barra actual (negra/amarilla) por la navbar de la Opción 3.

| Elemento | Diseño actual | Diseño nuevo |
|---|---|---|
| Fondo | `rgba(10,10,10,0.92)` | `rgba(5,0,5,0.92)` |
| Borde inferior | `#1A1A1A` | `rgba(200,20,20,0.5)` (rojo) |
| Logo | Solo texto | Foto circular 44×44px con borde rojo + glow |
| Texto "CHOCHOLAND" | Amarillo estático | Blanco con animación `neonFlicker` rojo |
| "Mi cuenta" | Gris / ámbar | Rojo `#cc2020`, uppercase, letter-spacing |
| Ícono carrito | Borde gris | Borde rojo `rgba(200,20,20,0.7)` + glow |

**Funcionalidad que se mantiene intacta:**
- Badge de cantidad en el carrito (`itemCount`)
- `openCart()` al hacer clic en el ícono
- Link a `/tienda/cuenta/pedidos` si hay sesión activa
- Link a `/tienda/auth/login` si no hay sesión

**Animaciones CSS a agregar (como `<style>` dentro del componente o en `globals.css`):**
```css
@keyframes neonFlicker { /* flicker del texto CHOCHOLAND */ }
@keyframes navSlide    { /* entrada desde arriba al montar */ }
```

---

#### 3. `src/app/tienda/page.tsx` — Reemplazar componente `Hero`

El `Hero` actual es texto estático sobre fondo oscuro. El nuevo Hero tiene:

**Estructura de capas (de fondo a frente):**

| Capa | Z-Index | Descripción |
|---|---|---|
| Fondo | base | `linear-gradient(135deg, #050005, #0a0005, #050010)` |
| Scanlines estáticas | 2 | `repeating-linear-gradient` horizontal semitransparente |
| Scanline móvil | 3 | Línea roja 2px que baja con `animation: scanline 5s linear infinite` |
| Partículas (22) | 1 | Puntos rojos/naranjas con drift aleatorio hacia arriba (`particleDrift`) |
| Anillos shockwave (×3) | 4 | Círculos que explotan del centro al montar (`shockwave 1.4s`) |
| Líneas de energía (×3) | 4 | Líneas horizontales que se expanden desde el centro |
| **Logo central** | 6 | 220×220px con borde neon pulsante + glow rojo + glitch overlay encima |
| **Texto hero** | 8 | Bottom-left: subtítulo + "ELEVA TU" + "RENDIMIENTO" |
| Texto vertical | 5 | "CHOCHOLAND · SUPLEMENTOS DEPORTIVOS · 2025" rotado a la derecha |

**Texto hero (tamaños finales según v2):**
- Subtítulo: `fontSize: 15`, `letterSpacing: 5`, color rojo `#cc2020`  
  → `"⬛ NUTRICIÓN DEPORTIVA · SUPLEMENTOS"`
- Línea 1: `fontSize: 86`, `fontWeight: 900`, color blanco, fuente Barlow Condensed  
  → `"ELEVA TU"` (con animación glitch)
- Línea 2: `fontSize: 86`, color `#ff2020`, animación `neonFlicker`  
  → `"RENDIMIENTO"`

**Logo:**  
⚠️ Confirmar ruta antes de implementar. El prototipo usa `uploads/303479618_...jpg`.  
En el proyecto real, buscar en `public/` o usar URL de Cloudinary.

**Replay cada 8 segundos:**
```tsx
const [key, setKey] = useState(0)
useEffect(() => {
  const t = setInterval(() => setKey(k => k + 1), 8000)
  return () => clearInterval(t)
}, [])
// ...
<div key={key} ...> {/* todo el hero */} </div>
```

**Prop `onShopClick` se mantiene** para el scroll suave al catálogo.

---

### Animaciones CSS requeridas

```css
@keyframes glitch1         { /* desplazamiento de clip-path en franjas */ }
@keyframes neonFlicker     { /* parpadeo text-shadow rojo */ }
@keyframes particleDrift   { /* partícula sube 400px con translateX aleatorio */ }
@keyframes scanline        { /* línea baja de -100% a 600px */ }
@keyframes neonBorderPulse { /* borde del logo oscila entre tenue y brillante */ }
@keyframes logoGlow        { /* drop-shadow del logo pulsa */ }
@keyframes energyLine      { /* línea horizontal se expande desde el centro */ }
@keyframes navSlide        { /* navbar entra desde arriba */ }
@keyframes heroTextSlide   { /* texto hero entra desde la izquierda */ }
@keyframes logoScale       { /* logo aparece escalando */ }
@keyframes fadeUp          { /* texto vertical aparece subiendo */ }
@keyframes shockwave       { /* anillo escala de 0.5× a 5× y desaparece */ }
```

Pueden ir en `globals.css` (para reutilizar) o como `<style>` dentro de cada componente.

---

### Lo que NO cambia
- Funcionalidad de carrito y autenticación
- Catálogo de productos debajo del hero
- Sidebar de categorías
- `CartDrawer`
- Rutas de checkout y órdenes

---

### Pendiente confirmar antes de ejecutar
- [ ] Ruta real del logo de Chocholand (¿`public/logo.jpg`? ¿URL Cloudinary?)
- [ ] ¿Añadir animaciones en `globals.css` o como `<style>` inline en cada componente?
