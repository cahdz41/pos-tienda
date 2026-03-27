# Offline-First POS — Diseño Técnico

**Fecha:** 2026-03-25
**Stack:** Next.js 16 · React 19 · Supabase · Dexie.js (IndexedDB) · TypeScript
**Estrategia:** PWA + Dexie.js + Cola de sincronización

---

## 1. Contexto y Objetivos

El POS debe seguir funcionando cuando el Wi-Fi se cae (1–2 veces/mes, ~15–30 min). El sistema se venderá como SaaS por licencia: cada cliente tiene su propio proyecto Supabase — la arquitectura offline no requiere infraestructura adicional ni costo por cliente.

**Objetivos:**
- El cajero puede vender (efectivo/tarjeta) sin internet
- El cajero puede consultar inventario sin internet
- Las ventas realizadas offline se sincronizan automáticamente al reconectar
- La arquitectura es compatible con multi-sucursal (a implementar en el futuro)

**Fuera de scope:**
- Ventas a crédito offline (riesgo de sobregiro)
- Clientes, Turnos, Reportes, Configuración offline
- Múltiples terminales simultáneas sin conexión en la misma sucursal

---

## 2. Arquitectura

### Capas

```
[React Components]
       ↕
[SyncEngine — src/lib/sync.ts]
       ↕                    ↕
[Supabase]            [Dexie.js — IndexedDB]
(cuando online)       (siempre disponible)
```

### Flujo por estado de red

**Lecturas (siempre desde Dexie):**
Los componentes SIEMPRE leen de Dexie — online u offline. Esto hace la transición transparente: el cajero no nota diferencia al perder conexión. Dexie se mantiene actualizado mediante syncs periódicos.

**Escrituras online:**
Los componentes llaman a SyncEngine → SyncEngine inserta en Supabase → al confirmar, actualiza Dexie con el resultado real (stock correcto).

**Escrituras offline:**
Los componentes llaman a SyncEngine → SyncEngine detecta que no hay red → escribe en Dexie optimistamente + encola en `offline_queue`.

**Al reconectar:**
SyncEngine detecta reconexión → llama a `flushQueue()` → sube cada venta de la cola a Supabase una por una → refresca el catálogo desde Supabase → vacía la cola.

---

## 3. Capa de Datos — IndexedDB (Dexie)

### Tablas locales

| Tabla Dexie | Fuente Supabase | Sync | Propósito |
|---|---|---|---|
| `product_variants` | `product_variants` + `products` (join) | Al abrir app / al reconectar | Catálogo completo para POS e Inventario |
| `active_shift` | `shifts` (solo el activo) | Al abrir/cerrar turno | Asociar ventas offline al turno correcto |
| `offline_queue` | — (solo local) | Se vacía al reconectar | Cola de ventas pendientes |
| `sync_meta` | — (solo local) | Siempre | Timestamp del último sync exitoso |

### Schema Dexie (`src/lib/db.ts`)

```typescript
// product_variants: índice por id, barcode, product_id
// active_shift: registro único (id = 'current')
// offline_queue: índice por id, created_at, status
// sync_meta: clave 'last_catalog_sync'
```

### Estrategia de stock offline

Al vender offline → stock se decrementa optimistamente en Dexie.
Al reconectar → la venta se sube a Supabase (que decrementa el stock real).
Si hubo discrepancia → el catálogo se refresca desde Supabase post-sync: Supabase gana.

---

## 4. SyncEngine (`src/lib/sync.ts`)

Clase singleton que centraliza toda la lógica de red/local.

### Métodos principales

| Método | Descripción |
|---|---|
| `syncCatalog()` | Descarga todos los `product_variants` + `products` y los guarda en Dexie. Guarda timestamp en `sync_meta`. |
| `shouldResync()` | Retorna `true` si han pasado más de 30 min desde el último sync. |
| `processSale(payload)` | Si online: inserta en Supabase + actualiza Dexie. Si offline: guarda en `offline_queue` + decrementa stock en Dexie. |
| `flushQueue()` | Lee `offline_queue` con `status: 'pending'`, sube cada una a Supabase en orden, marca como `synced`. Llama `syncCatalog()` al final. |
| `getProducts(query?, category?)` | Siempre lee de Dexie (instantáneo, funciona offline). |

### Cola (`offline_queue`)

```typescript
interface QueueEntry {
  id: string           // uuid local
  created_at: string   // ISO timestamp
  status: 'pending' | 'synced' | 'error'
  payload: {
    sale: Omit<Sale, 'id'>
    items: Omit<SaleItem, 'id' | 'sale_id'>[]
    shift_id: string | null
  }
  error?: string       // mensaje si falló
}
```

---

## 5. Detección de Conexión

### Hook `useOnlineStatus` (`src/hooks/useOnlineStatus.ts`)

- Escucha eventos `window.online` / `window.offline`
- Al detectar reconexión → llama `SyncEngine.flushQueue()` automáticamente
- Expone `{ isOnline: boolean, queueCount: number }`

### Context `OfflineContext` (`src/contexts/OfflineContext.tsx`)

- Provee `isOnline`, `queueCount`, `lastSync` a toda la app
- Envuelve `(app)/layout.tsx`

---

## 6. UX Offline

### Banner global

Posición: debajo del header, encima del contenido principal (no bloquea el POS).

| Estado | Color | Contenido |
|---|---|---|
| Sin conexión | Rojo | "Sin conexión — X ventas en cola · Sync: hace Nm" |
| Sincronizando | Morado | "Sincronizando… X de Y ✓" |
| Reconectado | Verde (3s) | "Conectado — X ventas sincronizadas" |
| Online normal | Oculto | — |

### Sidebar en modo offline

- **POS** → habilitado (ámbar activo)
- **Inventario** → habilitado (consulta)
- **Clientes / Turnos / Reportes / Config** → opacidad 40%, `cursor: not-allowed`, tooltip "Requiere conexión"

### POS offline

- Búsqueda y escáner: funcionan contra Dexie (instantáneo)
- Badge `offline` en la barra de búsqueda
- Contador: "X productos en caché"
- Efectivo y Tarjeta: habilitados
- Crédito: botón con 🔒 y texto "Crédito — requiere conexión"

### Inventario offline

- Búsqueda, stock, precios, caducidad: visibles (solo lectura)
- Botones "Ajustar stock", "Editar precios", "Importar Excel": deshabilitados con 🔒
- Nota: "Última sincronización: hace Nm"

---

## 7. Archivos a Crear

| Archivo | Responsabilidad |
|---|---|
| `src/lib/db.ts` | Schema y instancia Dexie |
| `src/lib/sync.ts` | SyncEngine (catalog sync + processSale + flushQueue) |
| `src/hooks/useOnlineStatus.ts` | Detección de red + trigger de flush |
| `src/contexts/OfflineContext.tsx` | Provee estado offline a toda la app |
| `src/components/OfflineBanner.tsx` | Banner de estado (rojo/morado/verde) |

---

## 8. Archivos a Modificar

| Archivo | Cambio |
|---|---|
| `src/app/(app)/layout.tsx` | Envolver con `OfflineContext`, montar `OfflineBanner`, mostrar items del sidebar como deshabilitados según `isOnline` |
| `src/components/Sidebar.tsx` | Recibir `isOnline` y deshabilitar ítems no offline con estilo + tooltip |
| `src/app/(app)/pos/page.tsx` | `addToCart` y `ProductPanel` leen de SyncEngine (Dexie) en lugar de Supabase directo |
| `src/app/(app)/pos/ProductPanel.tsx` | `fetchAll` usa `SyncEngine.getProducts()` en lugar de query directa a Supabase |
| `src/app/(app)/pos/PaymentModal.tsx` | `processSale` delega a `SyncEngine.processSale()` en lugar de insertar directo |
| `src/app/(app)/inventario/page.tsx` | Leer desde Dexie cuando offline; deshabilitar botones de edición/ajuste según `isOnline` |
| `src/types/index.ts` | Agregar tipo `QueueEntry` |

---

## 9. PWA (Instalable)

Para que el POS sea instalable como app de escritorio (competir con Eleventa):

- Agregar `public/manifest.json` con nombre, íconos, `display: standalone`
- Agregar meta tags en `app/layout.tsx`
- Service Worker mínimo para que Chrome/Edge ofrezcan "Instalar aplicación"

El Service Worker **no** maneja la lógica offline — eso lo hace Dexie+SyncEngine. El SW solo habilita la instalación y cachea el shell de la app (HTML/CSS/JS).

---

## 10. Manejo de Errores

| Escenario | Comportamiento |
|---|---|
| Venta offline falla al subir | `status: 'error'` en queue, se reintenta en próximo flush |
| Catálogo no pudo sincronizar | Se usa el caché anterior (con banner de advertencia de timestamp) |
| App abierta sin haber sincronizado nunca | Pantalla de "Conecta a internet para iniciar" (primer uso siempre requiere red) |
| Turno no activo offline | Ventas se guardan sin `shift_id`, se reconcilian manualmente al reconectar |

---

## 11. Dependencias a Instalar

```bash
npm install dexie
npm install dexie-react-hooks   # hooks opcionales para reactividad
```

No se requieren dependencias de servidor ni cambios en Supabase.
