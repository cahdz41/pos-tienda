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

  // Cuántos sabores tiene el mismo producto
  function siblingsCount(productId: string) {
    return variants.filter(v => v.product_id === productId).length
  }

  async function handleFile(file: File) {
    if (!selected) return
    setErrorMsg('')

    try {
      setPreview(URL.createObjectURL(file))
      setStage('removing-bg')

      // 1. Import dinámico — nunca en el top del archivo
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
      if (!res.ok) throw new Error('Error al subir a Cloudinary')
      const { url } = await res.json()

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

  const inputStyle = {
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
  }

  const siblings = selected ? siblingsCount(selected.product_id) : 0

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs -mt-1" style={{ color: 'var(--text-muted)' }}>
        Selecciona cualquier sabor del producto — la foto aplica a <strong style={{ color: 'var(--text)' }}>todos los sabores</strong> automáticamente.
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
                      {/* Miniatura */}
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
              {/* Info del producto seleccionado */}
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

              {/* Zona de preview / drop */}
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

      {/* Input file oculto */}
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
