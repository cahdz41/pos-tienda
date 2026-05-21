# Instrucciones de Implementación — POS + Tienda Web (Next.js 16 + Supabase)

Este documento describe cómo portar las 4 features del Dashboard Chocholand al nuevo stack:
- **Next.js 16** con App Router
- **Supabase** (`createClient()` de `@/lib/supabase`)
- **Tailwind CSS** + variables CSS inline (`style={{}}`)
- Sin librería de componentes
- Todo componente interactivo necesita `'use client'`

---

## Tabla de Contenidos

1. [Esquema de Base de Datos (Supabase)](#1-esquema-de-base-de-datos-supabase)
2. [Feature: Ofertas del Mes (Visualización Pública)](#2-feature-ofertas-del-mes-visualización-pública)
3. [Feature: Crear Ofertas del Mes (Panel Admin)](#3-feature-crear-ofertas-del-mes-panel-admin)
4. [Feature: Crear Paquetes del Mes (Panel Admin)](#4-feature-crear-paquetes-del-mes-panel-admin)
5. [Feature: Generador de Imágenes Promocionales](#5-feature-generador-de-imágenes-promocionales)
6. [Consideraciones de Migración](#6-consideraciones-de-migración)

---

## 1. Esquema de Base de Datos (Supabase)

Crear las siguientes tablas en Supabase. Reemplazar los archivos JSON (`ofertas.json`, `paquetes.json`) por tablas SQL.

### Tabla: `offers` (Ofertas del Mes)

```sql
create table offers (
  id bigint generated always as identity primary key,
  nombre text not null,
  nombre_original text, -- nombre completo para matching con inventario
  categoria text not null,
  imagen text,
  precio_lista numeric(12,2) not null,
  precio_oferta numeric(12,2) not null,
  fecha timestamptz default now(),
  created_at timestamptz default now()
);

-- Índice útil para filtrado por categoría
CREATE INDEX idx_offers_categoria ON offers(categoria);
```

**Mapeo desde JSON antiguo:**
| Campo JSON | Columna Supabase | Notas |
|---|---|---|
| `id` | `id` | Usar `generated always as identity` en vez de `time.time() * 1000` |
| `nombre` | `nombre` | Nombre mostrado (puede omitir sabor) |
| `nombre_original` | `nombre_original` | Nombre completo para sincronización con inventario |
| `categoria` | `categoria` | Ej: PROTEINAS, CREATINA, PRE-ENTRENOS |
| `imagen` | `imagen` | URL absoluta o path relativo |
| `precio_lista` | `precio_lista` | Precio público original |
| `precio_oferta` | `precio_oferta` | Precio rebajado |
| `fecha` | `fecha` | Fecha de creación de la oferta |

### Tabla: `packages` (Paquetes del Mes)

```sql
create table packages (
  id bigint generated always as identity primary key,
  nombre text not null,
  productos jsonb not null, -- array de objetos {nombre, imagen, categoria}
  precio_lista numeric(12,2) not null,
  precio_oferta numeric(12,2) not null,
  costo_real numeric(12,2) not null,
  fecha timestamptz default now(),
  activo boolean default true,
  created_at timestamptz default now()
);

-- Índice para filtrar solo activos en la tienda
CREATE INDEX idx_packages_activo ON packages(activo);
```

**Mapeo desde JSON antiguo:**
| Campo JSON | Columna Supabase | Notas |
|---|---|---|
| `id` | `id` | `generated always as identity` |
| `nombre` | `nombre` | Nombre del combo |
| `productos` | `productos` | `jsonb` con array de objetos |
| `precio_lista` | `precio_lista` | Suma de precios públicos |
| `precio_oferta` | `precio_oferta` | Precio del combo |
| `costo_real` | `costo_real` | Suma de precios costo (referencia admin) |
| `fecha` | `fecha` | Fecha de creación |
| `activo` | `activo` | `boolean default true` |

### Tabla: `products` (Inventario POS)

Asumimos que ya existe o se crea así:

```sql
create table products (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  precio numeric(12,2) not null,        -- precio público
  precio_mayoreo numeric(12,2),
  precio_costo numeric(12,2),
  categoria text not null,
  imagen text,
  stock integer default 0,
  created_at timestamptz default now()
);

CREATE INDEX idx_products_categoria ON products(categoria);
CREATE INDEX idx_products_nombre ON products(nombre);
```

### Políticas RLS (Row Level Security)

```sql
-- Habilitar RLS en ambas tablas
alter table offers enable row level security;
alter table packages enable row level security;

-- Política: cualquiera puede leer
CREATE POLICY "Allow public read offers"
  ON offers FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read packages"
  ON packages FOR SELECT TO anon, authenticated USING (true);

-- Política: solo admin puede insertar/actualizar/eliminar
-- Asume que tienes una tabla `profiles` con rol o un claim en JWT
CREATE POLICY "Allow admin write offers"
  ON offers FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');

CREATE POLICY "Allow admin write packages"
  ON packages FOR ALL TO authenticated
  USING (auth.jwt() ->> 'role' = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

> **Nota:** Si no usas JWT claims, implementar la validación de admin en los Server Actions o Route Handlers de Next.js.

---

## 2. Feature: Ofertas del Mes (Visualización Pública)

### Descripción
Sección pública que muestra productos individuales con precio rebajado. Filtros por categoría. Diseño responsive tipo grid.

### Archivos a crear

#### `app/ofertas/page.tsx` — Página pública

```tsx
// app/ofertas/page.tsx
// NO necesita 'use client' — hace data fetching en el servidor

import { createClient } from "@/lib/supabase/server";
import OfertasGrid from "./OfertasGrid";

export const revalidate = 60; // ISR opcional

export default async function OfertasPage() {
  const supabase = await createClient();

  const { data: offers, error } = await supabase
    .from("offers")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) {
    console.error(error);
    return <div>Error cargando ofertas</div>;
  }

  return <OfertasGrid initialOffers={offers ?? []} />;
}
```

#### `app/ofertas/OfertasGrid.tsx` — Componente cliente

```tsx
"use client";

import { useState, useMemo } from "react";

interface Offer {
  id: number;
  nombre: string;
  categoria: string;
  imagen: string | null;
  precio_lista: number;
  precio_oferta: number;
}

const CATEGORIAS = ["TODOS", "PROTEINAS", "CREATINA", "PRE-ENTRENOS", "OTROS"];

export default function OfertasGrid({ initialOffers }: { initialOffers: Offer[] }) {
  const [activeFilter, setActiveFilter] = useState("TODOS");

  const filtered = useMemo(() => {
    if (activeFilter === "TODOS") return initialOffers;
    return initialOffers.filter((o) => o.categoria === activeFilter);
  }, [activeFilter, initialOffers]);

  return (
    <div>
      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveFilter(cat)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: activeFilter === cat ? "var(--accent)" : "var(--surface)",
              color: activeFilter === cat ? "#fff" : "var(--text)",
              fontWeight: 600,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        {filtered.map((offer) => (
          <OfertaCard key={offer.id} offer={offer} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p style={{ textAlign: "center", color: "var(--muted)" }}>
          No hay ofertas disponibles.
        </p>
      )}
    </div>
  );
}

function OfertaCard({ offer }: { offer: Offer }) {
  const descuento = Math.round(
    ((offer.precio_lista - offer.precio_oferta) / offer.precio_lista) * 100
  );
  const ahorro = offer.precio_lista - offer.precio_oferta;

  return (
    <div
      style={{
        background: "var(--surface)",
        borderRadius: 16,
        overflow: "hidden",
        position: "relative",
        border: "1px solid var(--border)",
      }}
    >
      {/* Badge descuento */}
      <span
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "#ff4444",
          color: "#fff",
          padding: "4px 10px",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 12,
          zIndex: 2,
        }}
      >
        -{descuento}%
      </span>

      {/* Imagen */}
      <div style={{ height: 200, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {offer.imagen ? (
          <img
            src={offer.imagen}
            alt={offer.nombre}
            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ fontSize: 48 }}>📦</span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: 16 }}>
        <p style={{ fontSize: 11, color: "var(--accent)", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
          {offer.categoria}
        </p>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, lineHeight: 1.3 }}>
          {offer.nombre}
        </h3>

        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", textDecoration: "line-through" }}>
            ${offer.precio_lista.toFixed(2)}
          </span>
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--accent)" }}>
            ${offer.precio_oferta.toFixed(2)}
          </span>
        </div>

        {ahorro > 0 && (
          <span
            style={{
              display: "inline-block",
              background: "#22c55e",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 6,
              marginTop: 4,
            }}
          >
            ¡Ahorras ${ahorro.toFixed(2)}!
          </span>
        )}
      </div>
    </div>
  );
}
```

### Endpoints equivalentes (Next.js)

| Antes (Flask) | Ahora (Next.js / Supabase) |
|---|---|
| `GET /api/ofertas` | `supabase.from("offers").select("*")` en Server Component |
| Filtro por categoría | Filtrar en cliente con `useMemo` (o en query con `.eq("categoria", cat)`) |
| `imagen` relativa | Asegurar que sea URL absoluta o usar `/_next/image` con dominio configurado |

### Variables CSS requeridas

Asegurar que existan en `globals.css` o en el root:

```css
:root {
  --accent: #cc44ff;      /* o el color primario del POS */
  --surface: #1a1a1a;     /* fondo de tarjetas */
  --bg: #0f0f0f;          /* fondo general */
  --text: #f0f0f0;        /* texto principal */
  --muted: #888888;       /* texto secundario */
  --border: #333333;      /* bordes */
}
```

---

## 3. Feature: Crear Ofertas del Mes (Panel Admin)

### Descripción
Modal/página donde el admin busca un producto del inventario, selecciona categoría, opcionalmente omite el sabor del nombre, ingresa precio de oferta y guarda.

### Archivos a crear

#### `app/admin/ofertas/actions.ts` — Server Actions

```tsx
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createOffer(formData: FormData) {
  const supabase = await createClient();

  // Validar rol admin (ejemplo básico, ajustar según tu auth)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  // Verificar rol admin en tabla profiles
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("No autorizado");

  const nombre = formData.get("nombre") as string;
  const nombre_original = formData.get("nombre_original") as string;
  const categoria = formData.get("categoria") as string;
  const imagen = formData.get("imagen") as string;
  const precio_lista = parseFloat(formData.get("precio_lista") as string);
  const precio_oferta = parseFloat(formData.get("precio_oferta") as string);

  const { error } = await supabase.from("offers").insert({
    nombre,
    nombre_original: nombre_original || nombre,
    categoria,
    imagen,
    precio_lista,
    precio_oferta,
    fecha: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/ofertas");
  revalidatePath("/admin/ofertas");
}

export async function deleteOffer(id: number) {
  const supabase = await createClient();

  const { error } = await supabase.from("offers").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/ofertas");
  revalidatePath("/admin/ofertas");
}

export async function deleteAllOffers() {
  const supabase = await createClient();

  const { error } = await supabase.from("offers").delete().neq("id", 0);
  if (error) throw new Error(error.message);

  revalidatePath("/ofertas");
  revalidatePath("/admin/ofertas");
}
```

#### `app/admin/ofertas/page.tsx` — Página admin

```tsx
// app/admin/ofertas/page.tsx
// Server Component que carga productos e ofertas

import { createClient } from "@/lib/supabase/server";
import OfertasAdminClient from "./OfertasAdminClient";

export default async function AdminOfertasPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: offers }] = await Promise.all([
    supabase.from("products").select("nombre, precio, precio_costo, categoria, imagen").order("nombre"),
    supabase.from("offers").select("*").order("fecha", { ascending: false }),
  ]);

  return (
    <OfertasAdminClient
      products={products ?? []}
      offers={offers ?? []}
    />
  );
}
```

#### `app/admin/ofertas/OfertasAdminClient.tsx` — Cliente

```tsx
"use client";

import { useState, useMemo } from "react";
import { createOffer, deleteOffer, deleteAllOffers } from "./actions";

interface Product {
  nombre: string;
  precio: number;
  precio_costo: number;
  categoria: string;
  imagen: string | null;
}

interface Offer {
  id: number;
  nombre: string;
  categoria: string;
  imagen: string | null;
  precio_lista: number;
  precio_oferta: number;
}

export default function OfertasAdminClient({
  products,
  offers,
}: {
  products: Product[];
  offers: Offer[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [omitirSabor, setOmitirSabor] = useState(true);
  const [precioOferta, setPrecioOferta] = useState("");
  const [categoria, setCategoria] = useState("");

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return [];
    return products.filter((p) =>
      p.nombre.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, products]);

  function handleSelectProduct(p: Product) {
    setSelectedProduct(p);
    setCategoria(p.categoria);
    setSearch(p.nombre);
  }

  function getDisplayName(p: Product, omit: boolean): string {
    if (!omit) return p.nombre;
    // Lógica para omitir sabor: quitar todo después del último " - "
    const idx = p.nombre.lastIndexOf(" - ");
    if (idx > 0) return p.nombre.substring(0, idx);
    return p.nombre;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedProduct) return;

    const formData = new FormData();
    formData.append("nombre", getDisplayName(selectedProduct, omitirSabor));
    formData.append("nombre_original", selectedProduct.nombre);
    formData.append("categoria", categoria);
    formData.append("imagen", selectedProduct.imagen ?? "");
    formData.append("precio_lista", selectedProduct.precio.toString());
    formData.append("precio_oferta", precioOferta);

    await createOffer(formData);
    setShowModal(false);
    setSelectedProduct(null);
    setSearch("");
    setPrecioOferta("");
    setOmitirSabor(true);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Ofertas del Mes</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              padding: "10px 20px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            + Nueva Oferta
          </button>
          <button
            onClick={async () => {
              if (confirm("¿Eliminar TODAS las ofertas?")) await deleteAllOffers();
            }}
            style={{
              padding: "10px 20px",
              background: "#ff4444",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Borrar Todas
          </button>
        </div>
      </div>

      {/* Lista de ofertas existentes */}
      <div style={{ display: "grid", gap: 12 }}>
        {offers.map((o) => (
          <div
            key={o.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: 16,
              background: "var(--surface)",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            {o.imagen && (
              <img src={o.imagen} alt="" style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 8 }} />
            )}
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 700 }}>{o.nombre}</p>
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                ${o.precio_lista} → <strong style={{ color: "var(--accent)" }}>${o.precio_oferta}</strong>
              </p>
            </div>
            <button
              onClick={async () => {
                if (confirm("¿Eliminar esta oferta?")) await deleteOffer(o.id);
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "#ff4444",
                fontSize: 20,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Modal Crear Oferta */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              padding: 32,
              borderRadius: 16,
              width: "100%",
              maxWidth: 520,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 20 }}>Nueva Oferta</h2>
            <form onSubmit={handleSubmit}>
              {/* Buscador de producto */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Buscar Producto
                </label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setSelectedProduct(null);
                  }}
                  placeholder="Escribe para buscar..."
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
                {filteredProducts.length > 0 && !selectedProduct && (
                  <div
                    style={{
                      marginTop: 4,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      maxHeight: 200,
                      overflow: "auto",
                    }}
                  >
                    {filteredProducts.map((p) => (
                      <div
                        key={p.nombre}
                        onClick={() => handleSelectProduct(p)}
                        style={{
                          padding: "10px 14px",
                          cursor: "pointer",
                          borderBottom: "1px solid var(--border)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg)")}
                      >
                        {p.nombre} — ${p.precio}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Categoría */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Categoría
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                >
                  <option value="">Seleccionar...</option>
                  <option value="PROTEINAS">PROTEINAS</option>
                  <option value="CREATINA">CREATINA</option>
                  <option value="PRE-ENTRENOS">PRE-ENTRENOS</option>
                  <option value="OTROS">OTROS</option>
                </select>
              </div>

              {/* Omitir sabor */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 16,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <input
                  type="checkbox"
                  checked={omitirSabor}
                  onChange={(e) => setOmitirSabor(e.target.checked)}
                />
                Omitir sabor del nombre
              </label>

              {/* Preview nombre */}
              {selectedProduct && (
                <div
                  style={{
                    padding: 12,
                    background: "var(--bg)",
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 13,
                    color: "var(--muted)",
                  }}
                >
                  Nombre final: <strong>{getDisplayName(selectedProduct, omitirSabor)}</strong>
                </div>
              )}

              {/* Precio oferta */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Precio de Oferta
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={precioOferta}
                  onChange={(e) => setPrecioOferta(e.target.value)}
                  placeholder="Ej: 650.00"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 20px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!selectedProduct}
                  style={{
                    padding: "10px 20px",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: selectedProduct ? "pointer" : "not-allowed",
                    fontWeight: 700,
                    opacity: selectedProduct ? 1 : 0.5,
                  }}
                >
                  Guardar Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Endpoints equivalentes

| Antes (Flask) | Ahora (Next.js) |
|---|---|
| `POST /api/ofertas` | Server Action `createOffer(formData)` |
| `DELETE /api/ofertas/<id>` | Server Action `deleteOffer(id)` |
| `DELETE /api/ofertas/all` | Server Action `deleteAllOffers()` |
| Búsqueda de productos | `supabase.from("products").select(...)` en Server Component |

### Lógica de negocio clave a preservar

1. **Checkbox "Omitir sabor"**: Quita todo después del último `" - "` del nombre del producto. Guardar `nombre_original` con el nombre completo para sincronización futura.
2. **`precio_lista`**: Se toma del `precio` (precio público) del producto seleccionado, no se edita manualmente.
3. **Sincronización con inventario**: Cuando se actualice un producto (precio o imagen), buscar en `offers` por `nombre_original` y actualizar `precio_lista` / `imagen`.

---

## 4. Feature: Crear Paquetes del Mes (Panel Admin)

### Descripción
Modal/página donde el admin crea combos de 2 a 5 productos. Nombre del combo, productos seleccionados (con categoría + producto), cálculo automático de suma de costos y precio público, y precio de oferta manual.

### Archivos a crear

#### `app/admin/paquetes/actions.ts` — Server Actions

```tsx
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createPackage(formData: FormData) {
  const supabase = await createClient();

  const nombre = formData.get("nombre") as string;
  const productos = JSON.parse(formData.get("productos") as string);
  const precio_lista = parseFloat(formData.get("precio_lista") as string);
  const precio_oferta = parseFloat(formData.get("precio_oferta") as string);
  const costo_real = parseFloat(formData.get("costo_real") as string);

  const { error } = await supabase.from("packages").insert({
    nombre,
    productos,
    precio_lista,
    precio_oferta,
    costo_real,
    fecha: new Date().toISOString(),
    activo: true,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/paquetes");
  revalidatePath("/admin/paquetes");
}

export async function deletePackage(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("packages").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/paquetes");
  revalidatePath("/admin/paquetes");
}

export async function togglePackage(id: number, current: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("packages")
    .update({ activo: !current })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/paquetes");
  revalidatePath("/admin/paquetes");
}
```

#### `app/admin/paquetes/page.tsx` — Server Component

```tsx
// app/admin/paquetes/page.tsx
import { createClient } from "@/lib/supabase/server";
import PaquetesAdminClient from "./PaquetesAdminClient";

export default async function AdminPaquetesPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: packages }] = await Promise.all([
    supabase.from("products").select("nombre, precio, precio_costo, categoria, imagen").order("nombre"),
    supabase.from("packages").select("*").order("fecha", { ascending: false }),
  ]);

  return (
    <PaquetesAdminClient
      products={products ?? []}
      packages={packages ?? []}
    />
  );
}
```

#### `app/admin/paquetes/PaquetesAdminClient.tsx` — Cliente

```tsx
"use client";

import { useState } from "react";
import { createPackage, deletePackage, togglePackage } from "./actions";

interface Product {
  nombre: string;
  precio: number;
  precio_costo: number;
  categoria: string;
  imagen: string | null;
}

interface PackageItem {
  id: number;
  nombre: string;
  productos: { nombre: string; imagen: string | null; categoria: string }[];
  precio_lista: number;
  precio_oferta: number;
  costo_real: number;
  activo: boolean;
}

interface PackageRow {
  categoria: string;
  producto: Product | null;
}

const CATEGORIAS = ["PROTEINAS", "CREATINA", "PRE-ENTRENOS", "OTROS"];

export default function PaquetesAdminClient({
  products,
  packages,
}: {
  products: Product[];
  packages: PackageItem[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rows, setRows] = useState<PackageRow[]>([
    { categoria: "", producto: null },
    { categoria: "", producto: null },
  ]);
  const [precioOferta, setPrecioOferta] = useState("");

  function addRow() {
    if (rows.length < 5) setRows([...rows, { categoria: "", producto: null }]);
  }

  function removeRow(index: number) {
    if (rows.length > 2) setRows(rows.filter((_, i) => i !== index));
  }

  function updateRow(index: number, categoria: string, producto: Product | null) {
    const next = [...rows];
    next[index] = { categoria, producto };
    setRows(next);
  }

  const sumCosto = rows.reduce((sum, r) => sum + (r.producto?.precio_costo ?? 0), 0);
  const sumPublico = rows.reduce((sum, r) => sum + (r.producto?.precio ?? 0), 0);

  const filteredByCat = (cat: string) =>
    cat ? products.filter((p) => p.categoria === cat) : [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rows.some((r) => !r.producto)) return;

    const productos = rows.map((r) => ({
      nombre: r.producto!.nombre,
      imagen: r.producto!.imagen,
      categoria: r.producto!.categoria,
    }));

    const formData = new FormData();
    formData.append("nombre", nombre);
    formData.append("productos", JSON.stringify(productos));
    formData.append("precio_lista", sumPublico.toString());
    formData.append("precio_oferta", precioOferta);
    formData.append("costo_real", sumCosto.toString());

    await createPackage(formData);
    setShowModal(false);
    resetForm();
  }

  function resetForm() {
    setNombre("");
    setRows([
      { categoria: "", producto: null },
      { categoria: "", producto: null },
    ]);
    setPrecioOferta("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Paquetes del Mes</h1>
        <button
          onClick={() => setShowModal(true)}
          style={{
            padding: "10px 20px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontWeight: 700,
          }}
        >
          + Nuevo Paquete
        </button>
      </div>

      {/* Lista paquetes */}
      <div style={{ display: "grid", gap: 12 }}>
        {packages.map((pkg) => (
          <div
            key={pkg.id}
            style={{
              padding: 16,
              background: "var(--surface)",
              borderRadius: 12,
              border: `1px solid ${pkg.activo ? "var(--border)" : "#ff4444"}`,
              opacity: pkg.activo ? 1 : 0.6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span
                style={{
                  background: pkg.activo ? "#cc44ff" : "#ff4444",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 6,
                }}
              >
                {pkg.activo ? "ACTIVO" : "INACTIVO"}
              </span>
              <h3 style={{ fontWeight: 700 }}>{pkg.nombre}</h3>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
              {pkg.productos.map((p) => p.nombre).join(" + ")}
            </p>
            <p style={{ fontSize: 13, marginBottom: 8 }}>
              Público: ${pkg.precio_lista} → Oferta: <strong>${pkg.precio_oferta}</strong>
              {" | "}Costo: ${pkg.costo_real}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => togglePackage(pkg.id, pkg.activo)}
                style={{
                  padding: "6px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {pkg.activo ? "🚫 Desactivar" : "👁️ Activar"}
              </button>
              <button
                onClick={async () => {
                  if (confirm("¿Eliminar permanentemente?")) await deletePackage(pkg.id);
                }}
                style={{
                  padding: "6px 14px",
                  background: "#ff4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                ✕ Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              padding: 32,
              borderRadius: 16,
              width: "100%",
              maxWidth: 600,
              maxHeight: "90vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginBottom: 20 }}>Nuevo Paquete</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Nombre del Combo
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Combo Fuerza"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              {rows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "flex-end",
                    marginBottom: 12,
                    padding: 12,
                    background: "var(--bg)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                      Categoría
                    </label>
                    <select
                      value={row.categoria}
                      onChange={(e) => updateRow(i, e.target.value, null)}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {CATEGORIAS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600 }}>
                      Producto
                    </label>
                    <select
                      value={row.producto?.nombre ?? ""}
                      onChange={(e) => {
                        const p = products.find((p) => p.nombre === e.target.value) ?? null;
                        updateRow(i, row.categoria, p);
                      }}
                      disabled={!row.categoria}
                      style={{
                        width: "100%",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                        color: "var(--text)",
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {filteredByCat(row.categoria).map((p) => (
                        <option key={p.nombre} value={p.nombre}>
                          {p.nombre} — ${p.precio}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length <= 2}
                    style={{
                      padding: "8px 14px",
                      background: "#ff4444",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      cursor: rows.length > 2 ? "pointer" : "not-allowed",
                      opacity: rows.length > 2 ? 1 : 0.4,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {rows.length < 5 && (
                <button
                  type="button"
                  onClick={addRow}
                  style={{
                    padding: "8px 16px",
                    background: "transparent",
                    border: "1px dashed var(--border)",
                    color: "var(--text)",
                    borderRadius: 8,
                    cursor: "pointer",
                    marginBottom: 16,
                    fontSize: 13,
                  }}
                >
                  + Agregar Producto
                </button>
              )}

              {/* Resumen automático */}
              <div
                style={{
                  padding: 14,
                  background: "var(--bg)",
                  borderRadius: 8,
                  marginBottom: 16,
                  fontSize: 13,
                }}
              >
                <p>
                  Suma costo: <strong>${sumCosto.toFixed(2)}</strong>
                </p>
                <p>
                  Suma público: <strong>${sumPublico.toFixed(2)}</strong>
                </p>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
                  Precio de Oferta del Paquete
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={precioOferta}
                  onChange={(e) => setPrecioOferta(e.target.value)}
                  placeholder="Ej: 1680.00"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text)",
                    fontSize: 14,
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: "10px 20px",
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "10px 20px",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Guardar Paquete
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Endpoints equivalentes

| Antes (Flask) | Ahora (Next.js) |
|---|---|
| `POST /api/paquetes` | Server Action `createPackage(formData)` |
| `DELETE /api/paquetes/<id>` | Server Action `deletePackage(id)` |
| `POST /api/paquetes/<id>/toggle` | Server Action `togglePackage(id, current)` |

### Lógica de negocio clave a preservar

1. **Mínimo 2, máximo 5 productos** por paquete.
2. **`costo_real`**: Suma de `precio_costo` de cada producto seleccionado (referencia para el admin).
3. **`precio_lista`**: Suma de `precio` (público) de cada producto.
4. **`precio_oferta`**: Ingresado manualmente por el admin.
5. **`activo`**: `true` por defecto. Solo los paquetes activos se muestran en la tienda pública.
6. Insertar al **principio** de la lista (en Supabase se logra con `.order("fecha", { ascending: false })`).

---

## 5. Feature: Generador de Imágenes Promocionales

### Descripción
Endpoint que genera imágenes cuadradas (1080×1080) listas para redes sociales, combinando ofertas y paquetes en layouts automáticos, y las empaqueta en un ZIP descargable.

### Archivos a crear

#### `app/api/generar-imagenes/route.ts` — Route Handler

```tsx
// app/api/generar-imagenes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAllImages } from "@/lib/image-generator";

export async function POST(_req: NextRequest) {
  const supabase = await createClient();

  // Auth check (admin)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch data from Supabase
  const [{ data: offers }, { data: packages }] = await Promise.all([
    supabase.from("offers").select("*"),
    supabase.from("packages").select("*").eq("activo", true),
  ]);

  const zipBuffer = await generateAllImages({
    offers: offers ?? [],
    packages: packages ?? [],
    baseUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  });

  const now = new Date();
  const month = now.toLocaleString("es-ES", { month: "long" }).toUpperCase();
  const year = now.getFullYear();

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Imagenes_Promo_${month}_${year}.zip"`,
    },
  });
}
```

#### `lib/image-generator.ts` — Motor de generación (Node.js compatible)

> **IMPORTANTE:** En Node.js (Next.js API Route) se usa `sharp` en lugar de `Pillow`. Sharp es nativo de Node y mucho más rápido.

```bash
npm install sharp
npm install -D @types/sharp
```

```ts
// lib/image-generator.ts
import sharp from "sharp";
import { createCanvas, loadImage, registerFont } from "canvas";
import fs from "fs/promises";
import path from "path";
import { Readable } from "stream";
import archiver from "archiver"; // npm install archiver @types/archiver

interface Offer {
  nombre: string;
  categoria: string;
  precio_lista: number;
  precio_oferta: number;
  imagen: string | null;
}

interface PackageItem {
  nombre: string;
  productos: { nombre: string; imagen: string | null }[];
  precio_lista: number;
  precio_oferta: number;
}

interface GeneratorInput {
  offers: Offer[];
  packages: PackageItem[];
  baseUrl: string;
}

const CANVAS_SIZE = 1080;

// Descargar imagen a buffer
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function formatImageUrl(imagen: string | null, baseUrl: string): string {
  if (!imagen) return "";
  if (imagen.startsWith("http://") || imagen.startsWith("https://")) return imagen;
  // Si es relativa tipo static/images/..., armar URL absoluta
  if (imagen.startsWith("/")) return `${baseUrl}${imagen}`;
  return `${baseUrl}/${imagen}`;
}

export async function generateAllImages(input: GeneratorInput): Promise<Buffer> {
  const { offers, packages, baseUrl } = input;
  const now = new Date();
  const month = now.toLocaleString("es-ES", { month: "long" }).toUpperCase();
  const year = now.getFullYear();

  const zipParts: { name: string; buffer: Buffer }[] = [];

  // ─── Imágenes de Ofertas (8 por imagen, grid 4x2) ───
  const offerBatchSize = 8;
  for (let i = 0; i < offers.length; i += offerBatchSize) {
    const batch = offers.slice(i, i + offerBatchSize);
    const buffer = await generateOfferImage(batch, month, year, baseUrl, Math.floor(i / offerBatchSize) + 1);
    zipParts.push({ name: `oferta_${month}_${year}_${String(Math.floor(i / offerBatchSize) + 1).padStart(2, "0")}.jpg`, buffer });
  }

  // ─── Imágenes de Paquetes (2 por imagen) ───
  const pkgBatchSize = 2;
  for (let i = 0; i < packages.length; i += pkgBatchSize) {
    const batch = packages.slice(i, i + pkgBatchSize);
    const buffer = await generatePackageImage(batch, month, year, baseUrl, Math.floor(i / pkgBatchSize) + 1);
    zipParts.push({ name: `paquete_${month}_${year}_${String(Math.floor(i / pkgBatchSize) + 1).padStart(2, "0")}.jpg`, buffer });
  }

  // ─── Crear ZIP en memoria ───
  return createZip(zipParts);
}

// ============================================================
// GENERAR IMAGEN DE OFERTAS (grid 4x2)
// ============================================================
async function generateOfferImage(
  batch: Offer[],
  month: string,
  year: number,
  baseUrl: string,
  idx: number
): Promise<Buffer> {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext("2d");

  // Fondo oscuro con ruido sutil
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Header
  const headerH = 160;
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, 0);
  gradient.addColorStop(0, "#cc44ff");
  gradient.addColorStop(1, "#8800ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, headerH);

  // Título
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px BebasNeue, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`OFERTAS DEL MES`, CANVAS_SIZE / 2, 70);
  ctx.font = "32px Inter, Arial, sans-serif";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`${month} ${year}`, CANVAS_SIZE / 2, 115);

  // Grid 4x2
  const cols = 4;
  const rows = 2;
  const cellW = CANVAS_SIZE / cols;
  const cellH = (CANVAS_SIZE - headerH - 60) / rows; // 60px footer
  const startY = headerH + 10;

  for (let i = 0; i < batch.length; i++) {
    const offer = batch[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + 8;
    const y = startY + row * cellH + 8;
    const w = cellW - 16;
    const h = cellH - 16;

    // Celda fondo
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.fill();

    // Descuento badge
    const descuento = Math.round(((offer.precio_lista - offer.precio_oferta) / offer.precio_lista) * 100);
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.roundRect(x + 6, y + 6, 50, 24, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`-${descuento}%`, x + 31, y + 22);

    // Imagen producto
    if (offer.imagen) {
      const imgUrl = formatImageUrl(offer.imagen, baseUrl);
      const imgBuf = await fetchImageBuffer(imgUrl);
      if (imgBuf) {
        try {
          const img = await loadImage(imgBuf);
          const imgH = h * 0.45;
          const aspect = img.width / img.height;
          const drawW = imgH * aspect;
          const drawX = x + (w - drawW) / 2;
          ctx.drawImage(img, drawX, y + 36, drawW, imgH);
        } catch {
          // skip
        }
      }
    }

    // Categoría badge
    ctx.fillStyle = "var(--accent)";
    ctx.beginPath();
    ctx.roundRect(x + w - 80, y + 6, 74, 20, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "10px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(offer.categoria.substring(0, 10), x + w - 43, y + 19);

    // Nombre
    ctx.fillStyle = "#fff";
    ctx.font = "bold 13px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    const nameY = y + h - 50;
    wrapText(ctx, offer.nombre, x + 8, nameY, w - 16, 16, 2);

    // Precios
    ctx.fillStyle = "#888";
    ctx.font = "12px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`$${offer.precio_lista.toFixed(2)}`, x + 8, y + h - 18);
    const listW = ctx.measureText(`$${offer.precio_lista.toFixed(2)}`).width;

    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 16px Inter, Arial, sans-serif";
    ctx.fillText(`$${offer.precio_oferta.toFixed(2)}`, x + 12 + listW, y + h - 18);
  }

  // Footer
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, CANVAS_SIZE - 50, CANVAS_SIZE, 50);
  ctx.fillStyle = "#666";
  ctx.font = "12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Válido durante ${month} ${year} | Precios en efectivo o transferencia`, CANVAS_SIZE / 2, CANVAS_SIZE - 22);

  return canvas.toBuffer("image/jpeg", { quality: 0.92 });
}

// ============================================================
// GENERAR IMAGEN DE PAQUETES (2 por imagen)
// ============================================================
async function generatePackageImage(
  batch: PackageItem[],
  month: string,
  year: number,
  baseUrl: string,
  idx: number
): Promise<Buffer> {
  const canvas = createCanvas(CANVAS_SIZE, CANVAS_SIZE);
  const ctx = canvas.getContext("2d");

  // Fondo lila oscuro
  ctx.fillStyle = "#1a0a2e";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Header
  const headerH = 160;
  const gradient = ctx.createLinearGradient(0, 0, CANVAS_SIZE, 0);
  gradient.addColorStop(0, "#cc44ff");
  gradient.addColorStop(1, "#6600cc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_SIZE, headerH);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 56px BebasNeue, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`PAQUETES EN OFERTA`, CANVAS_SIZE / 2, 80);
  ctx.font = "28px Inter, Arial, sans-serif";
  ctx.fillStyle = "#ffd700";
  ctx.fillText(`${month} ${year}`, CANVAS_SIZE / 2, 125);

  // Tarjetas (máx 2)
  const cardW = 460;
  const cardH = 380;
  const gap = 40;
  const startY = headerH + 30;
  const totalWidth = batch.length * cardW + (batch.length - 1) * gap;
  let startX = (CANVAS_SIZE - totalWidth) / 2;

  for (const pkg of batch) {
    // Card bg
    ctx.fillStyle = "#2a1a3e";
    ctx.beginPath();
    ctx.roundRect(startX, startY, cardW, cardH, 16);
    ctx.fill();

    // Badge COMBO EXTRA
    ctx.fillStyle = "#cc44ff";
    ctx.beginPath();
    ctx.roundRect(startX + 12, startY + 12, 100, 26, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("COMBO EXTRA", startX + 62, startY + 29);

    // Descuento
    const descuento = Math.round(((pkg.precio_lista - pkg.precio_oferta) / pkg.precio_lista) * 100);
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.roundRect(startX + cardW - 70, startY + 12, 58, 26, 6);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Inter, Arial, sans-serif";
    ctx.fillText(`-${descuento}%`, startX + cardW - 41, startY + 29);

    // Nombre paquete
    ctx.fillStyle = "#fff";
    ctx.font = "bold 22px BebasNeue, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(pkg.nombre.toUpperCase(), startX + cardW / 2, startY + 65);

    // Imágenes de productos en fila
    const thumbSize = 70;
    const thumbGap = 8;
    const totalThumbs = pkg.productos.length;
    const thumbsWidth = totalThumbs * thumbSize + (totalThumbs - 1) * thumbGap;
    let thumbX = startX + (cardW - thumbsWidth) / 2;
    const thumbY = startY + 85;

    for (const prod of pkg.productos) {
      if (prod.imagen) {
        const imgUrl = formatImageUrl(prod.imagen, baseUrl);
        const imgBuf = await fetchImageBuffer(imgUrl);
        if (imgBuf) {
          try {
            const img = await loadImage(imgBuf);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(thumbX, thumbY, thumbSize, thumbSize, 8);
            ctx.clip();
            const aspect = img.width / img.height;
            const drawW = thumbSize * aspect;
            const drawX = thumbX + (thumbSize - drawW) / 2;
            ctx.drawImage(img, drawX, thumbY, drawW, thumbSize);
            ctx.restore();
          } catch {
            // skip
          }
        }
      }
      thumbX += thumbSize + thumbGap;
    }

    // Lista nombres
    ctx.fillStyle = "#ccc";
    ctx.font = "13px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    const listY = thumbY + thumbSize + 20;
    pkg.productos.forEach((p, i) => {
      ctx.fillText(`• ${p.nombre.substring(0, 35)}`, startX + cardW / 2, listY + i * 20);
    });

    // Precios
    const priceY = startY + cardH - 30;
    ctx.fillStyle = "#888";
    ctx.font = "16px Inter, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`$${pkg.precio_lista.toFixed(2)}`, startX + 20, priceY);
    const listW = ctx.measureText(`$${pkg.precio_lista.toFixed(2)}`).width;

    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 24px Inter, Arial, sans-serif";
    ctx.fillText(`$${pkg.precio_oferta.toFixed(2)}`, startX + 28 + listW, priceY);

    const ahorro = pkg.precio_lista - pkg.precio_oferta;
    ctx.fillStyle = "#22c55e";
    ctx.font = "bold 12px Inter, Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`¡Ahorras $${ahorro.toFixed(2)}!`, startX + cardW - 20, priceY);

    startX += cardW + gap;
  }

  // Footer
  ctx.fillStyle = "#0a0a0a";
  ctx.fillRect(0, CANVAS_SIZE - 50, CANVAS_SIZE, 50);
  ctx.fillStyle = "#666";
  ctx.font = "12px Inter, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`Válido durante ${month} ${year} | Precios en efectivo o transferencia`, CANVAS_SIZE / 2, CANVAS_SIZE - 22);

  return canvas.toBuffer("image/jpeg", { quality: 0.92 });
}

// ============================================================
// UTILIDADES
// ============================================================

function wrapText(
  ctx: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(" ");
  let line = "";
  let lineCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      if (lineCount >= maxLines - 1) {
        ctx.fillText(line.trim() + "...", x, y + lineCount * lineHeight);
        return;
      }
      ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
      line = words[n] + " ";
      lineCount++;
    } else {
      line = testLine;
    }
  }
  if (lineCount < maxLines) {
    ctx.fillText(line.trim(), x, y + lineCount * lineHeight);
  }
}

async function createZip(parts: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  const { default: archiver } = await import("archiver");
  const { PassThrough } = await import("stream");

  const pass = new PassThrough();
  const chunks: Buffer[] = [];

  pass.on("data", (chunk: Buffer) => chunks.push(chunk));

  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.pipe(pass);

  for (const part of parts) {
    archive.append(part.buffer, { name: part.name });
  }

  await archive.finalize();

  return new Promise((resolve) => {
    pass.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
```

> **Nota sobre fuentes:** `canvas` necesita fuentes registradas en el sistema o archivos `.ttf` locales. Copiar `BebasNeue-Regular.ttf` e `Inter-Regular.ttf` a `public/fonts/` y registrarlas:
>
> ```ts
> import { registerFont } from "canvas";
> import path from "path";
> registerFont(path.join(process.cwd(), "public/fonts/BebasNeue-Regular.ttf"), { family: "BebasNeue" });
> registerFont(path.join(process.cwd(), "public/fonts/Inter-Regular.ttf"), { family: "Inter" });
> ```

#### `app/admin/generador/page.tsx` — Página del generador

```tsx
"use client";

import { useState, useEffect } from "react";

export default function GeneradorPage() {
  const [stats, setStats] = useState({ offers: 0, packages: 0 });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function loadStats() {
      const [r1, r2] = await Promise.all([
        fetch("/api/ofertas").then((r) => r.json()),
        fetch("/api/paquetes").then((r) => r.json()),
      ]);
      setStats({
        offers: Array.isArray(r1) ? r1.length : 0,
        packages: Array.isArray(r2) ? r2.length : 0,
      });
    }
    loadStats();
  }, []);

  async function handleGenerate() {
    setLoading(true);
    setProgress(0);

    // Simular progreso (el backend no hace streaming real)
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) { clearInterval(interval); return 90; }
        return p + Math.random() * 15;
      });
    }, 400);

    try {
      const res = await fetch("/api/generar-imagenes", { method: "POST" });
      clearInterval(interval);
      setProgress(100);

      if (!res.ok) throw new Error("Error generando imágenes");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("content-disposition")?.split("filename=")[1]?.replace(/"/g, "") ?? "imagenes.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Error: " + (err as Error).message);
    } finally {
      setLoading(false);
      setProgress(0);
    }
  }

  const imgOfertas = Math.ceil(stats.offers / 8);
  const imgPaquetes = Math.ceil(stats.packages / 2);
  const totalImgs = imgOfertas + imgPaquetes;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 40 }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 24 }}>
        🎨 Generador de Imágenes
      </h1>

      <div
        style={{
          background: "var(--surface)",
          padding: 24,
          borderRadius: 16,
          border: "1px solid var(--border)",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Resumen</h2>
        <div style={{ display: "grid", gap: 8, fontSize: 15 }}>
          <p>📦 Productos en oferta: <strong>{stats.offers}</strong></p>
          <p>🎁 Paquetes activos: <strong>{stats.packages}</strong></p>
          <p>🖼️ Imágenes de ofertas: <strong>{imgOfertas}</strong></p>
          <p>🖼️ Imágenes de paquetes: <strong>{imgPaquetes}</strong></p>
          <p style={{ marginTop: 8, fontWeight: 700, color: "var(--accent)" }}>
            Total imágenes a generar: {totalImgs}
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              height: 8,
              background: "var(--bg)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${Math.min(progress, 100)}%`,
                height: "100%",
                background: "var(--accent)",
                transition: "width 0.3s ease",
              }}
            />
          </div>
          <p style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "var(--muted)" }}>
            Generando imágenes... {Math.round(progress)}%
          </p>
        </div>
      )}

      <button
        onClick={handleGenerate}
        disabled={loading || totalImgs === 0}
        style={{
          width: "100%",
          padding: "16px 24px",
          background: loading ? "var(--muted)" : "linear-gradient(135deg, #cc44ff, #8800ff)",
          color: "#fff",
          border: "none",
          borderRadius: 12,
          fontSize: 18,
          fontWeight: 700,
          cursor: loading || totalImgs === 0 ? "not-allowed" : "pointer",
          opacity: totalImgs === 0 ? 0.5 : 1,
        }}
      >
        {loading ? "Generando..." : "Generar y Descargar ZIP"}
      </button>

      {totalImgs === 0 && (
        <p style={{ textAlign: "center", marginTop: 16, color: "var(--muted)", fontSize: 14 }}>
          No hay ofertas ni paquetes para generar imágenes.
        </p>
      )}
    </div>
  );
}
```

### Endpoints equivalentes

| Antes (Flask) | Ahora (Next.js) |
|---|---|
| `POST /api/generar-imagenes` | Route Handler `app/api/generar-imagenes/route.ts` |
| `GET /generar-imagenes` | `app/admin/generador/page.tsx` (o la ruta que prefieras) |
| Descarga ZIP | `NextResponse` con `Content-Type: application/zip` |

### Dependencias npm requeridas

```bash
npm install sharp canvas archiver
npm install -D @types/sharp @types/canvas @types/archiver
```

> **Nota sobre `canvas` en Windows:** Puede requerir `windows-build-tools` o `node-gyp`. En Vercel/Node.js Linux funciona nativamente. Si da problemas, considerar usar `sharp` puro para composición sin `canvas`, o usar una API Route en un contenedor Docker.

---

## 6. Consideraciones de Migración

### De JSON a Supabase

| Aspecto | Antes (JSON) | Ahora (Supabase) |
|---|---|---|
| IDs | `time.time() * 1000` | `bigint generated always as identity` |
| Fechas | `new Date().toISOString()` | `timestamptz default now()` |
| Arrays en paquetes | `productos: [...]` | `jsonb` column |
| Lectura | `json.load(open(...))` | `supabase.from("...").select("*")` |
| Escritura | `json.dump(...)` | `supabase.from("...").insert/update/delete` |

### De Flask a Next.js

| Aspecto | Antes (Flask) | Ahora (Next.js 16) |
|---|---|---|
| Backend | Python Flask | Server Components + Server Actions |
| API REST | `@app.route(...)` | Route Handlers `app/api/.../route.ts` |
| Form submissions | `request.form` / `request.json` | Server Actions con `FormData` |
| Revalidación | N/A (siempre lee archivo) | `revalidatePath()` + ISR |
| Auth | Password hardcodeado | Supabase Auth + RLS / JWT claims |

### De Vanilla JS a React + Next.js

| Aspecto | Antes | Ahora |
|---|---|---|
| Estado | Variables globales | `useState`, `useMemo` |
| DOM | `document.getElementById` | JSX + refs |
| Eventos | `onclick="..."` | `onClick={...}` handlers |
| Rendering | Template strings HTML | JSX components |
| Modales | CSS manual + JS | Componente con `position: fixed` inline |

### Sincronización con Inventario

Implementar un trigger o una función que se ejecute cuando se actualice un producto:

```sql
-- Opción A: Trigger en PostgreSQL
CREATE OR REPLACE FUNCTION sync_offers_on_product_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE offers
  SET precio_lista = NEW.precio,
      imagen = NEW.imagen
  WHERE nombre_original = NEW.nombre;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_offers
AFTER UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION sync_offers_on_product_update();
```

```ts
// Opción B: Server Action que actualiza todo al subir Excel
export async function syncOffersWithInventory() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("products").select("nombre, precio, imagen");
  const { data: offers } = await supabase.from("offers").select("id, nombre_original");

  for (const offer of offers ?? []) {
    const prod = products?.find((p) => p.nombre === offer.nombre_original);
    if (prod) {
      await supabase
        .from("offers")
        .update({ precio_lista: prod.precio, imagen: prod.imagen })
        .eq("id", offer.id);
    }
  }
}
```

### Variables de entorno necesarias

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=https://tudominio.com
```

---

## Checklist de Implementación

- [ ] Crear tablas `offers`, `packages`, `products` en Supabase
- [ ] Configurar RLS policies
- [ ] Implementar página pública `/ofertas`
- [ ] Implementar admin `/admin/ofertas` (CRUD)
- [ ] Implementar admin `/admin/paquetes` (CRUD + toggle activo)
- [ ] Implementar Route Handler `/api/generar-imagenes`
- [ ] Implementar página `/admin/generador`
- [ ] Copiar fuentes a `public/fonts/`
- [ ] Instalar dependencias: `sharp`, `canvas`, `archiver`
- [ ] Configurar variables CSS en `globals.css`
- [ ] Implementar sincronización ofertas ↔ inventario
- [ ] Probar flujo completo end-to-end
