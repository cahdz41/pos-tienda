# Instrucciones Precisas: Sistema de Asignación de Fotos de Productos (IA)

> Documento generado para replicar el sistema de fotos del POS en otro proyecto.  
> **INCLUYE TODOS LOS FIXES APLICADOS PARA PRODUCCIÓN** — leer completamente antes de implementar.

---

## 1. Visión General del Sistema

El sistema permite a un administrador subir fotos de productos desde un panel de configuración. El flujo es:

1. Usuario selecciona un producto de una lista scrollable con búsqueda.
2. Sube una imagen (click o drag & drop).
3. **La IA remueve el fondo automáticamente** con `@imgly/background-removal` (ONNX Runtime WASM, client-side).
4. La imagen resultante se sube a **Cloudinary** vía API route.
5. La URL de Cloudinary se guarda en la base de datos (tabla `products`, campo `image_url`).
6. La foto aplica a **todos los sabores/variantes** del mismo producto automáticamente.

La UI muestra una lista izquierda con miniaturas y badge `"Sin foto"` en ámbar. Panel derecho con preview, drop zone, y estados de progreso.

---

## 2. Dependencias NPM

```bash
npm install cloudinary @imgly/background-removal @supabase/supabase-js
npm install -D string-replace-loader
```

| Paquete | Versión probada | Propósito |
|---------|-----------------|-----------|
| `cloudinary` | `^2.9.0` | SDK server-side para subir imágenes |
| `@imgly/background-removal` | `^1.7.0` | IA de remoción de fondo (client-side) |
| `@supabase/supabase-js` | `^2.103.0` | Cliente de base de datos |
| `string-replace-loader` | `^3.3.0` | FIX CRÍTICO para onnxruntime-web en producción |

> **NO instalar `onnxruntime-web` directamente** — es peer-dependency de `@imgly/background-removal` y se instala automáticamente.

---

## 3. Variables de Entorno (`.env.local` y producción)

```env
# Cloudinary — OBLIGATORIAS en local Y en producción
CLOUDINARY_CLOUD_NAME=tu-cloud-name
CLOUDINARY_API_KEY=tu-api-key
CLOUDINARY_API_SECRET=tu-api-secret

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### ⚠️ PROBLEMA EN PRODUCCIÓN #1 (CRÍTICO)

**Síntoma:** Error 500 al subir imágenes en el servidor deployado.

**Causa:** Las variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` **NO estaban en el archivo `.env.production` del VPS**. Solo existían las de Supabase. Cloudinary devolvía error silencioso.

**Fix:** Agregar las 3 variables manualmente en el servidor de producción y reiniciar el proceso:
```bash
# En el VPS
nano /var/www/tu-proyecto/.env.production
# Agregar las 3 variables de Cloudinary
pm2 restart tu-app
```

---

## 4. Script de Pre-Build: Copiar WASM de ONNX Runtime

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

> Esto copia los archivos WASM de ONNX Runtime a `public/ort-wasm/` para que el navegador los sirva localmente. Sin esto, la IA de remoción de fondo no funciona.

---

## 5. Configuración de Next.js (`next.config.ts`) — FIX CRÍTICO PARA PRODUCCIÓN

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

**Síntoma:** `TypeError: e.replace is not a function` al cargar la página de fotos en producción. La IA de remoción de fondo no arranca.

**Causa:** `onnxruntime-web` usa `import.meta.url` internamente para resolver la ruta de los archivos WASM. Webpack no maneja bien `import.meta.url` en builds de producción.

**Fix:** La regla `string-replace-loader` arriba reemplaza `import.meta.url` por una expresión segura antes de que Webpack lo procese. **Sin esto, el sistema de IA no funciona en producción.**

---

## 6. API Route: Subida a Cloudinary

Crear `src/app/api/cloudinary/route.ts`:

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

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataURI = `data:${file.type};base64,${base64}`

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'pos-tienda/productos',
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
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    })

    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || 'Error al subir la imagen'
    console.error('Error Cloudinary:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

### ⚠️ PROBLEMA EN PRODUCCIÓN #3 (CRÍTICO)

**Síntoma:** Error 500 de Cloudinary con transformaciones inválidas.

**Causa:** Usábamos `crop: 'pad'` + `background: 'auto'` que puede requerir plan de pago de Cloudinary. También usábamos `fetch_format` que **no es el parámetro correcto** del SDK de Node.js para forzar formato (es para URLs de entrega, no para upload).

**Fix aplicado:**
- `crop: 'fill'` en lugar de `crop: 'pad'` — rellena el cuadro recortando, sin necesidad de color de fondo.
- `format: 'webp'` en lugar de `fetch_format: 'webp'` — este SÍ es el parámetro correcto del SDK de upload.

**Además:** El route ahora retorna `error.message` explícito en el JSON. Antes el error era genérico y no se podía depurar.

---

## 7. Componente Principal: `PhotoManager.tsx`

Crear `src/components/PhotoManager.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'

interface VariantRow {
  id: string
  product_id: string
  barcode: string
  flavor: string | null
  product: {
    id: string
    name: string
    category: string | null
    image_url: string | null
  }
}

type Stage = 'idle' | 'removing-bg' | 'uploading' | 'saving' | 'done' | 'error'

const STAGE_LABEL: Record<Stage, string> = {
  idle:          '',
  'removing-bg': 'Recortando fondo con IA…',
  uploading:     'Subiendo a la nube…',
  saving:        'Guardando en base de datos…',
  done:          '¡Imagen guardada!',
  error:         'Error al procesar',
}

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
    const { data } = await supabase
      .from('product_variants')
      .select('id, product_id, barcode, flavor, product:products(id, name, category, image_url)')
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

  async function handleFile(file: File) {
    if (!selected) return
    setErrorMsg('')

    try {
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

      // 2. Subir a Cloudinary
      const formData = new FormData()
      formData.append('file', new File([blob], 'producto.png', { type: 'image/png' }))

      const res = await fetch('/api/cloudinary', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al subir a Cloudinary')
      const { url } = json

      setStage('saving')

      // 3. Guardar en products (nivel producto, aplica a todos los sabores)
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('products')
        .update({ image_url: url })
        .eq('id', selected.product_id)

      if (error) throw new Error(`Error Supabase: ${error.message}`)

      // 4. Actualizar estado local — todos los sabores del mismo producto
      setVariants(prev =>
        prev.map(v =>
          v.product_id === selected.product_id
            ? { ...v, product: { ...v.product, image_url: url } }
            : v
        )
      )
      setSelected(prev =>
        prev ? { ...prev, product: { ...prev.product, image_url: url } } : prev
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

  const busy = stage !== 'idle' && stage !== 'done' && stage !== 'error'
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
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* Panel izquierdo: lista */}
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

        {/* Panel derecho: upload */}
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

### Reglas importantes del componente:

1. **Import dinámico de `@imgly/background-removal`** — NUNCA en el top del archivo. Se carga bajo demanda dentro de `handleFile`. Si se carga en el top-level, rompe el build de producción porque intenta inicializar ONNX en SSR.
2. **`proxyToWorker: false`** — Evita problemas de CORS y worker en algunos navegadores.
3. **`ort.env.wasm.wasmPaths = '/ort-wasm/'`** — Indica dónde están los archivos WASM copiados por el script.
4. **El error real del servidor se muestra en la UI** — `setErrorMsg(err?.message)` en lugar de un mensaje genérico.

---

## 8. Schema de Base de Datos

Agregar `image_url` a la tabla `products` (nivel producto, no variante):

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
```

> La foto se guarda en `products.image_url`, no en `product_variants`. Esto permite que cualquier sabor/variante del mismo producto herede la misma imagen.

Las variantes se consultan con join a `products` para obtener `image_url`:

```sql
SELECT 
  pv.id, pv.product_id, pv.barcode, pv.flavor,
  p.id, p.name, p.category, p.image_url
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
```

---

## 9. Integración en la Página de Configuración

En tu página de configuración (ej. `src/app/configuracion/page.tsx`):

```tsx
import PhotoManager from '@/components/PhotoManager'

// Dentro del JSX, en una sección:
<section className="rounded-2xl p-5 flex flex-col gap-4"
  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Asignación de Fotos (IA)</p>
  <PhotoManager />
</section>
```

---

## 10. Checklist de Deploy a Producción

Usar esta lista obligatoriamente antes de probar en producción:

- [ ] `npm install` ejecutado (instala `cloudinary`, `@imgly/background-removal`, `string-replace-loader`)
- [ ] `npm run build` ejecutado (dispara `prebuild` → copia WASM a `public/ort-wasm/`)
- [ ] Carpeta `public/ort-wasm/` existe y contiene archivos `.wasm` y `.mjs`
- [ ] Variables `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` están en `.env.local` (local)
- [ ] **Las mismas 3 variables están en `.env.production` del VPS**
- [ ] `next.config.ts` tiene las 3 reglas de webpack (alias onnxruntime-node, regla .mjs, string-replace-loader)
- [ ] Tabla `products` tiene columna `image_url TEXT`
- [ ] El panel funciona en local: seleccionar producto → subir imagen → fondo removido → guardado en BD
- [ ] Después del deploy al VPS, reiniciar el proceso (`pm2 restart ...` o equivalente)
- [ ] Probar subida de imagen en producción y verificar que no hay errores en consola del navegador ni en logs del servidor

---

## 11. Resumen de Problemas que Batallamos (y sus Fixes)

| # | Problema | Causa | Fix |
|---|----------|-------|-----|
| 1 | Error 500 al subir imágenes en producción | Variables de Cloudinary no estaban en `.env.production` del VPS | Agregarlas manualmente + reiniciar |
| 2 | Transformación de Cloudinary fallaba | `crop: 'pad'` + `background: 'auto'` requiere plan pago; `fetch_format` es parámetro incorrecto del SDK | Usar `crop: 'fill'` + `format: 'webp'` |
| 3 | Error silencioso, no se sabía qué fallaba | El route retornaba error genérico, PhotoManager no mostraba detalle | Route retorna `error.message`; PhotoManager lo muestra en UI |
| 4 | `TypeError: e.replace is not a function` en producción | `import.meta.url` en `onnxruntime-web` no funciona con Webpack en build | `string-replace-loader` reemplaza `import.meta.url` en webpack config |
| 5 | onnxruntime-node intentaba cargarse en el cliente | Webpack bundlea la versión Node de ONNX | Alias `"onnxruntime-node": false` en webpack config |
| 6 | Archivos WASM no encontrados en producción | No se copiaron los `.wasm` de `node_modules` a `public/` | Script `copy-wasm.js` en `predev` y `prebuild` |
| 7 | Build roto por `@imgly/background-removal` en SSR | El paquete inicializa ONNX al importarse | Import dinámico `await import('@imgly/background-removal')` dentro de la función, nunca en top-level |

---

## 12. Notas Adicionales

- **NO usar `@supabase/ssr`** en este proyecto. Usar `@supabase/supabase-js` directo con `createClient`.
- La carpeta en Cloudinary es `pos-tienda/productos` — cambiar según tu proyecto.
- Las imágenes resultantes son **600×600px, WebP, calidad 80**, con fondo removido por IA.
- El sistema no tiene límite de tamaño de archivo configurado. Cloudinary maneja archivos grandes bien, pero imágenes de >5MB pueden tardar en procesarse localmente la remoción de fondo.
- `proxyToWorker: false` es intencional. En algunos entornos los Web Workers de ONNX tienen problemas de scope.
