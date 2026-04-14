# Plan Nuevo POS — Reconstrucción Segura

> **Filosofía:** Cosas que funcionan, no innovación. Una sección a la vez. Versión estable antes de continuar.

---

## Lecciones aprendidas del proyecto anterior

Estos errores ya nos costaron tiempo. No repetirlos:

| Error | Lo que pasó | Regla nueva |
|---|---|---|
| `autoRefreshToken` | `@supabase/ssr` ignoraba nuestra opción y activaba timers que bloqueaban todas las queries tras inactividad | Siempre usar `createClient` de `@supabase/supabase-js` directo. Nunca `createBrowserClient` de `@supabase/ssr` |
| Sin versionado | Agregamos features que rompieron todo y no había dónde regresar | Commit + tag en cada fase completa antes de continuar |
| Middleware con nombre incorrecto | `proxy.ts` nunca fue ejecutado por Next.js (debe llamarse `middleware.ts`) | Solo usar el nombre exacto `src/middleware.ts` |
| Auth y DB mezclados | Layout devolvía `null` mientras cargaba auth → pantalla negra | Nunca devolver `null` desde el layout. Mostrar skeleton mínimo |
| Offline + PWA antes de estabilizar | La arquitectura offline-first agregó complejidad prematura que complicó el debug | Offline es una fase opcional al final, nunca al inicio |
| Tablas que no existen (combos) | Un `throw` en una query de tabla opcional rompía todo el POS | Tablas no-esenciales: siempre `console.warn`, nunca `throw` |

---

## Reglas fijas para TODO el proyecto

1. **Un commit por fase completa.** Antes de empezar la siguiente fase, hay un commit y un tag.
2. **Verificar en el navegador** antes de declarar una fase lista.
3. **La DB siempre responde al instante.** Si una query tarda, el usuario ve un skeleton — nunca pantalla en blanco ni spinner infinito.
4. **Standby sin drama.** El POS debe funcionar al regresar después de horas. La sesión se mantiene con `onAuthStateChange` + `persistSession: true` — sin timers, sin workarounds.
5. **Sin features extra.** No agregar lo que no está en el plan de la fase actual.
6. **El layout nunca devuelve null.** Siempre muestra algo (spinner/skeleton) mientras carga.

---

## Secciones del POS (qué vamos a reconstruir)

Estas son las secciones que tenía el POS anterior. Se integran una por una en el orden del plan:

- **POS (pantalla principal)** — grid de productos, búsqueda, filtro por categoría, lector de barras, carrito, totales
- **Pagos** — efectivo (cambio automático), tarjeta, crédito (cliente con límite), pago mixto
- **Tickets / Recibo** — impresión 80mm para EPSON TM-T20II, preview en pantalla, auto-print opcional
- **Venta en Espera** — pausar ticket actual, tener múltiples tickets simultáneos, recuperar
- **Anular venta** — cancelar venta de últimas 48h, restaurar stock
- **Turnos / Corte de caja** — abrir turno con fondo inicial, movimientos de efectivo, cerrar con conteo físico
- **Inventario** — lista paginada, búsqueda, ajuste de stock, edición de precios, fecha de caducidad, importar Excel
- **Clientes + Crédito** — alta/edición de clientes, abonar deuda, historial de cuenta
- **Programa de Lealtad (Monedero)** — $50 por cada $1,000 comprados, pagar con monedero
- **Reportes** — ventas por período, top productos, desglose por método de pago (SVG puro, sin librerías)
- **Configuración** — nombre del negocio, impresora (ancho papel, auto-print), pie de ticket

---

## Stack exacto a usar

```
Next.js (App Router, TypeScript, Tailwind)
Supabase (PostgreSQL + Auth)  ← createClient de @supabase/supabase-js DIRECTAMENTE
Cloudinary (imágenes, solo cuando se necesite)
```

**Dependencias a NO usar:**
- `@supabase/ssr` — fue la raíz del bug de inactividad
- Dexie / IndexedDB / PWA — complejidad prematura
- Librerías de gráficas — SVG puro como antes

---

## FASE 0 — Proyecto limpio y Git

### Objetivo
Repositorio nuevo, proyecto Next.js funcionando, Supabase conectado, primera protección de rutas.

### Pasos

**0.1 — Crear proyecto Next.js**
```bash
npx create-next-app@latest pos-v2 --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd pos-v2
```

**0.2 — Instalar dependencias**
```bash
npm install @supabase/supabase-js
npm install xlsx
```

**0.3 — Crear `src/` con estructura base**
```
src/
  app/
    layout.tsx          ← root layout sin auth
    login/page.tsx      ← página de login (placeholder por ahora)
    (app)/
      layout.tsx        ← layout protegido (sidebar + main)
      pos/page.tsx      ← placeholder "POS"
  lib/
    supabase.ts         ← createClient SINGLETON
  contexts/
    AuthContext.tsx      ← user, profile, loading, signOut
  types/
    index.ts            ← tipos compartidos
  middleware.ts         ← protección de rutas (NOMBRE EXACTO)
```

**0.4 — `src/lib/supabase.ts` — cliente singleton correcto**

```typescript
// REGLA: Siempre este patrón. Nunca @supabase/ssr.
import { createClient as _create } from '@supabase/supabase-js'

let _client: ReturnType<typeof _create> | null = null

export function createClient() {
  if (_client) return _client
  _client = _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,      // sesión sobrevive F5 y standby
        autoRefreshToken: true,    // renueva el token automáticamente (funciona porque usamos @supabase/supabase-js directo)
        detectSessionInUrl: false, // sin magic links
      }
    }
  )
  return _client
}
```

**0.5 — `src/middleware.ts` — protección de rutas**

```typescript
// Archivo OBLIGATORIAMENTE llamado middleware.ts en src/
// No proxy.ts, no auth.ts — SOLO middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // La sesión vive en localStorage (client-side).
  // El middleware solo redirige si no hay cookie de sesión.
  // La verificación real de auth la hace el AuthContext en el cliente.
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|login).*)'],
}
```

> **Nota:** Con `persistSession: true` y localStorage, la protección real ocurre en el client-side layout. El middleware es minimal — solo para cuando se necesite lógica server-side en el futuro.

**0.6 — `src/contexts/AuthContext.tsx` — sin timers, sin workarounds**

```typescript
'use client'
// REGLA: onAuthStateChange maneja TODO. No getSession() manual. No timers. No useEffect con polling.
// Si la sesión existe en localStorage, onAuthStateChange dispara INITIAL_SESSION automáticamente.
// Esto funciona correctamente al regresar de standby sin ningún código adicional.
```

La lógica interna:
- `onAuthStateChange` con `INITIAL_SESSION` → llena `user` y `loading = false`
- Si `session?.user` → carga `profile` de Supabase
- `signOut` → `supabase.auth.signOut()` + `window.location.replace('/login')`

**0.7 — `src/app/(app)/layout.tsx` — NUNCA devuelve null**

```typescript
'use client'
// REGLA: Mientras loading = true → mostrar skeleton/spinner mínimo
// NUNCA devolver null — causa pantalla negra
// Solo redirigir a login cuando loading = false y user = null
```

**0.8 — Variables de entorno**
```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=tu_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
```

**0.9 — Verificar en navegador**
- `npm run dev` → `localhost:3000`
- Sin sesión: debe mostrar la página de login
- Con sesión: debe mostrar el layout vacío con sidebar

### Commit de la Fase 0
```bash
git add -A
git commit -m "fase-0: proyecto base, auth, middleware, layout protegido"
git tag v0.1-base
git push origin main --tags
```

---

## FASE 1 — Login

### Objetivo
Login funcional con email/password. Usuario puede entrar y salir.

### Pasos

**1.1 — Diseño del login**
- Fondo oscuro `#0D0D12`
- Logo/nombre del negocio centrado
- Input de usuario (acepta username corto, agrega `@chocholand.com` automáticamente)
- Input de contraseña
- Botón "Entrar"
- Mensaje de error claro si falla

**1.2 — Lógica**
```typescript
const { error } = await supabase.auth.signInWithPassword({
  email: username.includes('@') ? username : `${username}@chocholand.com`,
  password,
})
if (error) setError('Usuario o contraseña incorrectos')
else router.replace('/pos')
```

**1.3 — Verificar**
- Login correcto → redirige a `/pos`
- Login incorrecto → muestra error
- F5 con sesión activa → no pide login de nuevo
- Cerrar y abrir el navegador → sigue con sesión (localStorage persiste)

### Commit Fase 1
```bash
git commit -m "fase-1: login funcional"
git tag v0.2-login
git push origin main --tags
```

---

## FASE 2 — Layout y Navegación

### Objetivo
Sidebar funcional con todas las rutas. Placeholders para cada sección.

### Pasos

**2.1 — Sidebar**
- Íconos + texto para cada ruta
- Ruta activa resaltada
- Avatar de usuario (inicial del nombre)
- Botón "Cerrar sesión"
- "Configuración" solo visible para rol `owner`

**2.2 — Rutas y placeholders**
Crear `page.tsx` mínimo en cada ruta:
- `/pos` — "Pantalla POS"
- `/inventario` — "Inventario"
- `/clientes` — "Clientes"
- `/turnos` — "Turnos"
- `/reportes` — "Reportes"
- `/configuracion` — "Configuración"

**2.3 — Roles**
Tabla `profiles` en Supabase con campo `role: 'owner' | 'cashier'`

**2.4 — Verificar**
- Navegar entre todas las rutas sin errores
- El rol `cashier` no ve Configuración
- Sidebar se mantiene en todas las páginas

### Commit Fase 2
```bash
git commit -m "fase-2: layout, sidebar, navegacion con placeholders"
git tag v0.3-layout
git push origin main --tags
```

---

## FASE 3 — Pantalla POS (productos + carrito)

> Esta es la fase más importante. Tiene que funcionar perfectamente antes de continuar.

### Objetivo
El cajero puede buscar productos, agregarlos al carrito y ver el total.

### Pasos

**3.1 — Schema DB (tablas mínimas para el POS)**
```sql
-- Verificar que existan en Supabase:
-- products (id, name, department)
-- product_variants (id, product_id, barcode, flavor, sale_price, wholesale_price, cost_price, stock, min_stock)
-- profiles (id, full_name, role)
```

**3.2 — Carga de productos — REGLA DE ORO**

La carga debe ser:
- Rápida: paginada con `.range()` en lotes de 500
- Sin bloqueo: mostrar los primeros productos mientras cargan los demás
- Con fallback de error visible (no pantalla negra ni spinner infinito)
- Timeout máximo de 15 segundos — si supera, mostrar botón "Reintentar"

```typescript
// ProductPanel.tsx — patrón de carga segura
async function loadProducts() {
  setLoading(true)
  setError(null)
  
  const LIMIT = 500
  let all: Variant[] = []
  let page = 0
  
  try {
    while (true) {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*, product:products(name, department)')
        .range(page * LIMIT, (page + 1) * LIMIT - 1)
        .order('id')
      
      if (error) throw error
      if (!data || data.length === 0) break
      
      all = [...all, ...data]
      if (data.length < LIMIT) break
      page++
    }
    setAllVariants(all)
  } catch (e) {
    setError('Error cargando productos. Toca aquí para reintentar.')
  } finally {
    setLoading(false)
  }
}
```

**3.3 — Búsqueda y filtros (100% en cliente, sin queries extra)**
- Búsqueda por nombre, sabor o código de barras
- Filtro por categoría/departamento
- 10 categorías ordenadas por prioridad del negocio
- Todo filtrado sobre el array en memoria — instantáneo

**3.4 — Lector de barras**
```typescript
// onKeyDown en el input de búsqueda
// Enter + código exacto → agregar al carrito + limpiar campo
// Enter + texto parcial → filtrar (no agregar)
```

**3.5 — Carrito**
- Lista de productos con cantidad y precio
- Controles `+` / `-` / eliminar por ítem
- Total automático
- Badges de cantidad en tarjetas del panel de productos

**3.6 — Verificar**
- Cargar el POS → productos aparecen en menos de 3 segundos
- Buscar por texto → filtra instantáneo
- Buscar por código de barras → agrega al carrito
- F5 → productos vuelven a cargar correctamente
- Dejar 30 minutos inactivo → regresar → productos cargan sin F5

### Commit Fase 3
```bash
git commit -m "fase-3: POS funcional — productos, busqueda, carrito"
git tag v0.4-pos-base
git push origin main --tags
```

---

## FASE 4 — Turnos / Corte de Caja

> Los turnos van antes de pagos porque cada venta necesita un `shift_id`.

### Objetivo
Cajero abre turno, registra movimientos, cierra turno con conteo físico.

### Schema
```sql
-- shifts (id, cashier_id, opening_amount, status, opened_at, closed_at, closing_amount, cash_difference)
-- cash_movements (id, shift_id, type: 'in'|'out', amount, reason, created_at)
-- Vista shift_summary (total ventas por método, movimientos)
```

### Pasos

**4.1 — Estados de la página de Turnos**
1. Sin turno abierto → formulario para abrir (fondo inicial)
2. Turno activo → dashboard con stats, lista de movimientos
3. Cerrando → resumen + conteo físico + diferencia

**4.2 — Abrir turno**
- Input: fondo inicial de caja
- Inserta en `shifts` con `status: 'open'`

**4.3 — Dashboard turno activo**
- Indicador visual pulsante "Turno activo"
- Stats: fondo inicial, total ventas, efectivo, tarjeta, crédito, efectivo estimado en caja
- Lista de movimientos manuales en tiempo real

**4.4 — Movimientos de efectivo**
- Modal Entrada/Salida con monto y motivo obligatorio
- Registra en `cash_movements`

**4.5 — Cerrar turno**
- Resumen completo automático
- Input: conteo físico de efectivo
- Cálculo automático de diferencia (sobrante/faltante)
- Confirmar cierre

**4.6 — Guard en el POS**
```typescript
// pos/page.tsx
// Si no hay turno activo → overlay bloqueante con botón "Ir a abrir turno"
// Esperar a que auth cargue (loading) antes de hacer la query de turno
```

**4.7 — Verificar**
- Abrir turno → ir al POS → overlay desaparece
- Cerrar turno → ir al POS → overlay aparece
- Las ventas registran `shift_id` correcto

### Commit Fase 4
```bash
git commit -m "fase-4: turnos y corte de caja"
git tag v0.5-turnos
git push origin main --tags
```

---

## FASE 5 — Pagos

### Objetivo
Cobrar ventas. Efectivo, tarjeta, crédito. Inserta en DB y descuenta stock.

### Pasos

**5.1 — Schema**
```sql
-- sales (id, shift_id, cashier_id, customer_id, total, payment_method, amount_paid, change_given, created_at)
-- sale_items (id, sale_id, variant_id, quantity, unit_price, subtotal)
```

**5.2 — PaymentModal — 3 métodos**
- **Efectivo:** input de monto recibido, cambio automático, atajos ($50, $100, $200, $500)
- **Tarjeta:** confirmar total, sin más campos
- **Crédito:** búsqueda de cliente, verificar límite disponible

**5.3 — Transacción de venta**
```typescript
// Orden exacto — si cualquier paso falla, no avanzar
// 1. Insertar en `sales` → obtener sale_id
// 2. Insertar en `sale_items` (bulk insert)
// 3. Decrementar stock en `product_variants` (por cada item)
// Si hay error en paso 2 o 3 → intentar rollback manual (borrar la sale)
```

**5.4 — Post-venta**
- Limpiar carrito
- Mostrar recibo (Receipt)
- Si `auto_print = true` → abrir ventana de impresión

**5.5 — Verificar**
- Venta en efectivo → sale y sale_items en DB, stock reducido
- Venta en tarjeta → igual
- Venta a crédito → `credit_balance` del cliente aumenta
- Recibo se muestra correctamente

### Commit Fase 5
```bash
git commit -m "fase-5: pagos (efectivo, tarjeta, credito)"
git tag v0.6-pagos
git push origin main --tags
```

---

## FASE 6 — Tickets / Recibo e Impresión

### Objetivo
Ticket imprimible en impresora térmica 80mm.

### Pasos

**6.1 — Receipt.tsx**
- Nombre del negocio (desde configuración en localStorage)
- Fecha y hora
- Lista de productos: nombre, cantidad, precio, subtotal
- Total, método de pago, monto recibido, cambio
- Pie de página configurable

**6.2 — Impresión**
```typescript
// Abrir ventana con @page { size: 80mm auto; margin: 0; }
// window.print() → corte automático en EPSON TM-T20II
```

**6.3 — Auto-print**
- Si `localStorage.autoprint = true` → imprimir automáticamente después de cada venta
- Toggle en Configuración

**6.4 — Verificar**
- Preview del ticket se ve correcto en pantalla
- Impresión genera el formato 80mm correcto

### Commit Fase 6
```bash
git commit -m "fase-6: recibos e impresion termica"
git tag v0.7-tickets
git push origin main --tags
```

---

## FASE 7 — Inventario

### Objetivo
Consultar y gestionar el catálogo de productos.

### Pasos

**7.1 — Lista de inventario**
- Tabla paginada (carga paginada igual que el POS)
- Búsqueda en cliente (instantánea sobre array en memoria)
- Filtro "Solo con existencias"
- Badges de stock: verde / amarillo (bajo) / rojo (en mínimo o cero)

**7.2 — Fecha de caducidad**
- Columna `expiration_date` en `product_variants`
- Colores: rojo (vencido / ≤7 días), amarillo (≤30 días), verde (>30 días)
- Editable inline para `owner`

**7.3 — Ajuste manual de stock**
- Modal con 3 tipos: Entrada (+), Salida (−), Corrección (absoluto)
- Preview del stock resultante en tiempo real
- Registra en `inventory_adjustments` con razón

**7.4 — Edición de precios inline**
- Solo para `owner`
- Clic en precio → input → Enter guarda
- Actualiza `sale_price`, `cost_price`, `wholesale_price`

**7.5 — Importar Excel**
- Columnas: `Código`, `Producto`, `P. Costo`, `P. Venta`, `P. Mayoreo`, `Existencia`
- Preview de primeros 20 registros
- `upsert` por barcode

**7.6 — Verificar**
- Lista carga correctamente
- Ajuste de stock refleja en DB y en POS
- Precios actualizados aparecen en el carrito del POS

### Commit Fase 7
```bash
git commit -m "fase-7: inventario completo"
git tag v0.8-inventario
git push origin main --tags
```

---

## FASE 8 — Features adicionales del POS

Una vez que el flujo base (FASES 3–6) funciona perfectamente.

### 8.1 — Venta en Espera (multi-ticket)
- Botón "Espera" en carrito → guarda en `localStorage`
- Badge con cantidad de tickets en espera
- Panel de tickets pausados → recuperar cualquiera
- Si hay carrito activo al recuperar → el activo va a espera primero
- Persiste entre recargas (localStorage)

### 8.2 — Anular venta
- Lista ventas completadas de últimas 48h
- Búsqueda por monto, cajero, cliente o producto
- Pantalla de confirmación con motivo opcional
- Marca `status = 'cancelled'` + restaura stock

### 8.3 — Pago mixto
- Múltiples métodos combinados: Efectivo + Tarjeta + Monedero
- Total debe cuadrar exactamente

### 8.4 — Precio de mayoreo
- Botón "May" en cada item del carrito (si `wholesale_price ≠ sale_price`)
- Toggle entre precio público y mayoreo

### Commit Fase 8
```bash
git commit -m "fase-8: features adicionales POS (espera, anular, mayoreo)"
git tag v0.9-pos-completo
git push origin main --tags
```

---

## FASE 9 — Clientes y Crédito

### Pasos

**9.1 — Lista de clientes**
- Avatar (inicial del nombre), nombre, teléfono, límite, saldo de deuda
- Barra de progreso verde/amarillo/rojo (deuda vs límite)
- Stats en header: total clientes, con deuda, monto pendiente
- Filtro "Con deuda"

**9.2 — Crear/Editar cliente**
- Nombre, teléfono, correo, dirección, límite de crédito, notas

**9.3 — Abonar a crédito**
- Panel: saldo / límite / disponible
- Atajos 25% / 50% / todo
- Selección efectivo / tarjeta
- Historial de últimos 8 abonos
- Trigger en Supabase actualiza `credit_balance`

**9.4 — Historial / Estado de cuenta**
- Timeline: compras a crédito + abonos mezclados por fecha
- Saldo corrido por movimiento

### Commit Fase 9
```bash
git commit -m "fase-9: clientes y credito"
git tag v1.0-clientes
git push origin main --tags
```

---

## FASE 10 — Programa de Lealtad (Monedero)

**Regla:** $50 de monedero por cada $1,000 gastados (solo en pagos no-monedero)

- Columnas en `customers`: `loyalty_balance`, `loyalty_spent`
- Al cobrar → si no es pago con monedero → calcular y acumular puntos
- En PaymentModal → opción "Monedero" si el cliente tiene saldo
- Pre-llenar con `min(saldo, total)`

### Commit Fase 10
```bash
git commit -m "fase-10: programa de lealtad y monedero"
git tag v1.1-lealtad
git push origin main --tags
```

---

## FASE 11 — Reportes

**Sin librerías de gráficas. Solo SVG puro.**

- Selector de período: Hoy / 7 días / Este mes / 30 días
- KPIs: ingresos, transacciones, ticket promedio, % efectivo
- Gráfica de barras SVG: ventas por día con tooltip hover
- Desglose por método de pago: barras horizontales con %
- Top 10 productos más vendidos: tabla con ranking, unidades, ingresos

### Commit Fase 11
```bash
git commit -m "fase-11: reportes con SVG"
git tag v1.2-reportes
git push origin main --tags
```

---

## FASE 12 — Configuración

- Nombre del negocio y pie de ticket
- Configuración de impresora: ancho de papel (58mm / 80mm), auto-print
- Ticket de prueba
- Todo guardado en `localStorage` (no necesita DB)

### Commit Fase 12
```bash
git commit -m "fase-12: configuracion"
git tag v1.3-configuracion
git push origin main --tags
```

---

## FASE 13 — Deploy a Producción

Solo cuando TODAS las fases anteriores estén verificadas localmente.

**Checklist antes de deploy:**
- [ ] Login funciona
- [ ] POS carga productos
- [ ] Se puede realizar una venta completa
- [ ] Turnos abren y cierran correctamente
- [ ] Inventario muestra y ajusta stock
- [ ] No hay errores en consola del navegador
- [ ] Probado después de 30+ minutos de inactividad (standby test)

**Proceso de deploy:**
```bash
# 1. Push a main → GitHub Actions despliega automáticamente
git push origin main

# 2. En el VPS (si se necesita intervención manual):
/usr/lib/node_modules/pm2/bin/pm2 reload pos-tienda
/usr/lib/node_modules/pm2/bin/pm2 logs pos-tienda

# 3. Verificar en https://pos-storeonline.duckdns.org
```

---

## Resumen del orden de trabajo

```
FASE 0  → Proyecto limpio + Git           → tag v0.1
FASE 1  → Login                           → tag v0.2
FASE 2  → Layout + Sidebar                → tag v0.3
FASE 3  → POS: productos + carrito        → tag v0.4  ← NÚCLEO
FASE 4  → Turnos / Corte de caja          → tag v0.5
FASE 5  → Pagos (efectivo/tarjeta/crédito)→ tag v0.6
FASE 6  → Tickets / Impresión             → tag v0.7
FASE 7  → Inventario                      → tag v0.8
FASE 8  → Features POS (espera, anular)   → tag v0.9
FASE 9  → Clientes + Crédito              → tag v1.0
FASE 10 → Lealtad / Monedero              → tag v1.1
FASE 11 → Reportes                        → tag v1.2
FASE 12 → Configuración                   → tag v1.3
FASE 13 → Deploy                          → producción
```

---

## Checklist de verificación por fase (standby test)

Antes de marcar cualquier fase como completa, hacer esta prueba:

1. Completar la feature
2. Dejar el navegador abierto **30 minutos sin tocar nada**
3. Regresar y usar la feature
4. **Si funciona sin F5 → fase aprobada**
5. Si requiere F5 → hay un bug de sesión/auth que resolver antes de continuar

---

*Creado: 2026-04-10 | Basado en lecciones del proyecto pos+tienda original*
