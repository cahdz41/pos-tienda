'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import ProductEnrichedContent from '@/components/tienda/ProductEnrichedContent'
import type { NutritionFactRow, StoreProductContent, StoreProductContentStatus } from '@/lib/storeProductContent'
import { extractPresentationHint, referenceFlavor } from '@/lib/productResearchInput'

interface VariantSummary {
  id: string
  flavor: string | null
  barcode: string
  stock: number
  sale_price?: number
  image_url?: string | null
}

interface ProductSummary {
  id: string
  name: string
  brand: string | null
  category: string | null
  image_url: string | null
  store_visible: boolean
  product_variants: VariantSummary[]
  content: Pick<StoreProductContent, 'product_id' | 'status' | 'researched_at' | 'updated_at' | 'research_usage'> | null
}

interface ProductDetailResponse {
  product: ProductSummary
  content: StoreProductContent | null
  metrics: { view: number; flavor_select: number; add_to_cart: number }
}

const STATUS_LABEL: Record<'missing' | StoreProductContentStatus, string> = {
  missing: 'Sin contenido', draft: 'Borrador', review: 'Listo para revisar', published: 'Publicado',
}
function blankRow(): NutritionFactRow {
  return { name: '', amount: '', unit: '', daily_value: null, indent: 0 }
}

function authHeaders(accessToken: string | null, json = false): HeadersInit {
  return { Authorization: `Bearer ${accessToken ?? ''}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const details = Array.isArray(body.missing) ? `\nFalta: ${body.missing.join(', ')}` : ''
    throw new Error(`${body.error || 'Error en la solicitud'}${details}`)
  }
  return body as T
}

function statusColor(status: 'missing' | StoreProductContentStatus): string {
  if (status === 'published') return '#4CAF50'
  if (status === 'review') return '#F0B429'
  if (status === 'draft') return '#8CA8FF'
  return '#777777'
}

function totalResearchTokens(usage: Record<string, unknown> | null): number | null {
  if (!usage) return null
  const value = usage.totalTokenCount ?? usage.total_token_count
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default function TabFichasProductos() {
  const { accessToken } = useAuth()
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState<'save' | 'research' | 'status' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [dirty, setDirty] = useState(false)

  const loadProducts = useCallback(async (search: string) => {
    if (!accessToken) return
    setLoadingList(true)
    setError(null)
    try {
      const response = await fetch(`/api/store-content/products?q=${encodeURIComponent(search)}&limit=60`, {
        headers: authHeaders(accessToken), cache: 'no-store',
      })
      const body = await readResponse<{ products: ProductSummary[] }>(response)
      setProducts(body.products)
      setSelectedId(current => {
        if (current && body.products.some(product => product.id === current)) return current
        return body.products.find(product => product.content?.status === 'published')?.id ?? null
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los productos.')
    } finally {
      setLoadingList(false)
    }
  }, [accessToken])

  const loadDetail = useCallback(async (productId: string) => {
    if (!accessToken) return
    setLoadingDetail(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/store-content/products/${productId}`, {
        headers: authHeaders(accessToken), cache: 'no-store',
      })
      setDetail(await readResponse<ProductDetailResponse>(response))
      setDirty(false)
    } catch (e) {
      setDetail(null)
      setError(e instanceof Error ? e.message : 'No se pudo cargar la ficha.')
    } finally {
      setLoadingDetail(false)
    }
  }, [accessToken])

  useEffect(() => {
    const timer = setTimeout(() => void loadProducts(query), 350)
    return () => clearTimeout(timer)
  }, [loadProducts, query])

  useEffect(() => { if (selectedId) void loadDetail(selectedId) }, [loadDetail, selectedId])

  const content = detail?.content
  const editableContent = useMemo<StoreProductContent | null>(() => {
    if (content) return content
    if (!detail) return null
    const reference = detail.product.product_variants.find(variant => variant.stock > 0 && variant.barcode)
      ?? detail.product.product_variants.find(variant => variant.barcode)
      ?? detail.product.product_variants[0]
    return {
      product_id: detail.product.id, status: 'draft', reference_variant_id: reference?.id ?? null,
      reference_flavor: referenceFlavor(reference?.flavor), short_description: '', key_features: ['', '', ''],
      serving_size: '', servings_per_container: '', presentation: extractPresentationHint(detail.product.name),
      nutrition_facts: [blankRow(), blankRow(), blankRow(), blankRow()], ingredients: '', directions: '',
      nutrition_label_url: null, research_sources: [], research_warnings: [], research_model: null,
      research_prompt_version: null, research_input_hash: null, research_usage: null, researched_at: null,
      published_at: null, published_by: null,
    }
  }, [content, detail])

  function updateContent(patch: Partial<StoreProductContent>, markDirty = true) {
    setDetail(current => current && editableContent
      ? { ...current, content: { ...editableContent, ...patch } }
      : current)
    if (markDirty) setDirty(true)
  }

  async function saveDraft() {
    if (!accessToken || !selectedId || !editableContent) return
    if (editableContent.status !== 'draft' && !window.confirm('Guardar cambios regresará la ficha a borrador y la retirará temporalmente de la tienda. ¿Continuar?')) return
    setBusy('save'); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/store-content/products/${selectedId}`, {
        method: 'PUT', headers: authHeaders(accessToken, true),
        body: JSON.stringify({
          reference_variant_id: editableContent.reference_variant_id,
          reference_flavor: editableContent.reference_flavor,
          short_description: editableContent.short_description,
          key_features: editableContent.key_features,
          serving_size: editableContent.serving_size,
          servings_per_container: editableContent.servings_per_container,
          presentation: editableContent.presentation,
          nutrition_facts: editableContent.nutrition_facts,
          ingredients: editableContent.ingredients,
          directions: editableContent.directions,
          nutrition_label_url: editableContent.nutrition_label_url,
          research_sources: editableContent.research_sources,
          research_warnings: editableContent.research_warnings,
        }),
      })
      const body = await readResponse<{ content: StoreProductContent }>(response)
      setDetail(current => current ? { ...current, content: body.content } : current)
      setDirty(false)
      setNotice('Borrador guardado. Esta acción no consumió Gemini.')
      void loadProducts(query)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') }
    finally { setBusy(null) }
  }

  async function research(force = false) {
    if (!accessToken || !selectedId || !editableContent?.reference_variant_id) {
      setError('Selecciona un sabor o variante de referencia antes de investigar.')
      return
    }
    if (dirty && !window.confirm('Hay cambios sin guardar que serán reemplazados por la investigación. ¿Continuar?')) return
    if (!force && editableContent.researched_at && !window.confirm('Se reutilizará la caché si coincide producto, variante y versión. Si algo cambió, se hará una llamada a Gemini y la ficha regresará a borrador. ¿Continuar?')) return
    if (force && !window.confirm('Se hará una nueva llamada a Gemini y la ficha regresará a borrador. ¿Continuar?')) return
    setBusy('research'); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/store-content/products/${selectedId}/research`, {
        method: 'POST', headers: authHeaders(accessToken, true),
        body: JSON.stringify({ force, reference_variant_id: editableContent.reference_variant_id }),
      })
      const body = await readResponse<{ content: StoreProductContent; cached: boolean }>(response)
      setDetail(current => current ? { ...current, content: body.content } : current)
      setDirty(false)
      setNotice(body.cached
        ? 'Se reutilizó la investigación guardada; no hubo consumo nuevo.'
        : 'Investigación terminada con una sola llamada a Gemini. Revisa los datos antes de publicar.')
      void loadProducts(query)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo investigar.') }
    finally { setBusy(null) }
  }

  async function changeStatus(status: StoreProductContentStatus) {
    if (!accessToken || !selectedId || !editableContent) return
    if (status === 'published') {
      const sourceNotice = editableContent.research_sources.length === 0
        ? '\n\nEsta ficha no tiene fuentes verificables. Al continuar confirmas que revisaste y apruebas manualmente la información.'
        : ''
      if (!window.confirm(`¿Publicar esta ficha en la tienda y en sus ofertas?${sourceNotice}`)) return
    }
    if (status === 'draft' && editableContent.status === 'published' &&
        !window.confirm('¿Retirar la ficha enriquecida? El producto seguirá visible con su vista anterior.')) return
    setBusy('status'); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/store-content/products/${selectedId}/status`, {
        method: 'POST', headers: authHeaders(accessToken, true), body: JSON.stringify({ status }),
      })
      const body = await readResponse<{ content: StoreProductContent }>(response)
      setDetail(current => current ? { ...current, content: body.content } : current)
      setDirty(false)
      setNotice(status === 'published' ? 'Ficha publicada.' : status === 'review' ? 'Ficha lista para revisión.' : 'Ficha regresada a borrador.')
      void loadProducts(query)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado.') }
    finally { setBusy(null) }
  }

  const listStatus = (product: ProductSummary) => product.content?.status ?? 'missing'
  const researchTokens = totalResearchTokens(editableContent?.research_usage ?? null)
  const detailStatus = detail?.content?.status ?? 'missing'
  const publicationHelp = editableContent?.status === 'published'
    ? 'La ficha ya está visible en la página del producto y en sus ofertas asociadas.'
    : editableContent?.status === 'review'
      ? 'Revisión completada. Pulsa “Publicar ficha” para enviarla a la tienda.'
      : dirty || !detail?.content
        ? 'Paso 1 de 2: guarda el borrador. Después podrás continuar para publicarlo.'
        : 'Paso 2 de 2: continúa a revisión. Enseguida aparecerá el botón verde “Publicar ficha”.'

  return (
    <div className="product-content-admin">
      <aside style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar producto o marca…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13 }} />
        </div>
        <div style={{ maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
          {loadingList ? <p style={{ padding: 18, color: 'var(--text-muted)', fontSize: 12 }}>Buscando productos…</p>
            : products.length === 0 ? <p style={{ padding: 18, color: 'var(--text-muted)', fontSize: 12 }}>No se encontraron productos.</p>
              : products.map(product => {
                const status = listStatus(product)
                return (
                  <button key={product.id} onClick={() => {
                    if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cambiar de producto y descartarlos?')) return
                    setSelectedId(product.id)
                  }} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '13px 14px', cursor: 'pointer',
                    background: selectedId === product.id ? 'rgba(240,180,41,0.08)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)',
                  }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{product.name}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 10, color: statusColor(status) }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(status) }} />
                      {STATUS_LABEL[status]}
                    </span>
                  </button>
                )
              })}
        </div>
      </aside>

      <main style={{ minWidth: 0 }}>
        {error && <div style={{ marginBottom: 14, padding: '12px 14px', whiteSpace: 'pre-line', borderRadius: 10, background: '#2D1010', border: '1px solid #5C2020', color: '#FF8585', fontSize: 12 }}>{error}</div>}
        {notice && <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#102614', border: '1px solid #265C31', color: '#7BD98A', fontSize: 12 }}>{notice}</div>}
        {loadingDetail ? <p style={{ padding: 30, color: 'var(--text-muted)' }}>Cargando ficha…</p>
          : !detail || !editableContent ? <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 14, color: 'var(--text-muted)' }}>Selecciona un producto.</div>
            : <div style={{ display: 'grid', gap: 16 }}>
              <section style={{ padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ margin: '0 0 5px', fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{detail.product.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>{detail.product.product_variants.map(variant => variant.flavor).filter(Boolean).join(' · ')}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dirty && <span style={{ color: '#F0B429', fontSize: 10 }}>Cambios sin guardar</span>}
                    <span style={{ padding: '5px 10px', borderRadius: 20, border: `1px solid ${statusColor(detailStatus)}`, color: statusColor(detailStatus), fontSize: 11, fontWeight: 700 }}>{STATUS_LABEL[detailStatus]}</span>
                  </div>
                </div>
                <label style={{ display: 'block', marginTop: 16 }}>
                  <span style={{ display: 'block', marginBottom: 7, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Sabor o variante de referencia</span>
                  <select
                    value={editableContent.reference_variant_id ?? ''}
                    onChange={event => {
                      const variant = detail.product.product_variants.find(item => item.id === event.target.value)
                      if (variant) updateContent({ reference_variant_id: variant.id, reference_flavor: referenceFlavor(variant.flavor) }, false)
                    }}
                    disabled={busy !== null}
                    style={{ width: '100%', maxWidth: 460, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }}
                  >
                    <option value="">Selecciona una variante</option>
                    {detail.product.product_variants.map(variant => (
                      <option key={variant.id} value={variant.id}>
                        {referenceFlavor(variant.flavor)} · {variant.barcode || 'sin código'} · stock {variant.stock}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  <button onClick={() => void research(false)} disabled={!editableContent.reference_variant_id || busy !== null} style={{ padding: '10px 14px', borderRadius: 9, border: 'none', background: '#F0B429', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer', opacity: !editableContent.reference_variant_id || busy ? 0.45 : 1 }}>
                    {busy === 'research' ? 'Investigando…' : editableContent.researched_at ? 'Usar caché o investigar variante' : 'Investigar y generar borrador'}
                  </button>
                  {editableContent.researched_at && <button onClick={() => void research(true)} disabled={!editableContent.reference_variant_id || busy !== null} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid #5C2020', background: '#2D1010', color: '#FF8585', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.45 : 1 }}>Nueva investigación (consume Gemini)</button>}
                  <button onClick={() => setPreview(value => !value)} disabled={busy !== null} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{preview ? 'Cerrar vista previa' : 'Vista previa'}</button>
                </div>
                <p style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1.5 }}>El botón principal reutiliza la investigación guardada cuando producto, variante y versión coinciden. Solo el botón rojo fuerza un consumo nuevo.</p>
                {editableContent.researched_at && <p style={{ margin: '12px 0 0', color: 'var(--text-muted)', fontSize: 10 }}>Última investigación: {new Date(editableContent.researched_at).toLocaleString('es-MX')} · Modelo: {editableContent.research_model ?? '—'}{researchTokens !== null ? ` · ${researchTokens.toLocaleString('es-MX')} tokens` : ''}</p>}
              </section>

              {preview ? <div style={{ padding: 22, borderRadius: 14, background: '#050505', border: '1px solid #222' }}><p style={{ margin: '0 0 12px', color: '#F0B429', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>Vista previa privada</p><ProductEnrichedContent content={editableContent} /></div>
                : <Editor content={editableContent} onChange={updateContent} />}

              <section style={{ padding: 16, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Métricas acumuladas</p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {([['Visitas', detail.metrics.view], ['Sabores seleccionados', detail.metrics.flavor_select], ['Agregados al carrito', detail.metrics.add_to_cart]] as const).map(([label, value]) => (
                    <div key={label} style={{ flex: '1 1 140px', padding: 12, background: 'var(--bg)', borderRadius: 9 }}><strong style={{ display: 'block', color: 'var(--accent)', fontSize: 20 }}>{value}</strong><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{label}</span></div>
                  ))}
                </div>
              </section>

              <div style={{ position: 'sticky', bottom: 0, padding: 12, borderRadius: 12, background: 'rgba(13,13,13,0.96)', border: '1px solid var(--border)', backdropFilter: 'blur(8px)' }}>
                <p style={{ margin: '0 0 10px', color: editableContent.status === 'published' ? '#7BD98A' : 'var(--text-muted)', fontSize: 11, lineHeight: 1.5 }}>
                  <strong style={{ color: editableContent.status === 'published' ? '#7BD98A' : '#F0B429' }}>Publicación: </strong>
                  {publicationHelp}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => void saveDraft()} disabled={busy !== null} style={footerButton}>{busy === 'save' ? 'Guardando…' : 'Guardar borrador'}</button>
                  {editableContent.status === 'draft' && <button onClick={() => void changeStatus('review')} disabled={busy !== null || !detail.content || dirty} style={{ ...footerButton, borderColor: '#80651A', background: '#2A220B', color: '#F0B429', opacity: dirty || !detail.content ? 0.45 : 1 }}>Continuar para publicar</button>}
                  {editableContent.status === 'review' && <><button onClick={() => void changeStatus('draft')} disabled={busy !== null || dirty} style={{ ...footerButton, opacity: dirty ? 0.45 : 1 }}>Volver a borrador</button><button onClick={() => void changeStatus('published')} disabled={busy !== null || dirty} style={{ ...footerButton, border: 'none', background: '#4CAF50', color: '#061407', opacity: dirty ? 0.45 : 1 }}>Publicar ficha</button></>}
                  {editableContent.status === 'published' && <><a href={`/tienda/productos/${selectedId}`} target="_blank" rel="noreferrer" style={{ ...footerButton, display: 'inline-flex', alignItems: 'center', borderColor: '#265C31', background: '#102614', color: '#7BD98A', textDecoration: 'none' }}>Ver en tienda ↗</a><button onClick={() => void changeStatus('draft')} disabled={busy !== null || dirty} style={{ ...footerButton, borderColor: '#5C2020', background: '#2D1010', color: '#FF8585', opacity: dirty ? 0.45 : 1 }}>Retirar publicación</button></>}
                </div>
              </div>
            </div>}
      </main>
      <style>{`.product-content-admin{display:grid;grid-template-columns:minmax(260px,340px) minmax(0,1fr);gap:18px;align-items:start}@media(max-width:900px){.product-content-admin{grid-template-columns:1fr}}`}</style>
    </div>
  )
}

function Field({ label, value, onChange, textarea = false, placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean; placeholder?: string }) {
  const common = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }
  return <label style={{ display: 'block' }}><span style={{ display: 'block', marginBottom: 6, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{label}</span>{textarea
    ? <textarea value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} rows={4} style={{ ...common, resize: 'vertical', lineHeight: 1.5 }} />
    : <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} style={common} />}</label>
}

function Editor({ content, onChange }: { content: StoreProductContent; onChange: (patch: Partial<StoreProductContent>) => void }) {
  function updateFeature(index: number, value: string) { const next = [...content.key_features]; next[index] = value; onChange({ key_features: next }) }
  function updateNutrition(index: number, patch: Partial<NutritionFactRow>) { const next = [...content.nutrition_facts]; next[index] = { ...next[index], ...patch }; onChange({ nutrition_facts: next }) }
  function updateSource(index: number, patch: Partial<StoreProductContent['research_sources'][number]>) { const next = [...content.research_sources]; next[index] = { ...next[index], ...patch }; onChange({ research_sources: next }) }
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={editorSection}><p style={editorTitle}>Contenido principal</p>
      <Field label="Descripción corta" value={content.short_description} onChange={value => onChange({ short_description: value })} textarea />
      <div><span style={editorLabel}>Características clave</span><div style={{ display: 'grid', gap: 8 }}>
        {content.key_features.map((feature, index) => <div key={index} style={{ display: 'flex', gap: 7 }}><input value={feature} onChange={event => updateFeature(index, event.target.value)} style={featureInput} /><button onClick={() => onChange({ key_features: content.key_features.filter((_, itemIndex) => itemIndex !== index) })} disabled={content.key_features.length <= 3} style={{ ...removeButton, opacity: content.key_features.length <= 3 ? 0.35 : 1 }}>×</button></div>)}
        {content.key_features.length < 6 && <button onClick={() => onChange({ key_features: [...content.key_features, ''] })} style={addButton}>+ Agregar característica</button>}
      </div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Field label="Presentación" value={content.presentation} onChange={value => onChange({ presentation: value })} />
        <Field label="Tamaño de porción" value={content.serving_size} onChange={value => onChange({ serving_size: value })} />
        <Field label="Porciones por envase" value={content.servings_per_container} onChange={value => onChange({ servings_per_container: value })} />
      </div>
    </section>
    <section style={editorSection}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><p style={editorTitle}>Tabla nutrimental</p><button onClick={() => onChange({ nutrition_facts: [...content.nutrition_facts, blankRow()] })} style={addButton}>+ Fila</button></div>
      <div style={{ display: 'grid', gap: 7 }}>{content.nutrition_facts.map((row, index) => <div className="nutrition-editor-row" key={index}>
        <input value={row.name} onChange={event => updateNutrition(index, { name: event.target.value })} placeholder="Nutrimento" style={cellStyle} />
        <input value={row.amount} onChange={event => updateNutrition(index, { amount: event.target.value })} placeholder="Cantidad" style={cellStyle} />
        <input value={row.unit} onChange={event => updateNutrition(index, { unit: event.target.value })} placeholder="Unidad" style={cellStyle} />
        <input value={row.daily_value ?? ''} onChange={event => updateNutrition(index, { daily_value: event.target.value || null })} placeholder="% VD" style={cellStyle} />
        <button onClick={() => onChange({ nutrition_facts: content.nutrition_facts.filter((_, itemIndex) => itemIndex !== index) })} style={removeButton}>×</button>
      </div>)}</div>
      <Field label="URL de imagen o PDF de etiqueta" value={content.nutrition_label_url ?? ''} onChange={value => onChange({ nutrition_label_url: value || null })} placeholder="https://…" />
      <style>{`.nutrition-editor-row{display:grid;grid-template-columns:minmax(130px,2fr) 1fr 70px 85px 32px;gap:6px}@media(max-width:720px){.nutrition-editor-row{grid-template-columns:1fr 1fr}.nutrition-editor-row button{min-height:32px}}`}</style>
    </section>
    <section style={editorSection}><Field label="Ingredientes" value={content.ingredients} onChange={value => onChange({ ingredients: value })} textarea /><Field label="Modo de uso" value={content.directions} onChange={value => onChange({ directions: value })} textarea /></section>
    <section style={editorSection}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}><p style={editorTitle}>Fuentes y control de investigación</p>{content.research_sources.length < 10 && <button onClick={() => onChange({ research_sources: [...content.research_sources, { title: '', url: '' }] })} style={addButton}>+ Fuente</button>}</div>
      {content.research_sources.length ? <div style={{ display: 'grid', gap: 8 }}>{content.research_sources.map((source, index) => <div key={index} className="research-source-row"><input value={source.title} onChange={event => updateSource(index, { title: event.target.value })} placeholder="Título de la fuente" style={cellStyle} /><input value={source.url} onChange={event => updateSource(index, { url: event.target.value })} placeholder="https://…" style={cellStyle} /><button onClick={() => onChange({ research_sources: content.research_sources.filter((_, itemIndex) => itemIndex !== index) })} style={removeButton}>×</button></div>)}</div> : <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 11 }}>Aún no hay fuentes. Son recomendadas, pero no obligatorias si revisas y apruebas manualmente la ficha antes de publicarla.</p>}
      {content.research_warnings.length > 0 && <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#2A220B', color: '#F0B429', fontSize: 11 }}>{content.research_warnings.map((warning, index) => <p key={index} style={{ margin: index ? '5px 0 0' : 0 }}>• {warning}</p>)}</div>}
      <style>{`.research-source-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(220px,2fr) 34px;gap:7px}@media(max-width:720px){.research-source-row{grid-template-columns:1fr 34px}.research-source-row input:nth-child(2){grid-column:1/2}}`}</style>
    </section>
  </div>
}

const editorSection: React.CSSProperties = { padding: 18, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', display: 'grid', gap: 14 }
const editorTitle: React.CSSProperties = { margin: 0, fontSize: 12, fontWeight: 800, color: 'var(--text)' }
const editorLabel: React.CSSProperties = { display: 'block', marginBottom: 8, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }
const featureInput: React.CSSProperties = { flex: 1, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 12 }
const removeButton: React.CSSProperties = { width: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: '#FF8585', cursor: 'pointer' }
const addButton: React.CSSProperties = { justifySelf: 'start', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--accent)', cursor: 'pointer', fontSize: 11 }
const cellStyle: React.CSSProperties = { width: '100%', minWidth: 0, padding: '8px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 11 }
const footerButton: React.CSSProperties = { padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }
