'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Offer } from '@/types'

const CATEGORY_TABS = ['Todos', 'Proteinas', 'Pre-entrenos', 'Creatinas', 'Otros'] as const
type CategoryTab = typeof CATEGORY_TABS[number]

function matchTab(categoria: string, tab: CategoryTab): boolean {
  if (tab === 'Todos') return true
  if (tab === 'Proteinas') return /prote/i.test(categoria)
  if (tab === 'Pre-entrenos') return /pre[\s-]?entr/i.test(categoria)
  if (tab === 'Creatinas') return /creat/i.test(categoria)
  return !/prote|pre[\s-]?entr|creat/i.test(categoria) // Otros
}

interface VariantOption {
  id: string
  flavor: string | null
  sale_price: number
  cost_price: number
  image_url: string | null
  product: { name: string; category: string | null; image_url: string | null }
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const DARK: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 8, fontSize: 14,
  background: '#111827', border: '1px solid #374151', color: '#f9fafb',
  outline: 'none', boxSizing: 'border-box',
}

const LBL: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 6,
}

export default function TabOfertas({ offers, onOffersChange }: {
  offers: Offer[]
  onOffersChange: (o: Offer[]) => void
}) {
  const [showModal, setShowModal]       = useState(false)
  const [variants, setVariants]         = useState<VariantOption[]>([])
  const [loadingV, setLoadingV]         = useState(false)

  // Método 1: búsqueda por texto
  const [search, setSearch]             = useState('')
  const [textSel, setTextSel]           = useState<VariantOption | null>(null)

  // Método 2: categoría → producto
  const [catFilter, setCatFilter]       = useState('')
  const [catSel, setCatSel]             = useState<VariantOption | null>(null)

  const [omitirSabor, setOmitirSabor]   = useState(true)
  const [precioOferta, setPrecioOferta] = useState('')
  const [saving, setSaving]             = useState(false)
  const [deletingId, setDeletingId]     = useState<number | null>(null)
  const [activeTab, setActiveTab]       = useState<CategoryTab>('Todos')

  const active = textSel ?? catSel

  const visibleOffers = useMemo(
    () => activeTab === 'Todos' ? offers : offers.filter(o => matchTab(o.categoria, activeTab)),
    [offers, activeTab]
  )

  async function loadVariants() {
    if (variants.length) return
    setLoadingV(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('product_variants')
      .select('id, flavor, sale_price, cost_price, image_url, product:products(name, category, image_url)')
      .gt('stock', 0)
    setVariants(
      (data ?? [])
        .filter((v: VariantOption) => v.product)
        .sort((a: VariantOption, b: VariantOption) => {
          const na = `${a.product.name}${a.flavor ? ' ' + a.flavor : ''}`.toLowerCase()
          const nb = `${b.product.name}${b.flavor ? ' ' + b.flavor : ''}`.toLowerCase()
          return na.localeCompare(nb, 'es')
        })
    )
    setLoadingV(false)
  }

  function openModal() { setShowModal(true); loadVariants() }

  function close() {
    setShowModal(false)
    setSearch(''); setTextSel(null)
    setCatFilter(''); setCatSel(null)
    setPrecioOferta(''); setOmitirSabor(true)
  }

  function dn(v: VariantOption, omit: boolean) {
    return omit || !v.flavor ? v.product.name : `${v.product.name} — ${v.flavor}`
  }

  function selectText(v: VariantOption) {
    setTextSel(v); setSearch(dn(v, omitirSabor))
    setCatSel(null)
  }

  function selectCat(id: string) {
    const v = variants.find(x => x.id === id) ?? null
    setCatSel(v); setTextSel(null)
  }

  const searchResults = useMemo(() => {
    if (textSel || !search.trim()) return []
    const q = search.toLowerCase()
    return variants.filter(v =>
      [v.product.name, v.flavor].filter(Boolean).join(' ').toLowerCase().includes(q)
    ).slice(0, 12)
  }, [variants, search, textSel])

  const categories = useMemo(() => {
    const s = new Set(variants.map(v => v.product.category).filter(Boolean))
    return Array.from(s).sort() as string[]
  }, [variants])

  const variantsInCat = useMemo(() =>
    catFilter ? variants.filter(v => v.product.category === catFilter) : []
  , [variants, catFilter])

  async function save() {
    if (!active || !precioOferta) return
    setSaving(true)
    try {
      const res = await fetch('/api/ofertas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: dn(active, omitirSabor),
          nombre_completo: active.flavor ? `${active.product.name} — ${active.flavor}` : active.product.name,
          variant_id: active.id,
          categoria: active.product.category ?? '',
          imagen: active.image_url ?? active.product.image_url,
          precio_lista: active.sale_price,
          precio_oferta: parseFloat(precioOferta),
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      onOffersChange([await res.json(), ...offers])
      close()
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function del(id: number) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/ofertas/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? `No se pudo eliminar la oferta (${res.status})`)
      }

      onOffersChange(offers.filter(o => o.id !== id))
    } catch (error) {
      alert(`Error al eliminar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setDeletingId(null)
    }
  }

  async function delAll() {
    if (!confirm('¿Eliminar TODAS las ofertas del mes?')) return
    try {
      const res = await fetch('/api/ofertas', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? `No se pudieron eliminar las ofertas (${res.status})`)
      }

      onOffersChange([])
    } catch (error) {
      alert(`Error al eliminar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          {offers.length} oferta{offers.length !== 1 ? 's' : ''} activas
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {offers.length > 0 && (
            <button onClick={delAll} style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A', cursor: 'pointer' }}>
              Borrar todas
            </button>
          )}
          <button onClick={openModal} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
            background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer' }}>
            + Nueva oferta
          </button>
        </div>
      </div>

      {/* Pestañas de categoría */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {CATEGORY_TABS.map(tab => {
          const count = tab === 'Todos' ? offers.length : offers.filter(o => matchTab(o.categoria, tab)).length
          const isActive = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: 'pointer', border: isActive ? 'none' : '1px solid var(--border)',
              background: isActive ? 'var(--accent)' : 'var(--surface)',
              color: isActive ? '#000' : count === 0 ? 'var(--text-muted)' : 'var(--text)',
              transition: 'all 0.15s',
            }}>
              {tab} {count > 0 && <span style={{ opacity: 0.75 }}>({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleOffers.map(o => {
          const pct = o.precio_lista > 0 ? Math.round(((o.precio_lista - o.precio_oferta) / o.precio_lista) * 100) : 0
          return (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
              {o.imagen
                ? <img src={o.imagen} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                : <div style={{ width: 48, height: 48, borderRadius: 6, background: 'var(--surface)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📦</div>
              }
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nombre}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                  {o.categoria} · <span style={{ textDecoration: 'line-through' }}>{fmt(o.precio_lista)}</span>
                  {' → '}<span style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(o.precio_oferta)}</span>
                  {' '}<span style={{ background: '#1A2D1A', color: '#4CAF50', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>-{pct}%</span>
                </p>
              </div>
              <button onClick={() => del(o.id)} disabled={deletingId === o.id}
                style={{ background: 'transparent', border: 'none',
                  color: deletingId === o.id ? 'var(--text-muted)' : '#FF6B6B',
                  cursor: 'pointer', fontSize: 16, padding: '4px 8px', flexShrink: 0 }}>✕</button>
            </div>
          )
        })}
        {visibleOffers.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {offers.length === 0 ? 'No hay ofertas activas.' : `No hay ofertas en ${activeTab}.`}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1f2937', borderRadius: 16,
            padding: 24, width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto',
            border: '1px solid #374151' }}>

            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: '0 0 4px' }}>
              🏷️ Agregar Oferta del Mes
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>
              Selecciona un producto del inventario y define el precio de oferta.
            </p>

            {loadingV && <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Cargando inventario…</p>}

            {/* ── Método 1: búsqueda rápida ── */}
            <div style={{ marginBottom: 4, position: 'relative' }}>
              <label style={LBL}>🔍 Búsqueda rápida</label>
              <input value={search}
                onChange={e => { setSearch(e.target.value); setTextSel(null); setCatSel(null) }}
                placeholder="Escribe nombre del producto…"
                style={DARK} />
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2,
                  background: '#111827', border: '1px solid #374151', borderRadius: 8,
                  maxHeight: 200, overflow: 'auto', zIndex: 20 }}>
                  {searchResults.map(v => (
                    <div key={v.id} onClick={() => selectText(v)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #374151', fontSize: 13, color: '#f9fafb' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#374151')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      {v.product.name}{v.flavor ? ` — ${v.flavor}` : ''}
                      <span style={{ color: '#6b7280', fontSize: 12 }}> — {v.product.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Divider ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
              <div style={{ flex: 1, height: 1, background: '#374151' }} />
              <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>— o filtra por categoría —</span>
              <div style={{ flex: 1, height: 1, background: '#374151' }} />
            </div>

            {/* ── Método 2: categoría + dropdown ── */}
            <div style={{ marginBottom: 12 }}>
              <label style={LBL}>🏷️ Categoría</label>
              <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setCatSel(null) }}
                style={DARK}>
                <option value="">-- Selecciona categoría --</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={LBL}>📦 Producto</label>
              <select value={catSel?.id ?? ''} disabled={!catFilter}
                onChange={e => selectCat(e.target.value)}
                style={{ ...DARK, opacity: catFilter ? 1 : 0.5 }}>
                <option value="">
                  {catFilter ? '-- Selecciona producto --' : '-- Primero selecciona categoría --'}
                </option>
                {variantsInCat.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.product.name}{v.flavor ? ` — ${v.flavor}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Producto seleccionado: precios ── */}
            {active && (
              <div style={{ background: '#111827', borderRadius: 10, padding: '12px 14px',
                marginBottom: 16, border: '1px solid #374151' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {active.image_url && (
                    <img src={active.image_url} alt="" style={{ width: 54, height: 54, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#f9fafb',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {dn(active, omitirSabor)}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      <div style={{ background: '#1f2937', borderRadius: 6, padding: '7px 10px' }}>
                        <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em' }}>PRECIO PÚBLICO</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fbbf24' }}>{fmt(active.sale_price)}</p>
                      </div>
                      <div style={{ background: '#1f2937', borderRadius: 6, padding: '7px 10px' }}>
                        <p style={{ margin: 0, fontSize: 10, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.05em' }}>COSTO</p>
                        <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#6ee7b7' }}>{fmt(active.cost_price)}</p>
                      </div>
                    </div>
                  </div>
                </div>
                {active.flavor && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
                    cursor: 'pointer', fontSize: 12, color: '#9ca3af' }}>
                    <input type="checkbox" checked={omitirSabor}
                      onChange={e => {
                        setOmitirSabor(e.target.checked)
                        if (textSel) setSearch(dn(textSel, e.target.checked))
                      }} />
                    Solo nombre del producto (sin sabor)
                  </label>
                )}
              </div>
            )}

            {/* ── Precio oferta ── */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ ...LBL, color: '#f59e0b' }}>💰 Precio de Oferta ($)</label>
              <input type="number" step="0.01" min="0" value={precioOferta}
                onChange={e => setPrecioOferta(e.target.value)}
                disabled={!active}
                placeholder={active ? `Ej: ${Math.round(active.sale_price * 0.85)}` : 'Selecciona un producto primero'}
                style={{ ...DARK, border: `1px solid ${active ? '#f59e0b' : '#374151'}`, opacity: active ? 1 : 0.5 }} />
            </div>

            {/* ── Botones ── */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={close}
                style={{ flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
                  background: 'transparent', border: '1px solid #374151', color: '#9ca3af', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={save} disabled={!active || !precioOferta || saving}
                style={{ flex: 2, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  background: active && precioOferta ? '#dc2626' : '#374151',
                  color: '#fff', border: 'none',
                  cursor: active && precioOferta && !saving ? 'pointer' : 'not-allowed',
                  opacity: active && precioOferta ? 1 : 0.6 }}>
                {saving ? 'Guardando…' : '✅ Agregar a Ofertas del Mes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
