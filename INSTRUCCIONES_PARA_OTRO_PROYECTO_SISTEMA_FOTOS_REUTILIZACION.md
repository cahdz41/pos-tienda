# Instrucciones para IA: Sistema de Fotos de Productos con Reutilización en Cloudinary

> Documento COMPLETO para replicar el sistema de fotos del POS en otro proyecto, con la funcionalidad adicional de **verificar si una imagen ya existe en Cloudinary antes de subirla**, reutilizando la URL existente en lugar de crear un duplicado.
>
> **Leer TODO el documento antes de implementar.** Contiene fixes críticos de producción.

---

## Tabla de Contenidos

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Diferencias con el Sistema Original (POS)](#2-diferencias-con-el-sistema-original-pos)
3. [Dependencias NPM](#3-dependencias-npm)
4. [Variables de Entorno](#4-variables-de-entorno)
5. [Script de Pre-Build (WASM ONNX)](#5-script-de-pre-build-wasm-onnx)
6. [Configuración de Next.js (Webpack Fixes)](#6-configuración-de-nextjs-webpack-fixes)
7. [Schema de Base de Datos](#7-schema-de-base-de-datos)
8. [API Routes](#8-api-routes)
   - [8.1 POST /api/cloudinary/upload](#81-post-apicloudinaryupload---subir-nueva-imagen)
   - [8.2 POST /api/cloudinary/check](#82-post-apicloudinarycheck---verificar-si-imagen-ya-existe)
   - [8.3 GET /api/cloudinary/list](#83-get-apicloudinarylist---listar-imágenes-existentes-en-una-carpeta)
9. [Componente Principal: PhotoManager](#9-componente-principal-photomanager)
10. [Flujo de Reutilización de Imágenes](#10-flujo-de-reutilización-de-imágenes)
11. [Estrategias de Matching de Imágenes Existentes](#11-estrategias-de-matching-de-imágenes-existentes)
12. [Checklist de Deploy a Producción](#12-checklist-de-deploy-a-producción)
13. [Resumen de Problemas y Fixes](#13-resumen-de-problemas-y-fixes)

---

## 1. Visión General del Sistema

El sistema permite gestionar fotos de productos desde un panel de configuración/administración. El flujo es:

1. Usuario selecciona un producto de una lista con búsqueda.
2. Sube una imagen (click o drag & drop).
3. **La IA remueve el fondo automáticamente** con `@imgly/background-removal` (ONNX Runtime WASM, procesamiento 100% en el navegador).
4. Se **verifica si esa imagen (o una similar) ya existe en Cloudinary**.
5. Si existe → se **reutiliza la URL existente** sin subir nada nuevo.
6. Si NO existe → se **sube a Cloudinary** y se guarda la nueva URL en la base de datos.
7. La URL se guarda en la tabla de productos, aplicando a todas las variantes/sabores del mismo producto.

La UI muestra miniaturas, badges "Sin foto", y estados de progreso con mensajes claros.

---

## 2. Diferencias con el Sistema Original (POS)

| Característica | Sistema Original (POS) | Nuevo Sistema (Este Documento) |
|---|---|---|
| Verificación previa en Cloudinary | ❌ No existe | ✅ Sí — antes de subir, se pregunta a Cloudinary si la imagen ya existe |
| Guardado en BD | Solo `image_url` | `image_url` + `cloudinary_public_id` + `cloudinary_folder` |
| API Routes | Solo 1 route (`POST /api/cloudinary`) | 3 routes: `upload`, `check`, `list` |
| Sobrescritura | `overwrite: false` (Cloudinary no sobreescribe) | Controlado por BD + verificación previa |
| Batch upload | No soportado | Puede extenderse fácilmente con `list` + `check` |

### Por qué guardar `cloudinary_public_id`

El `public_id` es el identificador único de Cloudinary para cada imagen (ej: `pos-tienda/productos/abc123`). Guardarlo en la BD permite:
- Verificar si una imagen sigue existiendo en Cloudinary usando `cloudinary.api.resource(public_id)`
- Eliminar imágenes de Cloudinary si se borran de la BD
- Construir transformaciones dinámicas de la URL sin almacenar múltiples versiones
- Evitar subidas duplicadas definitivamente

---

## 3. Dependencias NPM

```bash
npm install cloudinary @imgly/background-removal @supabase/supabase-js
npm install -D string-replace-loader
```

| Paquete | Versión probada | Propósito |
|---------|-----------------|-----------|
| `cloudinary` | `^2.9.0` | SDK server-side para subir y consultar imágenes |
| `@imgly/background-removal` | `^1.7.0` | IA de remoción de fondo (client-side, ONNX WASM) |
| `@supabase/supabase-js` | `^2.103.0` | Cliente de base de datos (adaptar según tu BD) |
| `string-replace-loader` | `^3.3.0` | **FIX CRÍTICO** para onnxruntime-web en producción |

> **NO instalar `onnxruntime-web` directamente** — es peer-dependency de `@imgly/background-removal` y se instala automáticamente.

---

## 4. Variables de Entorno

```env
# Cloudinary — OBLIGATORIAS en local Y en producción
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret

# Supabase (adaptar según tu base de datos)
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### ⚠️ PROBLEMA EN PRODUCCIÓN #1 (CRÍTICO)

**Síntoma:** Error 500 al subir imágenes en el servidor deployado.

**Causa:** Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` **NO estaban en el archivo `.env.production` del VPS**. Solo existían las de Supabase. Cloudinary devolvía error silencioso.

**Fix:** Agregar las 3 variables manualmente en el servidor de producción y reiniciar el proceso.

---

## 5. Script de Pre-Build (WASM ONNX)

Crear `scripts/copy-wasm.js`:

```js
const fs = require('fs');
const path = require('path');

const src  = path.join(__dirname, '../node_modules/onnxruntime-web/dist');
const dest = path.join(__dirname, '../public/ort-wasm');

fs.mkdirSync(dest, { recursive: true });

const copied = [];
fs.readdirSync(src).forEach(file => {
  if (file.endsWith('.wasm') || file.endsWith('.mjs') || file.endsWith('.js')) {
    fs.copyFileSync(path.join(src, file), path.join(dest, file));
    copied.push(file);
  }
});

console.log(`✅ ort-wasm: ${copied.length} archivos copiados a public/ort-wasm/`);
```

Agregar en `package.json`:

```json
{
  "scripts": {
    "predev": "node scripts/copy-wasm.js",
    "prebuild": "node scripts/copy-wasm.js"
  }
}
```

> Esto copia los archivos WASM de ONNX Runtime a `public/ort-wasm/` para que el navegador los sirva localmente. **Sin esto, la IA de remoción de fondo no funciona.**

---

## 6. Configuración de Next.js (Webpack Fixes)

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // 1. Excluir el módulo de Node.js de onnxruntime (solo usamos la versión web/WASM)
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node": false,
    };

    // 2. Regla general para archivos .mjs — evita errores de módulos ESM
    config.module.rules.push({
      test: /\.m?js$/,
      type: "javascript/auto",
      resolve: { fullySpecified: false },
    });

    // 3. FIX CRÍTICO: reemplaza import.meta.url en onnxruntime-web
    // Sin esto aparece en producción: TypeError: e.replace is not a function
    config.module.rules.push({
      test: /onnxruntime-web[\\/]dist[\\/].*\.m?js$/,
      loader: "string-replace-loader",
      options: {
        search: "import.meta.url",
        replace:
          '((typeof window !== "undefined" ? window.location.href : "http://localhost/"))',
        flags: "g",
      },
    });

    return config;
  },
};

export default nextConfig;
```

### ⚠️ PROBLEMA EN PRODUCCIÓN #2 (CRÍTICO)

**Síntoma:** `TypeError: e.replace is not a function` al cargar la página de fotos en producción. La IA no arranca.

**Causa:** `onnxruntime-web` usa `import.meta.url` internamente para resolver la ruta de los archivos WASM. Webpack no maneja bien `import.meta.url` en builds de producción.

**Fix:** La regla `string-replace-loader` arriba reemplaza `import.meta.url` por una expresión segura. **Sin esto, el sistema de IA no funciona en producción.**

---

## 7. Schema de Base de Datos

### Tabla `products` (o como se llame en tu proyecto)

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cloudinary_public_id TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cloudinary_folder TEXT DEFAULT 'mi-proyecto/productos';
```

| Columna | Tipo | Descripción |
|---|---|---|
| `image_url` | `TEXT` | URL completa de Cloudinary (`https://res.cloudinary.com/...`) |
| `cloudinary_public_id` | `TEXT` | Identificador único de Cloudinary (ej: `mi-proyecto/productos/abc123xyz`) |
| `cloudinary_folder` | `TEXT` | Carpeta en Cloudinary donde se guardó (útil si tienes múltiples carpetas) |

> **IMPORTANTE:** Guardar `cloudinary_public_id` es lo que permite verificar si la imagen sigue existiendo en Cloudinary sin tener que adivinar.

### Ejemplo de consulta con los nuevos campos

```sql
SELECT 
  id, name, category, 
  image_url, 
  cloudinary_public_id,
  cloudinary_folder
FROM products
WHERE id = 'producto-123';
```

---

## 8. API Routes

### 8.1 POST /api/cloudinary/upload — Subir nueva imagen

```ts
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const productId = formData.get('productId') as string | null
    const folder = (formData.get('folder') as string) || 'mi-proyecto/productos'

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataURI = `data:${file.type};base64,${base64}`

    // Opcional: usar public_id predecible basado en productId para evitar duplicados
    // Ejemplo: si productId = "prod-123", el public_id será "mi-proyecto/productos/prod-123"
    const uploadOptions: any = {
      folder,
      transformation: [
        {
          width: 600,
          height: 600,
          crop: 'fill',
          quality: 80,
          format: 'webp',
        },
      ],
      resource_type: 'image',
      overwrite: false, // No sobreescribir si ya existe
    }

    // Si nos pasan un productId, usarlo para generar un public_id predecible
    // Esto hace MUCHO más fácil verificar si la imagen ya existe después
    if (productId) {
      uploadOptions.public_id = `${folder}/${productId}`
      uploadOptions.unique_filename = false
      uploadOptions.use_filename = true
    } else {
      uploadOptions.unique_filename = true
      uploadOptions.use_filename = false
    }

    const result = await cloudinary.uploader.upload(dataURI, uploadOptions)

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      folder: result.folder,
      created: result.created_at,
      // Si existing es true, Cloudinary devolvió la imagen existente (cuando overwrite: false y public_id coincide)
      existing: result.existing,
    })
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || 'Error al subir la imagen'
    console.error('Error Cloudinary upload:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

#### Notas sobre public_id predecible

- Si defines `public_id` basado en el `productId` (ej: `mi-proyecto/productos/${productId}`), Cloudinary con `overwrite: false` **devolverá la imagen existente** si ya hay una con ese public_id, en lugar de crear un duplicado.
- Esto es la forma más simple y robusta de evitar duplicados: la propia API de Cloudinary te lo resuelve.
- El resultado incluirá `result.existing` si Cloudinary reutilizó una imagen existente.

---

### 8.2 POST /api/cloudinary/check — Verificar si imagen ya existe

Este endpoint recibe un `public_id` y verifica si esa imagen existe en Cloudinary.

```ts
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { publicId } = body

    if (!publicId) {
      return NextResponse.json({ error: 'publicId requerido' }, { status: 400 })
    }

    try {
      // cloudinary.api.resource() lanza un error 404 si el recurso NO existe
      const result = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
      })

      return NextResponse.json({
        exists: true,
        url: result.secure_url,
        publicId: result.public_id,
        folder: result.folder,
        createdAt: result.created_at,
        bytes: result.bytes,
        format: result.format,
      })
    } catch (apiError: any) {
      // Si el error es 404, la imagen NO existe
      if (apiError?.http_code === 404 || apiError?.error?.http_code === 404) {
        return NextResponse.json({
          exists: false,
          publicId,
          message: 'La imagen no existe en Cloudinary',
        })
      }
      // Otro error de la API de Cloudinary
      throw apiError
    }
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || 'Error al verificar imagen'
    console.error('Error Cloudinary check:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

#### Uso típico desde el cliente

```ts
// Antes de procesar/subir, verificar si ya existe
const checkRes = await fetch('/api/cloudinary/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ publicId: `mi-proyecto/productos/${productId}` }),
})
const checkData = await checkRes.json()

if (checkData.exists) {
  // ✅ La imagen ya existe en Cloudinary
  // Reutilizar checkData.url, guardar en BD, SIN subir nada nuevo
  console.log('Imagen existente encontrada:', checkData.url)
} else {
  // ❌ La imagen NO existe
  // Proceder con el flujo normal: remover fondo → subir a Cloudinary
}
```

---

### 8.3 GET /api/cloudinary/list — Listar imágenes existentes en una carpeta

Útil para sincronización en batch o para mostrar una galería de imágenes ya subidas.

```ts
import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const folder = searchParams.get('folder') || 'mi-proyecto/productos'
    const maxResults = parseInt(searchParams.get('max') || '100')

    const result = await cloudinary.api.resources({
      type: 'upload',
      prefix: folder, // Filtra por carpeta
      max_results: Math.min(maxResults, 500),
      resource_type: 'image',
    })

    const images = result.resources.map((r: any) => ({
      url: r.secure_url,
      publicId: r.public_id,
      folder: r.folder,
      createdAt: r.created_at,
      bytes: r.bytes,
      format: r.format,
      width: r.width,
      height: r.height,
    }))

    return NextResponse.json({
      success: true,
      images,
      total: result.resources.length,
      nextCursor: result.next_cursor,
    })
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || 'Error al listar imágenes'
    console.error('Error Cloudinary list:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

#### Uso típico desde el cliente

```ts
// Obtener todas las imágenes de una carpeta
const listRes = await fetch('/api/cloudinary/list?folder=mi-proyecto/productos&max=100')
const listData = await listRes.json()

if (listData.success) {
  console.log(`Hay ${listData.total} imágenes en Cloudinary`)
  for (const img of listData.images) {
    console.log(img.publicId, img.url)
  }
}
```

---

## 9. Componente Principal: PhotoManager

Este es el componente adaptado con la funcionalidad de **reutilización de imágenes existentes**. Antes de procesar y subir, verifica si el producto ya tiene un `cloudinary_public_id` guardado en la BD y si esa imagen sigue existiendo en Cloudinary.

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

// === ADAPTA ESTOS TIPOS A TU BASE DE DATOS ===
interface ProductRow {
  id: string
  name: string
  category: string | null
  image_url: string | null
  cloudinary_public_id: string | null
  cloudinary_folder: string | null
}

interface VariantRow {
  id: string
  product_id: string
  barcode: string
  flavor: string | null
  product: ProductRow
}

type Stage = 'idle' | 'checking' | 'removing-bg' | 'uploading' | 'saving' | 'done' | 'error' | 'reused'

const STAGE_LABEL: Record<Stage, string> = {
  idle:          '',
  checking:      'Verificando si la imagen ya existe…',
  'removing-bg': 'Recortando fondo con IA…',
  uploading:     'Subiendo a la nube…',
  saving:        'Guardando en base de datos…',
  done:          '¡Imagen guardada!',
  reused:        '✓ Imagen existente reutilizada',
  error:         'Error al procesar',
}

// Carpeta en Cloudinary para este proyecto — CAMBIA ESTO
const CLOUDINARY_FOLDER = 'mi-proyecto/productos'

export default function PhotoManager() {
  const [variants,  setVariants]  = useState<VariantRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<VariantRow | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [stage,     setStage]     = useState<Stage>('idle')
  const [errorMsg,  setErrorMsg]  = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadVariants() }, [])

  async function loadVariants() {
    setLoading(true)
    const supabase = createClient()
    // === ADAPTA ESTA CONSULTA A TU SCHEMA ===
    const { data } = await supabase
      .from('product_variants')
      .select('id, product_id, barcode, flavor, product:products(id, name, category, image_url, cloudinary_public_id, cloudinary_folder)')
      .order('product_id')
    setVariants((data as any) ?? [])
    setLoading(false)
  }

  const filtered = variants.filter(v => {
    if (!v.product) return false
    const q = search.toLowerCase()
    return (
      v.product.name.toLowerCase().includes(q) ||
      v.barcode.toLowerCase().includes(q) ||
      (v.flavor ?? '').toLowerCase().includes(q)
    )
  })

  function selectVariant(v: VariantRow) {
    setSelected(v)
    setPreview(v.product.image_url ?? null)
    setStage('idle')
    setErrorMsg('')
  }

  function siblingsCount(productId: string) {
    return variants.filter(v => v.product_id === productId).length
  }

  // ============================================================
  // NUEVA FUNCIÓN: Verificar si imagen ya existe en Cloudinary
  // ============================================================
  async function checkExistingImage(productId: string): Promise<{ exists: boolean; url?: string; publicId?: string }> {
    try {
      // Construir el public_id predecible
      const publicId = `${CLOUDINARY_FOLDER}/${productId}`

      const res = await fetch('/api/cloudinary/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('Error verificando imagen existente:', err.error)
        return { exists: false }
      }

      const data = await res.json()
      return {
        exists: data.exists,
        url: data.url,
        publicId: data.publicId,
      }
    } catch (err) {
      console.warn('Fallo la verificación de imagen existente:', err)
      return { exists: false }
    }
  }

  // ============================================================
  // FLUJO PRINCIPAL MODIFICADO CON REUTILIZACIÓN
  // ============================================================
  async function handleFile(file: File) {
    if (!selected) return
    setErrorMsg('')

    try {
      // Paso 0: Verificar si YA existe una imagen para este producto en Cloudinary
      setStage('checking')
      const existing = await checkExistingImage(selected.product_id)

      if (existing.exists && existing.url) {
        // ✅ IMAGEN YA EXISTE — Reutilizarla, no subir nada nuevo
        setStage('saving')

        const supabase = createClient()
        const { error } = await (supabase as any)
          .from('products')
          .update({
            image_url: existing.url,
            cloudinary_public_id: existing.publicId,
            cloudinary_folder: CLOUDINARY_FOLDER,
          })
          .eq('id', selected.product_id)

        if (error) throw new Error(`Error Supabase: ${error.message}`)

        // Actualizar estado local
        setVariants(prev =>
          prev.map(v =>
            v.product_id === selected.product_id
              ? { ...v, product: { ...v.product, image_url: existing.url, cloudinary_public_id: existing.publicId, cloudinary_folder: CLOUDINARY_FOLDER } }
              : v
          )
        )
        setSelected(prev =>
          prev ? { ...prev, product: { ...prev.product, image_url: existing.url, cloudinary_public_id: existing.publicId, cloudinary_folder: CLOUDINARY_FOLDER } } : prev
        )
        setPreview(existing.url)
        setStage('reused')
        setTimeout(() => setStage('idle'), 2500)
        return
      }

      // ❌ No existe → Proceder con el flujo normal de subida
      setPreview(URL.createObjectURL(file))
      setStage('removing-bg')

      // 1. Import dinámico — NUNCA en el top del archivo
      const { removeBackground } = await import('@imgly/background-removal')
      // @ts-ignore — onnxruntime-web no resuelve sus tipos via exports map
      const ort = await import('onnxruntime-web')
      ort.env.wasm.wasmPaths = '/ort-wasm/'

      const blob = await removeBackground(file, {
        publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
        proxyToWorker: false,
      })

      setPreview(URL.createObjectURL(blob))
      setStage('uploading')

      // 2. Subir a Cloudinary con public_id predecible
      const formData = new FormData()
      formData.append('file', new File([blob], 'producto.png', { type: 'image/png' }))
      formData.append('productId', selected.product_id)
      formData.append('folder', CLOUDINARY_FOLDER)

      const res = await fetch('/api/cloudinary/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al subir a Cloudinary')
      const { url, publicId, folder } = json

      setStage('saving')

      // 3. Guardar en products (nivel producto, aplica a todos los sabores)
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('products')
        .update({
          image_url: url,
          cloudinary_public_id: publicId,
          cloudinary_folder: folder,
        })
        .eq('id', selected.product_id)

      if (error) throw new Error(`Error Supabase: ${error.message}`)

      // 4. Actualizar estado local — todos los sabores del mismo producto
      setVariants(prev =>
        prev.map(v =>
          v.product_id === selected.product_id
            ? { ...v, product: { ...v.product, image_url: url, cloudinary_public_id: publicId, cloudinary_folder: folder } }
            : v
        )
      )
      setSelected(prev =>
        prev ? { ...prev, product: { ...prev.product, image_url: url, cloudinary_public_id: publicId, cloudinary_folder: folder } } : prev
      )
      setPreview(url)
      setStage('done')
      setTimeout(() => setStage('idle'), 2500)

    } catch (err: any) {
      console.error('PhotoManager error:', err)
      setStage('error')
      setErrorMsg(err?.message ?? 'Error desconocido')
    }
  }

  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error' && stage !== 'reused'
  const siblings = selected ? siblingsCount(selected.product_id) : 0

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs -mt-1" style={{ color: 'var(--text-muted)' }}>
        Selecciona cualquier sabor del producto — la foto aplica a <strong style={{ color: 'var(--text)' }}>todos los sabores</strong> automáticamente.
        {stage === 'reused' && <span style={{ color: '#4CAF50' }}> Las imágenes existentes se reutilizan sin subir de nuevo.</span>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* ── Panel izquierdo: lista ── */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Buscar producto por nombre…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ ...inputStyle, borderColor: 'var(--accent)' }}
          />

          <div className="rounded-xl overflow-hidden flex flex-col"
            style={{ border: '1px solid var(--border)', maxHeight: 340, overflowY: 'auto' }}>
            {loading ? (
              <div className="flex items-center gap-2 px-3 py-4">
                <div className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando…</span>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs px-3 py-4" style={{ color: 'var(--text-muted)' }}>Sin resultados</p>
            ) : (
              filtered.map(v => {
                const isSelected = selected?.id === v.id
                const hasPhoto   = !!v.product.image_url
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVariant(v)}
                    className="flex items-center justify-between px-3 py-2.5 text-left transition-colors w-full"
                    style={{
                      background:  isSelected ? 'color-mix(in srgb, var(--accent) 15%, var(--bg))' : 'transparent',
                      borderBottom: '1px solid var(--border)',
                      borderLeft:   isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded shrink-0 overflow-hidden flex items-center justify-center"
                        style={{ background: 'var(--surface)' }}>
                        {hasPhoto
                          ? <img src={v.product.image_url!} alt="" className="w-full h-full object-contain" />
                          : <span style={{ fontSize: 16 }}>📷</span>
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }}>
                          {v.product.name}
                        </p>
                        {v.flavor && (
                          <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{v.flavor}</p>
                        )}
                      </div>
                    </div>
                    {!hasPhoto && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold ml-2"
                        style={{ background: '#2D1A00', color: '#F0B429', border: '1px solid #4D3000' }}>
                        Sin foto
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Panel derecho: upload ── */}
        <div className="flex flex-col gap-3">
          {selected ? (
            <>
              <div className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{selected.product.name}</p>
                {selected.flavor && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sabor: {selected.flavor}</p>
                )}
                {siblings > 1 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
                    ✓ La foto se aplicará a los {siblings} sabores de este producto
                  </p>
                )}
                {selected.product.cloudinary_public_id && (
                  <p className="text-xs mt-0.5" style={{ color: '#4CAF50' }}>
                    ✓ Ya tiene imagen en Cloudinary
                  </p>
                )}
              </div>

              <div
                className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer"
                style={{
                  border: `2px dashed ${busy ? 'var(--accent)' : 'var(--border)'}`,
                  background: 'var(--bg)',
                  minHeight: 180,
                  padding: '1rem',
                  opacity: busy ? 0.85 : 1,
                }}
                onClick={() => !busy && inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const file = e.dataTransfer.files[0]
                  if (file && !busy) handleFile(file)
                }}
              >
                {preview ? (
                  <img src={preview} alt="preview"
                    className="max-h-36 object-contain rounded"
                    style={{ opacity: busy ? 0.5 : 1 }} />
                ) : (
                  <span style={{ fontSize: 40, opacity: 0.4 }}>🖼️</span>
                )}

                {busy ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 animate-spin"
                      style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                    <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>
                      {STAGE_LABEL[stage]}
                    </span>
                  </div>
                ) : stage === 'done' ? (
                  <span className="text-xs font-semibold" style={{ color: '#4CAF50' }}>
                    ✓ {STAGE_LABEL.done}
                  </span>
                ) : stage === 'reused' ? (
                  <span className="text-xs font-semibold" style={{ color: '#2196F3' }}>
                    ↻ {STAGE_LABEL.reused}
                  </span>
                ) : stage === 'error' ? (
                  <span className="text-xs text-center" style={{ color: '#FF6B6B' }}>
                    {errorMsg || STAGE_LABEL.error}
                  </span>
                ) : (
                  <div className="text-center">
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                      Click para elegir imagen
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      Se quitará el fondo automáticamente
                    </p>
                    {selected.product.cloudinary_public_id && (
                      <p className="text-xs mt-1" style={{ color: '#2196F3' }}>
                        ↻ Se reutilizará si ya existe en Cloudinary
                      </p>
                    )}
                  </div>
                )}
              </div>

              {!busy && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  {selected.product.image_url ? 'Cambiar foto' : 'Subir foto'}
                </button>
              )}
            </>
          ) : (
            <div className="rounded-xl flex flex-col items-center justify-center gap-2"
              style={{ border: '2px dashed var(--border)', background: 'var(--bg)', minHeight: 260 }}>
              <span style={{ fontSize: 36, opacity: 0.3 }}>👈</span>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Selecciona un producto de la lista
              </p>
            </div>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) { handleFile(file); e.target.value = '' }
        }}
      />
    </div>
  )
}
```

---

## 10. Flujo de Reutilización de Imágenes

### Flujo paso a paso con el componente PhotoManager

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. Usuario selecciona un producto de la lista                                │
│    - El componente ya sabe el product_id                                     │
│    - Muestra si ya tiene image_url o cloudinary_public_id en la BD           │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2. Usuario selecciona/arrastra una imagen nueva                              │
│    - El usuario QUIERE asignar una foto a este producto                      │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3. VERIFICACIÓN EN CLOUDINARY (nuevo paso)                                   │
│    - Se construye el public_id predecible: "mi-proyecto/productos/{productId}"│
│    - POST /api/cloudinary/check con ese public_id                            │
│    - Cloudinary responde: ¿existe esta imagen?                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    ↓                                   ↓
         ┌──────────────────────┐          ┌──────────────────────────┐
         │  EXISTS = true       │          │  EXISTS = false          │
         │  (imagen encontrada) │          │  (no existe)             │
         └──────────────────────┘          └──────────────────────────┘
                    ↓                                   ↓
         ┌──────────────────────┐          ┌──────────────────────────┐
         │ Reutilizar URL       │          │ Procesamiento local      │
         │ Guardar en BD        │          │ Remover fondo con IA     │
         │ Stage = 'reused'     │          │                          │
         │ NO se sube nada      │          │                          │
         └──────────────────────┘          └──────────────────────────┘
                                                      ↓
                                          ┌──────────────────────────┐
                                          │ Subir a Cloudinary       │
                                          │ POST /api/cloudinary/upload│
                                          │ con productId predefinido│
                                          └──────────────────────────┘
                                                      ↓
                                          ┌──────────────────────────┐
                                          │ Guardar en BD:           │
                                          │ image_url, public_id,    │
                                          │ folder                   │
                                          └──────────────────────────┘
```

### Ventajas de este flujo

1. **Sin duplicados**: Al usar `public_id` predecible basado en `productId`, Cloudinary con `overwrite: false` nunca crea duplicados para el mismo producto.
2. **Recuperación automática**: Si la BD se pierde o se migra, puedes reconstruir las URLs simplemente conociendo el `productId` y la carpeta.
3. **Detección de imágenes huérfanas**: Si alguien borra una imagen de Cloudinary manualmente, el sistema lo detecta en la próxima verificación y la vuelve a subir.
4. **Sincronización batch**: Puedes correr un script que verifique todos los `cloudinary_public_id` de la BD contra Cloudinary y reporte cuáles faltan.

---

## 11. Estrategias de Matching de Imágenes Existentes

Según tus necesidades, puedes elegir una o combinar varias:

### Estrategia A: Public ID Predecible (Recomendada — Ya implementada arriba)

- Cada producto tiene un `public_id` fijo basado en su ID: `carpeta/{productId}`
- Antes de subir, verificar si `carpeta/{productId}` existe en Cloudinary
- **Pros**: Simple, 100% confiable, sin duplicados posibles
- **Cons**: Si quieres múltiples imágenes por producto, necesitas un sufijo (ej: `carpeta/{productId}_1`)

### Estrategia B: Tags en Cloudinary

- Al subir, asignar tags: `cloudinary.uploader.upload(..., { tags: ['producto', productId] })`
- Buscar por tag: `cloudinary.api.resources_by_tag(productId)`
- **Pros**: Flexible, permite múltiples imágenes por producto
- **Cons**: Requiere mantener tags consistentes

### Estrategia C: Hash/Checksum del archivo (Avanzada)

- Calcular un hash MD5/SHA256 del archivo de imagen en el cliente
- Guardar el hash en BD junto con `image_url`
- Antes de subir, comparar el hash del archivo nuevo con los hashes en BD
- **Pros**: Detecta imágenes idénticas incluso con nombres diferentes
- **Cons**: Más compleja, no detecta imágenes "similares" (solo idénticas)

### Estrategia D: Búsqueda por nombre de archivo

- Usar `cloudinary.api.resources({ prefix: 'carpeta/' })` para listar todo
- Buscar en la lista por nombre de archivo que coincida con el producto
- **Pros**: No requiere guardar public_id en BD
- **Cons**: Más lenta (trae lista completa), menos confiable

---

## 12. Checklist de Deploy a Producción

- [ ] `npm install` ejecutado (instala `cloudinary`, `@imgly/background-removal`, `string-replace-loader`)
- [ ] `npm run build` ejecutado (dispara `prebuild` → copia WASM a `public/ort-wasm/`)
- [ ] Carpeta `public/ort-wasm/` existe y contiene archivos `.wasm` y `.mjs`
- [ ] Variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` están en `.env.local`
- [ ] **Las mismas 3 variables están en `.env.production` del VPS**
- [ ] `next.config.ts` tiene las 3 reglas de webpack (alias onnxruntime-node, regla .mjs, string-replace-loader)
- [ ] Tabla `products` tiene las columnas: `image_url`, `cloudinary_public_id`, `cloudinary_folder`
- [ ] API routes creadas: `upload`, `check`, `list`
- [ ] Componente `PhotoManager` adaptado a tu schema de BD
- [ ] Carpeta en Cloudinary configurada (cambiar `CLOUDINARY_FOLDER` en el componente)
- [ ] El panel funciona en local: seleccionar producto → verificar existencia → subir/reutilizar
- [ ] Después del deploy al VPS, reiniciar el proceso (`pm2 restart ...` o equivalente)
- [ ] Probar flujo completo en producción: subir nueva imagen, luego reutilizar la misma

---

## 13. Resumen de Problemas y Fixes

| # | Problema | Causa | Fix |
|---|----------|-------|-----|
| 1 | Error 500 al subir imágenes en producción | Variables de Cloudinary no estaban en `.env.production` del VPS | Agregarlas manualmente + reiniciar |
| 2 | Transformación de Cloudinary fallaba | `crop: 'pad'` + `background: 'auto'` requiere plan pago; `fetch_format` es parámetro incorrecto del SDK | Usar `crop: 'fill'` + `format: 'webp'` |
| 3 | Error silencioso, no se sabía qué fallaba | El route retornaba error genérico | Route retorna `error.message`; PhotoManager lo muestra en UI |
| 4 | `TypeError: e.replace is not a function` en producción | `import.meta.url` en `onnxruntime-web` no funciona con Webpack | `string-replace-loader` reemplaza `import.meta.url` |
| 5 | onnxruntime-node intentaba cargarse en el cliente | Webpack bundlea la versión Node de ONNX | Alias `"onnxruntime-node": false` en webpack |
| 6 | Archivos WASM no encontrados en producción | No se copiaron los `.wasm` a `public/` | Script `copy-wasm.js` en `predev` y `prebuild` |
| 7 | Build roto por `@imgly/background-removal` en SSR | El paquete inicializa ONNX al importarse | Import dinámico `await import(...)` dentro de función, nunca top-level |
| 8 | Imágenes duplicadas en Cloudinary | Se subía sin verificar si ya existía | Usar `public_id` predecible + `overwrite: false` + endpoint `/api/cloudinary/check` |

---

## Notas Finales para la IA Implementadora

1. **Este documento asume Next.js + Supabase** — adaptar el cliente de BD y las consultas SQL si usas PostgreSQL directo, Prisma, Drizzle, etc.
2. **La carpeta de Cloudinary es configurable** — cambia `CLOUDINARY_FOLDER` en el componente y en las API routes según tu convención de nombres.
3. **El sistema de reutilización es opcional pero recomendado** — si no lo necesitas, puedes omitir el endpoint `/api/cloudinary/check` y el paso de verificación en `PhotoManager`, pero perderás la capacidad de detectar duplicados.
4. **Las imágenes resultantes son 600×600px, WebP, calidad 80**, con fondo removido por IA. Ajusta las transformaciones en `upload` según tus necesidades.
5. **NO usar `@supabase/ssr`** en este contexto — usar `@supabase/supabase-js` directo.
6. **El `public_id` predecible es la clave** — gracias a él, el sistema puede reconstruir la referencia a Cloudinary sin depender exclusivamente de la base de datos.
