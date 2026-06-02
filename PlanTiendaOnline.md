# Plan: Tienda Online — Sincronizada con POS-v2

> Documento de referencia para implementar la tienda online.
> Seguir las fases en orden. No saltarse fases.

---

## Resumen ejecutivo

- Misma app Next.js, nuevo route group `(tienda)`
- Misma BD Supabase — productos y stock compartidos con el POS
- Stock sincronizado en tiempo real vía Supabase Realtime
- Diseño dark premium inspirado en Ghost Lifestyle
- Pago v1: "pagar al recibir" + WhatsApp (MercadoPago es Fase futura)

---

## 1. Cambios en base de datos

### SQL a ejecutar en Supabase (Panel > SQL Editor)

#### Paso 1 — Campos nuevos en tablas existentes

```sql
-- Visibilidad en tienda + imagen + descripción por producto
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS store_visible     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_url         TEXT,
  ADD COLUMN IF NOT EXISTS store_description TEXT;

-- Imagen específica por variante (sobrescribe la del producto)
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS image_url TEXT;
```

> `store_visible = false` por default es intencional — el dueño activa cada producto manualmente.
> Evita que aparezcan productos sin imagen el día 1.

#### Paso 2 — Tablas nuevas

```sql
-- Clientes de la tienda (separados de cashiers del POS)
CREATE TABLE store_customers (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  phone      TEXT,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Órdenes generadas desde la tienda
CREATE TABLE store_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES store_customers(id) ON DELETE SET NULL,
  customer_name  TEXT NOT NULL,
  customer_phone TEXT,
  customer_email TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','ready','delivered','cancelled')),
  payment_method TEXT NOT NULL DEFAULT 'on_delivery'
                 CHECK (payment_method IN ('on_delivery','whatsapp')),
  subtotal       NUMERIC(10,2) NOT NULL,
  total          NUMERIC(10,2) NOT NULL,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Items de cada orden
CREATE TABLE store_order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  flavor       TEXT,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(10,2) NOT NULL
);

-- Índices
CREATE INDEX idx_store_orders_status    ON store_orders(status);
CREATE INDEX idx_store_orders_created   ON store_orders(created_at DESC);
CREATE INDEX idx_store_order_items_order ON store_order_items(order_id);
```

> Las órdenes online son SEPARADAS de `sales` del POS — tienen ciclo de vida distinto
> (pending → confirmed → delivered) y no tienen shift_id ni cashier_id.

#### Paso 3 — Row Level Security

```sql
-- store_customers: cada cliente ve solo sus datos
ALTER TABLE store_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_customers_self" ON store_customers
  FOR ALL USING (auth.uid() = id);

-- store_orders: clientes ven las suyas (owners usan service key en API)
ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_orders_self" ON store_orders
  FOR SELECT USING (customer_id = auth.uid());

-- store_order_items: acceso via la orden del cliente
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_order_items_via_order" ON store_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM store_orders o
      WHERE o.id = store_order_items.order_id
        AND o.customer_id = auth.uid()
    )
  );

-- products: lectura pública solo de productos visibles en tienda
CREATE POLICY "products_store_read" ON products
  FOR SELECT USING (store_visible = true);
```

---

## 2. Estructura de rutas Next.js

```
src/app/
├── (app)/                              # POS — SIN CAMBIOS
│   ├── layout.tsx                      # AuthProvider POS — SIN CAMBIOS
│   ├── pos/
│   ├── inventario/
│   ├── configuracion/
│   │   └── page.tsx                    # MODIFICAR: agregar sección "Tienda Online"
│   ├── clientes/
│   ├── turnos/
│   └── reportes/
│
├── (tienda)/                           # NUEVO route group
│   ├── layout.tsx                      # StoreAuthProvider, navbar, CSS vars tienda
│   ├── page.tsx                        # Home: hero + categorías + grid
│   ├── productos/
│   │   └── [productId]/
│   │       └── page.tsx                # Detalle con selector de sabor
│   ├── carrito/
│   │   └── page.tsx                    # Carrito + checkout
│   ├── cuenta/
│   │   ├── layout.tsx                  # Requiere auth de tienda
│   │   ├── pedidos/
│   │   │   └── page.tsx                # Historial de pedidos
│   │   └── perfil/
│   │       └── page.tsx
│   └── auth/
│       ├── login/
│       │   └── page.tsx
│       └── registro/
│           └── page.tsx
│
├── api/
│   ├── admin/cashiers/                 # SIN CAMBIOS
│   ├── reports/                        # SIN CAMBIOS
│   └── store/                          # NUEVO
│       ├── products/route.ts           # GET: catálogo público (stock > 0)
│       ├── orders/route.ts             # POST: crear orden | GET: listar (owner)
│       └── orders/[id]/route.ts        # PATCH: cambiar status (owner)
│
├── page.tsx                            # MODIFICAR: redirect('/tienda')
└── login/                              # SIN CAMBIOS (login POS)
```

---

## 3. Componentes a crear

```
src/components/tienda/
├── StoreNav.tsx              # Navbar: logo, categorías, ícono carrito con badge
├── StoreFooter.tsx           # Footer minimalista
├── ProductCard.tsx           # Tarjeta de producto para el grid
├── ProductGrid.tsx           # Grid responsivo
├── CategoryFilter.tsx        # Filtro de categorías (pills horizontales)
├── FlavorSelector.tsx        # Selector de sabor en detalle
├── CartDrawer.tsx            # Sidebar carrito (mobile-first)
├── CartItem.tsx              # Item dentro del carrito
├── OrderSummary.tsx          # Resumen antes de confirmar
├── OrderStatusBadge.tsx      # Badge de status reutilizable
└── StoreOrdersPanel.tsx      # Panel de órdenes para /configuracion del POS
```

```
src/contexts/
└── StoreAuthContext.tsx      # Separado de AuthContext del POS
                              # Consulta store_customers en vez de profiles
```

```
src/hooks/
├── useStoreCart.ts           # Carrito en localStorage (key: 'store_cart')
└── useRealtimeStock.ts       # Suscripción Supabase Realtime a product_variants
```

---

## 4. Sincronización de stock en tiempo real

El stock vive en `product_variants.stock`. Cuando el POS vende → UPDATE en esa columna → la tienda escucha ese cambio.

```typescript
// useRealtimeStock.ts — suscripción Realtime
supabase
  .channel('store-stock-sync')
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'product_variants' },
    (payload) => {
      setVariants(prev =>
        prev
          .map(v => v.id === payload.new.id ? { ...v, stock: payload.new.stock } : v)
          .filter(v => v.stock > 0)  // desaparece del catálogo cuando llega a 0
      )
    }
  )
  .subscribe()
```

**Requisito:** Activar Realtime para `product_variants` en Supabase Dashboard → Database → Replication.

---

## 5. Diseño visual (Ghost Lifestyle style)

```css
/* Variables en (tienda)/layout.tsx — no afectan al POS */
.store-root {
  --store-bg:           #0A0A0A;
  --store-surface:      #111111;
  --store-accent:       #F0B429;  /* mismo ámbar del POS — coherencia de marca */
  --store-text:         #FFFFFF;
  --store-text-muted:   #666666;
  --store-border:       #1A1A1A;
}
```

**Fuentes (cargar en layout de la tienda via `next/font/google`):**
- `Syne` — headings y logo
- `DM Sans` — cuerpo y UI

**Referencia visual:** ghostlifestyle.com — grandes imágenes de producto, grid limpio, sin ruido visual, fondo negro puro, tipografía grande y bold.

---

## 6. Flujo de checkout (sin pago online)

```
Cliente agrega al carrito (localStorage)
        ↓
/carrito — resumen del pedido
        ↓
Formulario: nombre + teléfono + email (no requiere cuenta)
        ↓
Elegir: "Pagar al recibir" | "Pedir por WhatsApp"
        ↓
POST /api/store/orders
  → Valida stock disponible
  → Crea store_orders + store_order_items
  → NO descuenta stock (el dueño confirma primero)
        ↓
Si WhatsApp → wa.me/521XXXXXXXXXX?text=resumen-del-pedido
Si al recibir → pantalla de confirmación con número de orden
```

---

## 7. Archivos del POS que se modifican

Solo **3 archivos existentes** necesitan cambios:

| Archivo | Qué cambia |
|---|---|
| `src/app/page.tsx` | `redirect('/pos')` → `redirect('/tienda')` |
| `src/app/(app)/configuracion/page.tsx` | Agregar sección "Tienda Online" con toggle `store_visible` por producto y panel de órdenes |
| `next.config.ts` | Agregar `images.remotePatterns` para Cloudinary (Fase 4) |

---

## 8. Fases de implementación

### Fase 1 — Catálogo público (valor inmediato)
Tienda visible, sin carrito. El dueño activa productos desde el POS.

- [ ] SQL: columnas `store_visible`, `image_url`, `store_description` en `products`
- [ ] `src/app/(tienda)/layout.tsx` — layout con navbar básico
- [ ] `src/app/(tienda)/page.tsx` — grid de productos
- [ ] `src/app/(tienda)/productos/[productId]/page.tsx` — detalle con selector de sabor
- [ ] `src/app/api/store/products/route.ts` — GET público
- [ ] Toggle `store_visible` en `/configuracion` del POS
- [ ] Componentes: `StoreNav`, `ProductCard`, `ProductGrid`, `CategoryFilter`, `FlavorSelector`

### Fase 2 — Carrito y órdenes (sin login)
Clientes hacen pedidos, dueño los ve en el POS.

- [ ] SQL: tablas `store_orders` + `store_order_items`
- [ ] `src/hooks/useStoreCart.ts`
- [ ] `src/app/(tienda)/carrito/page.tsx`
- [ ] `src/app/api/store/orders/route.ts`
- [ ] `src/components/tienda/StoreOrdersPanel.tsx` en `/configuracion`
- [ ] Flujo WhatsApp como método alternativo
- [ ] Componentes: `CartDrawer`, `CartItem`, `OrderSummary`, `OrderStatusBadge`

### Fase 3 — Auth de clientes e historial
Clientes se registran y ven sus pedidos.

- [ ] SQL: tabla `store_customers` + RLS
- [ ] `src/contexts/StoreAuthContext.tsx`
- [ ] `src/app/(tienda)/auth/login/page.tsx`
- [ ] `src/app/(tienda)/auth/registro/page.tsx`
- [ ] `src/app/(tienda)/cuenta/pedidos/page.tsx`

### Fase 4 — Realtime + imágenes Cloudinary
Stock en tiempo real e imágenes de producto.

- [ ] Activar Realtime en Supabase para `product_variants`
- [ ] `src/hooks/useRealtimeStock.ts`
- [ ] Integración Cloudinary: `next.config.ts` + API route de subida
- [ ] Variables de entorno: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

### Fase 5 — Pulido y SEO
- [ ] `generateMetadata` con OG tags en páginas de producto
- [ ] `sitemap.ts` dinámico con productos visibles
- [ ] Loading skeletons
- [ ] Manejo de stock agotado en carrito al momento de checkout

---

## 9. Variables de entorno a agregar (cuando llegue cada fase)

```bash
# .env.local y .env.production — agregar cuando llegue la fase
NEXT_PUBLIC_WHATSAPP_NUMBER=521XXXXXXXXXX     # Fase 2
CLOUDINARY_CLOUD_NAME=tu_cloud_name           # Fase 4
CLOUDINARY_API_KEY=tu_api_key                 # Fase 4
CLOUDINARY_API_SECRET=tu_api_secret           # Fase 4 — NUNCA NEXT_PUBLIC_
```

---

## 10. Lo que NO se hace en esta versión

| ❌ No hacer | Por qué |
|---|---|
| MercadoPago / pagos online | Complejidad alta, webhooks, reembolsos. "Pagar al recibir" + WhatsApp cubre el 100% de v1 |
| Descuento automático de stock al crear orden | Race conditions + pedidos que bloquean inventario. El dueño confirma → descuenta manualmente |
| Panel admin de tienda separado | Las órdenes van en una sección de `/configuracion`. No justifica página nueva en v1 |
| Reviews y comentarios | Complejidad sin ROI en esta etapa |
| Cupones y descuentos | Edge cases que consumen días |
| Búsqueda full-text Postgres | `ilike` es suficiente para 50-200 productos |
| SSR con cookies de sesión | El proyecto usa cliente directo sin `@supabase/ssr` deliberadamente — no romper ese patrón |

---

## 11. Publicación automática en Facebook e Instagram (pendiente)

### Contexto de la conversación
El dueño quiere publicar ofertas e imágenes de paquetes directamente desde el POS a Facebook e Instagram, sin pagar herramientas de gestión de redes ($20+/mes) y sin usar Gemini/OpenAI como publicador (solo como generador de contenido).

### Decisión de arquitectura
- **Gemini API** → genera el caption + hashtags automáticamente basado en los datos de la oferta
- **Meta Graph API** → publica orgánicamente en Facebook Page e Instagram Business (es gratis, solo requiere setup inicial)
- Las imágenes se generan en canvas (ya existe esa funcionalidad), se suben a **Supabase Storage** para obtener URL pública, y esa URL se envía a Meta

### Estado del setup
- [ ] Confirmar que la cuenta de Instagram de Chocholand es **Business** (no Personal/Creator)
- [ ] Confirmar que Instagram está enlazado a la Página de Facebook de Chocholand Suplementos
- El dueño es administrador de la Página de Facebook ✅
- La Página de Facebook de Chocholand Suplementos ya existe ✅
- Ya hay MCP de Meta configurado en el proyecto (para ads) — puede compartir credenciales base ✅

### Setup de credenciales (solo una vez, ~20 min)

1. **Crear app en Meta Developers** → [developers.facebook.com](https://developers.facebook.com) → Mis apps → Crear app → Tipo: Empresa
2. **Agregar productos**: Instagram Graph API + Facebook Login for Business
3. **Graph API Explorer** → seleccionar app → seleccionar Página "Chocholand Suplementos" → permisos:
   - `pages_manage_posts`
   - `pages_read_engagement`
   - `instagram_content_publish`
4. **Convertir token a Page Access Token** (no expira) → guardar en `.env.local`
5. **Obtener Instagram Business Account ID** → llamada a `/me/accounts` + `/PAGE_ID?fields=instagram_business_account`

### Variables de entorno a agregar
```bash
META_PAGE_ACCESS_TOKEN=EAAxxxxxxx          # Token de larga duración de la Página
META_PAGE_ID=xxxxxxxxxxxxxxxxx             # ID de la Página de Facebook
META_IG_ACCOUNT_ID=xxxxxxxxxxxxxxxxx       # ID de la cuenta de Instagram Business
GEMINI_API_KEY=AIzaxxxxxxxxx               # Para generar captions (si no está ya)
```

### Flujo completo a implementar

```
[Botón "Publicar en Redes"] en sección Generar Imágenes del POS
  → Gemini genera caption + hashtags de suplementos basado en nombre/precio/descuento
  → Imagen del canvas se sube a Supabase Storage (URL pública temporal)
  → POST /api/social/publish
      → Sube imagen a Meta como container: POST /{ig-user-id}/media
      → Publica container: POST /{ig-user-id}/media_publish
      → Publica en Facebook Page: POST /{page-id}/photos
  → Confirmación en el POS con link al post
```

### Archivos a crear
```
src/app/api/social/
└── publish/route.ts     # Recibe { imageDataUrl, offerData } → sube a Storage → publica en Meta

src/lib/
├── meta-publish.ts      # Funciones: uploadToInstagram(), publishInstagram(), publishFacebook()
└── gemini-caption.ts    # Función: generateCaption(offer) → string
```

### Prompt base para Gemini (caption de oferta)
```
Eres el community manager de Chocholand Suplementos, una tienda de suplementos deportivos en México.
Genera un caption para Instagram/Facebook para esta oferta del mes:
- Producto: {nombre}
- Precio normal: ${precio_lista}
- Precio oferta: ${precio_oferta}
- Descuento: {pct}%
- Categoría: {categoria}

El caption debe:
- Ser en español, energético y motivador
- Incluir el precio de oferta claramente
- Terminar con 8-12 hashtags relevantes de suplementos en México
- Máximo 200 palabras
```
