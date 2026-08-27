'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { matchesSearch, normalizeVoiceQuery } from '@/lib/voiceNormalize'

interface VariantRow {
  id: string
  product_id: string
  barcode: string
  flavor: string | null
  image_url: string | null
  product: {
    id: string
    name: string
    category: string | null
    image_url: string | null
  }
}

type Stage = 'idle' | 'removing-bg' | 'optimizing' | 'uploading' | 'saving' | 'done' | 'error'
type ProcessingMode = 'ai' | 'as-is'
type PhotoScope = 'all-flavors' | 'specific'

const STAGE_LABEL: Record<Stage, string> = {
  idle:          '',
  'removing-bg': 'Recortando fondo con IA…',
  optimizing:    'Optimizando imagen…',
  uploading:     'Subiendo a la nube…',
  saving:        'Guardando en base de datos…',
  done:          '¡Imagen guardada!',
  error:         'Error al procesar',
}

function effectiveImage(v: VariantRow) {
  return v.image_url ?? v.product.image_url
}

export default function PhotoManager({ initialSearch }: { initialSearch?: string }) {
  const [variants,  setVariants]  = useState<VariantRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState(initialSearch ?? '')
  const [selected,  setSelected]  = useState<VariantRow | null>(null)
  const [preview,   setPreview]   = useState<string | null>(null)
  const [stage,     setStage]     = useState<Stage>('idle')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('ai')
  const [photoScope,     setPhotoScope]     = useState<PhotoScope>('all-flavors')
  const inputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // La búsqueda inicial queda fija durante esta instancia; Configuración la remonta al cambiarla.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadVariants() }, [])

  async function loadVariants() {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('product_variants')
      .select('id, product_id, barcode, flavor, image_url, product:products(id, name, category, image_url)')
      .order('product_id')
    const rows = (data as unknown as VariantRow[]) ?? []
    setVariants(rows)

    const voiceQuery = initialSearch ? normalizeVoiceQuery(initialSearch) : ''
    if (voiceQuery) {
      const matches = rows.filter(v => v.product && matchesSearch(
        voiceQuery,
        v.product.name,
        v.flavor ?? '',
        v.barcode
      ))
      const bestMatch = matches.find(v => normalizeVoiceQuery(v.product.name) === voiceQuery)
        ?? matches.find(v => normalizeVoiceQuery(`${v.product.name} ${v.flavor ?? ''}`) === voiceQuery)
        ?? matches[0]

      if (bestMatch) selectVariant(bestMatch)
    }

    setLoading(false)
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  const filtered = variants.filter(v => {
    if (!v.product) return false
    return matchesSearch(
      normalizeVoiceQuery(search),
      v.product.name,
      v.barcode,
      v.flavor ?? ''
    )
  })

  function selectVariant(v: VariantRow) {
    setSelected(v)
    setPreview(effectiveImage(v))
    setStage('idle')
    setErrorMsg('')
    // Siempre vuelve a los valores seguros por defecto para no arrastrar
    // una elección (p. ej. "específica") al siguiente producto.
    setProcessingMode('ai')
    setPhotoScope('all-flavors')
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

      let blob: Blob = file

      if (processingMode === 'ai') {
        setStage('removing-bg')

        // 1. Import dinámico — nunca en el top del archivo
        const { removeBackground } = await import('@imgly/background-removal')
        // @ts-expect-error — onnxruntime-web no resuelve sus tipos via exports map
        const ort = await import('onnxruntime-web')
        ort.env.wasm.wasmPaths = '/ort-wasm/'

        blob = await removeBackground(file, {
          publicPath: 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/',
          proxyToWorker: false,
        })

        setPreview(URL.createObjectURL(blob))
      } else {
        // Ya viene recortada/transparente — solo se comprime y convierte más abajo.
        setStage('optimizing')
      }

      setStage('uploading')

      // 2. Subir a Cloudinary (ahí se comprime y convierte a WebP)
      const formData = new FormData()
      const uploadName = processingMode === 'ai' ? 'producto.png' : file.name
      formData.append('file', new File([blob], uploadName, { type: blob.type || file.type }))

      const res = await fetch('/api/cloudinary', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error al subir a Cloudinary')
      const { url } = json

      setStage('saving')

      const supabase = createClient()

      if (photoScope === 'specific') {
        // 3a. Guardar solo en esta variante — no toca al resto de sabores
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('product_variants')
          .update({ image_url: url })
          .eq('id', selected.id)

        if (error) throw new Error(`Error Supabase: ${error.message}`)

        setVariants(prev =>
          prev.map(v => (v.id === selected.id ? { ...v, image_url: url } : v))
        )
        setSelected(prev => (prev ? { ...prev, image_url: url } : prev))
      } else {
        // 3b. Guardar en products (nivel producto, aplica a todos los sabores).
        // También se limpia cualquier foto específica previa de los sabores
        // hermanos para que la nueva foto genérica realmente se vea en todos.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('products')
          .update({ image_url: url })
          .eq('id', selected.product_id)

        if (error) throw new Error(`Error Supabase: ${error.message}`)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: clearError } = await (supabase as any)
          .from('product_variants')
          .update({ image_url: null })
          .eq('product_id', selected.product_id)

        if (clearError) throw new Error(`Error Supabase: ${clearError.message}`)

        setVariants(prev =>
          prev.map(v =>
            v.product_id === selected.product_id
              ? { ...v, image_url: null, product: { ...v.product, image_url: url } }
              : v
          )
        )
        setSelected(prev =>
          prev ? { ...prev, image_url: null, product: { ...prev.product, image_url: url } } : prev
        )
      }

      setPreview(url)
      setStage('done')
      setTimeout(() => setStage('idle'), 2500)

    } catch (err: unknown) {
      console.error('PhotoManager error:', err)
      setStage('error')
      setErrorMsg(err instanceof Error ? err.message : 'Error desconocido')
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
        Selecciona un sabor y elige cómo procesar la foto y a quién aplicarla.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>

        {/* ── Panel izquierdo: lista ── */}
        <div className="flex flex-col gap-2">
          <input
            ref={searchInputRef}
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
                const thumbnail  = effectiveImage(v)
                const hasPhoto   = !!thumbnail
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
                          ? <img src={thumbnail!} alt="" className="w-full h-full object-contain" />
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
                {photoScope === 'all-flavors' && siblings > 1 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
                    ✓ La foto se aplicará a los {siblings} sabores de este producto
                  </p>
                )}
                {photoScope === 'specific' && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--accent)' }}>
                    ✓ La foto se aplicará solo a {selected.flavor || 'este sabor'}
                  </p>
                )}
              </div>

              {/* Alcance: específica o genérica para todos los sabores */}
              {siblings > 1 && (
                <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPhotoScope('all-flavors')}
                    className="flex-1 py-2 text-xs font-semibold"
                    style={{
                      background: photoScope === 'all-flavors' ? 'var(--accent)' : 'var(--bg)',
                      color: photoScope === 'all-flavors' ? '#000' : 'var(--text-muted)',
                    }}
                  >
                    Todos los sabores ({siblings})
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setPhotoScope('specific')}
                    className="flex-1 py-2 text-xs font-semibold"
                    style={{
                      background: photoScope === 'specific' ? 'var(--accent)' : 'var(--bg)',
                      color: photoScope === 'specific' ? '#000' : 'var(--text-muted)',
                    }}
                  >
                    Solo este sabor
                  </button>
                </div>
              )}

              {/* Procesamiento: IA automática o imagen ya lista */}
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setProcessingMode('ai')}
                  className="flex-1 py-2 text-xs font-semibold"
                  style={{
                    background: processingMode === 'ai' ? 'var(--accent)' : 'var(--bg)',
                    color: processingMode === 'ai' ? '#000' : 'var(--text-muted)',
                  }}
                >
                  Automático con IA
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setProcessingMode('as-is')}
                  className="flex-1 py-2 text-xs font-semibold"
                  style={{
                    background: processingMode === 'as-is' ? 'var(--accent)' : 'var(--bg)',
                    color: processingMode === 'as-is' ? '#000' : 'var(--text-muted)',
                  }}
                >
                  Ya está lista (solo comprimir)
                </button>
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
                      {processingMode === 'ai'
                        ? 'Se quitará el fondo automáticamente'
                        : 'Se comprimirá y convertirá a WebP tal cual'}
                    </p>
                  </div>
                )}
              </div>

              {!busy && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  {effectiveImage(selected) ? 'Cambiar foto' : 'Subir foto'}
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
