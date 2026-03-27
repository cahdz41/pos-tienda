# Clientes + Monedero de Lealtad — Diseño

## Goal

Ampliar el módulo de Clientes para registrar clientes generales (con y sin crédito), acumular su historial de compras, y otorgar un monedero electrónico de lealtad ($50 por cada $1,000 gastados). Añadir pagos mixtos en el POS (efectivo + tarjeta + transferencia + monedero), todo de forma opcional para no friccionar ventas rápidas.

## Architecture

El sistema extiende el modelo existente de forma aditiva. La tabla `customers` recibe tres columnas nuevas. Se crean dos tablas nuevas: `loyalty_transactions` para auditoría del monedero y `sale_payments` para registrar múltiples métodos de pago por venta. La lógica de crédito existente no se modifica. El campo `payment_method` en `sales` se conserva por retrocompatibilidad; las ventas nuevas siempre usan `sale_payments`.

## Tech Stack

- Next.js 16.2 App Router (TypeScript, `'use client'`)
- Supabase PostgreSQL + RLS
- Mismo estilo visual: dark theme, amber accent, CSS-in-JS inline `<style>`

---

## 1. Base de Datos

### 1.1 Cambios a `customers`

```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS whatsapp TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS loyalty_balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_spent   NUMERIC(10,2) NOT NULL DEFAULT 0;
```

- `whatsapp` — identificador principal de búsqueda en POS y página de clientes. Único por cliente.
- `loyalty_balance` — saldo disponible en el monedero (puede usarse en el POS).
- `loyalty_spent` — acumulado total de compras pagadas con métodos distintos al monedero. Cada vez que cruce un múltiplo de $1,000 se acreditan $50 al balance.

### 1.2 Nueva tabla `loyalty_transactions`

```sql
CREATE TABLE loyalty_transactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id     UUID REFERENCES sales(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('earned', 'redeemed')),
  amount      NUMERIC(10,2) NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

- `earned` — se acreditaron $50 al monedero (al cruzar umbral de $1,000).
- `redeemed` — el cliente usó su saldo en una venta.

RLS: SELECT/INSERT para authenticated; sin UPDATE/DELETE (inmutable para auditoría).

### 1.3 Nueva tabla `sale_payments`

```sql
CREATE TABLE sale_payments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id    UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method     TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'wallet')),
  amount     NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Permite múltiples filas por venta (una por método utilizado). Las ventas sin cliente vinculado nunca tendrán una fila con `method = 'wallet'`.

RLS: SELECT/INSERT para authenticated.

---

## 2. Tipos TypeScript

```typescript
// Añadir a Customer
whatsapp: string | null
loyalty_balance: number
loyalty_spent: number

// Nueva interfaz
export interface LoyaltyTransaction {
  id: string
  customer_id: string
  sale_id: string | null
  type: 'earned' | 'redeemed'
  amount: number
  notes: string | null
  created_at: string
}

// Nueva interfaz
export interface SalePayment {
  id: string
  sale_id: string
  method: 'cash' | 'card' | 'transfer' | 'wallet'
  amount: number
  created_at: string
}
```

---

## 3. Página de Clientes (`/clientes`)

### 3.1 Lista principal

Tabla con columnas:
- **Cliente** — nombre
- **WhatsApp** — número (con link directo `https://wa.me/52XXXXXXXXXX` si se quiere futuro)
- **Monedero** — saldo disponible en verde si > 0
- **Crédito** — columna visible solo si el cliente tiene `credit_limit > 0`; muestra barra de progreso igual a la actual
- **Última compra** — fecha de la venta más reciente vinculada
- **Acciones** — Ver detalle, Editar, Abonar (solo si tiene deuda)

Filtros:
- Búsqueda por nombre o WhatsApp
- Toggle "Con crédito"
- Toggle "Con saldo en monedero"

### 3.2 Formulario de cliente (crear/editar)

Campos:
- Nombre (requerido)
- WhatsApp (requerido, validación de unicidad en tiempo real igual al barcode en Productos)
- Teléfono (opcional)
- Email (opcional)
- Dirección (opcional)
- Notas (opcional)
- Sección colapsable "Habilitar crédito": activa campos `credit_limit`. Si se desactiva y el cliente tiene deuda, se muestra advertencia y no se permite.

El `loyalty_balance` y `loyalty_spent` no son editables desde el formulario — se gestionan automáticamente.

### 3.3 Modal de detalle del cliente

Encabezado con nombre, WhatsApp, fecha de registro.

**Resumen de lealtad:**
- Monedero disponible: `$XX.00`
- Total acumulado: `$X,XXX.00`
- Próxima recompensa: `te faltan $XXX para ganar $50`
  (calculado: `1000 - (loyalty_spent % 1000)`)

Tres tabs:
1. **Historial de compras** — lista de todas las ventas vinculadas (fecha, total, métodos de pago usados). Paginado o scroll infinito.
2. **Movimientos del monedero** — lista de `loyalty_transactions` (ganó/usó, monto, fecha, referencia de venta).
3. **Estado de cuenta** — visible solo si tiene crédito activo. Idéntico al historial actual de crédito.

---

## 4. POS — Pagos Mixtos

### 4.1 Búsqueda de cliente (opcional)

Al inicio del PaymentModal aparece un campo de búsqueda por WhatsApp.
- Si se encuentra: muestra nombre y saldo del monedero disponible
- Si no se encuentra: opción de registrar nuevo cliente desde ahí (modal rápido con solo nombre + WhatsApp)
- Si el cliente no quiere registrarse: se omite completamente, la venta avanza sin cliente vinculado

### 4.2 Selección de métodos de pago

Reemplaza el selector único actual. Cuatro métodos:

| Método | Campo de monto | Notas |
|--------|---------------|-------|
| Efectivo | Editable | Calcula cambio si supera el total |
| Tarjeta | Editable | — |
| Transferencia | Editable | — |
| Monedero | Auto-rellena con `loyalty_balance` | Solo activo si hay cliente con saldo > 0 |

El cajero activa solo los métodos que va a usar. Un indicador muestra:
- `Asignado: $X,XXX.00 / Total: $X,XXX.00`
- El botón "Cobrar" solo se habilita cuando `asignado >= total`
- El cambio se calcula únicamente sobre el monto en efectivo

### 4.3 Post-venta (lógica de lealtad)

Al completar la venta con cliente vinculado:

1. Insertar filas en `sale_payments` (una por método activo)
2. Calcular base de acumulación: `suma de métodos distintos a wallet`
3. Actualizar `loyalty_spent += base`
4. Calcular recompensas ganadas:
   ```
   nuevo_total = loyalty_spent_anterior + base
   recompensas = floor(nuevo_total / 1000) - floor(loyalty_spent_anterior / 1000)
   monto_ganado = recompensas * 50
   ```
5. Si `monto_ganado > 0`: actualizar `loyalty_balance += monto_ganado` e insertar en `loyalty_transactions` (type: 'earned')
6. Si se usó monedero: insertar en `loyalty_transactions` (type: 'redeemed', amount: monto_wallet)

### 4.4 Ticket

Al final del ticket impreso (si hay cliente vinculado):
```
────────────────────────────
Cliente: Juan Pérez
Monedero disponible: $50.00
Próxima recompensa: faltan $320
────────────────────────────
```

---

## 5. Reglas de negocio

- El campo WhatsApp es **requerido** al crear un cliente desde la página de Clientes.
- Desde el POS, si se crea un cliente rápido (nombre + WhatsApp), el WhatsApp también es requerido.
- Un cliente sin crédito puede tener saldo en monedero y viceversa — son sistemas independientes.
- El monedero se usa **completo** — no se puede usar una fracción.
- La acumulación de lealtad solo cuenta sobre los métodos `cash`, `card`, `transfer` — nunca sobre `wallet`.
- Las ventas sin cliente vinculado no generan lealtad.
- `loyalty_transactions` es inmutable — no se puede editar ni borrar (solo INSERT por RLS).
- Si una venta se cancela (void), **no** se revierte la lealtad ganada en esa venta (simplicidad operativa).

---

## 6. Archivos afectados

| Archivo | Acción |
|---------|--------|
| `src/lib/schema_lealtad.sql` | Crear — migraciones SQL |
| `src/types/index.ts` | Modificar — nuevos tipos |
| `src/app/(app)/clientes/page.tsx` | Modificar — rediseño completo |
| `src/app/(app)/pos/PaymentModal.tsx` | Modificar — pagos mixtos + cliente + lealtad |
