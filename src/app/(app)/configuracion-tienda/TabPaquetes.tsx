'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { Package } from '@/types'

interface VariantOption {
  id: string
  flavor: string | null
  sale_price: number
  cost_price: number
  image_url: string | null
  product: { name: string; category: string | null; image_url: string | null }
}

interface PkgRow {
  categoria: string
  selected: VariantOption | null
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const DARK: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: '#111827', border: '1px solid #374151', color: '#f9fafb',
  outline: 'none', boxSizing: 'border-box',
}

function emptyRow(): PkgRow { return { categoria: '', selected: null } }

function RowInput({ row, index, variants, categories, onChange, onRemove, canRemove }: {
  row: PkgRow
  index: number
  variants: VariantOption[]
  categories: string[]
  onChange: (i: number, r: PkgRow) => void
  onRemove: (i: number) => void
  canRemove: boolean
}) {
  const variantsInCat = useMemo(() =>
    row.categoria ? variants.filter(v => v.product.category === row.categoria) : []
  , [variants, row.categoria])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginBottom: 10 }}>
      <select value={row.categoria}
        onChange={e => onChange(index, { categoria: e.target.value, selected: null })}
        style={DARK}>
        <option value="">Categoría…</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      <select value={row.selected?.id ?? ''}
        disabled={!row.categoria}
        onChange={e => {
          const v = variants.find(x => x.id === e.target.value) ?? null
          onChange(index, { ...row, selected: v })
        }}
        style={{ ...DARK, opacity: row.categoria ? 1 : 0.5 }}>
        <option value="">{row.categoria ? '-- Selecciona --' : '-- Primero categoría --'}</option>
        {variantsInCat.map(v => (
          <option key={v.id} value={v.id}>
            {v.product.name}{v.flavor ? ` — ${v.flavor}` : ''} (Público: {fmt(v.sale_price)})
          </option>
        ))}
      </select>

      <button onClick={() => onRemove(index)} disabled={!canRemove}
        style={{ padding: '0 12px', borderRadius: 8, border: 'none',
          background: canRemove ? '#dc2626' : '#374151',
          color: '#fff', cursor: canRemove ? 'pointer' : 'not-allowed',
          fontSize: 16, fontWeight: 700, flexShrink: 0 }}>
        ×
      </button>
    </div>
  )
}

export default function TabPaquetes({ packages, onPackagesChange }: {
  packages: Package[]
  onPackagesChange: (p: Package[]) => void
}) {
  const [showModal, setShowModal]       = useState(false)
  const [variants, setVariants]         = useState<VariantOption[]>([])
  const [loadingV, setLoadingV]         = useState(false)
  const [nombre, setNombre]             = useState('')
  const [rows, setRows]                 = useState<PkgRow[]>([emptyRow(), emptyRow()])
  const [precioOferta, setPrecioOferta] = useState('')
  const [saving, setSaving]             = useState(false)
  const [deletingId, setDeletingId]     = useState<number | null>(null)
  const [togglingId, setTogglingId]     = useState<number | null>(null)

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
    setShowModal(false); setNombre(''); setPrecioOferta('')
    setRows([emptyRow(), emptyRow()])
  }

  const categories = useMemo(() => {
    const s = new Set(variants.map(v => v.product.category).filter(Boolean))
    return Array.from(s).sort() as string[]
  }, [variants])

  function updateRow(i: number, r: PkgRow) {
    setRows(prev => prev.map((row, idx) => idx === i ? r : row))
  }
  function removeRow(i: number) { setRows(prev => prev.filter((_, idx) => idx !== i)) }
  function addRow() { if (rows.length < 5) setRows(prev => [...prev, emptyRow()]) }

  const sumLista = rows.reduce((s, r) => s + (r.selected?.sale_price ?? 0), 0)
  const sumCosto = rows.reduce((s, r) => s + (r.selected?.cost_price ?? 0), 0)
  const allSelected = rows.every(r => r.selected !== null)

  async function save() {
    if (!nombre.trim() || !allSelected || !precioOferta) return
    setSaving(true)
    try {
      const productos = rows.map(r => ({
        nombre: r.selected!.flavor
          ? `${r.selected!.product.name} — ${r.selected!.flavor}`
          : r.selected!.product.name,
        imagen: r.selected!.image_url ?? r.selected!.product.image_url,
        categoria: r.selected!.product.category ?? '',
        variant_id: r.selected!.id,
      }))
      const res = await fetch('/api/paquetes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombre.trim(),
          productos,
          precio_lista: sumLista,
          precio_oferta: parseFloat(precioOferta),
          costo_real: sumCosto,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      onPackagesChange([await res.json(), ...packages])
      close()
    } catch (e) {
      alert('Error: ' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function togglePkg(pkg: Package) {
    setTogglingId(pkg.id)
    const res = await fetch(`/api/paquetes/${pkg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !pkg.activo }),
    })
    if (res.ok) {
      const updated = await res.json()
      onPackagesChange(packages.map(p => p.id === pkg.id ? updated : p))
    }
    setTogglingId(null)
  }

  async function del(id: number) {
    if (!confirm('¿Eliminar este paquete permanentemente?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/paquetes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(body?.error ?? `No se pudo eliminar el paquete (${res.status})`)
      }

      onPackagesChange(packages.filter(p => p.id !== id))
    } catch (error) {
      alert(`Error al eliminar: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
          {packages.length} paquete{packages.length !== 1 ? 's' : ''}
        </p>
        <button onClick={openModal} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 12,
          fontWeight: 700, background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer' }}>
          + Nuevo paquete
        </button>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {packages.map(pkg => {
          const pct = pkg.precio_lista > 0
            ? Math.round(((pkg.precio_lista - pkg.precio_oferta) / pkg.precio_lista) * 100) : 0
          return (
            <div key={pkg.id} style={{ padding: '12px 16px', background: 'var(--bg)', borderRadius: 10,
              border: `1px solid ${pkg.activo ? 'var(--border)' : '#4D1A1A'}`, opacity: pkg.activo ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                      background: pkg.activo ? '#1A2D1A' : '#2D1010',
                      color: pkg.activo ? '#4CAF50' : '#FF6B6B' }}>
                      {pkg.activo ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pkg.nombre}
                    </p>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {pkg.productos.map(p => p.nombre).join(' + ')}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    Lista: <span style={{ textDecoration: 'line-through' }}>{fmt(pkg.precio_lista)}</span>
                    {' → '}<span style={{ color: 'var(--accent)', fontWeight: 700 }}>{fmt(pkg.precio_oferta)}</span>
                    {' '}<span style={{ background: '#1A2D1A', color: '#4CAF50', fontSize: 10,
                      fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>-{pct}%</span>
                    {' · '}Costo: {fmt(pkg.costo_real)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => togglePkg(pkg)} disabled={togglingId === pkg.id}
                    style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', cursor: 'pointer' }}>
                    {togglingId === pkg.id ? '…' : pkg.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={() => del(pkg.id)} disabled={deletingId === pkg.id}
                    style={{ padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: '#2D1010', border: '1px solid #4D1A1A', color: '#FF6B6B', cursor: 'pointer' }}>
                    {deletingId === pkg.id ? '…' : 'Eliminar'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {packages.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay paquetes creados.
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#1f2937', borderRadius: 16,
            padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto',
            border: '1px solid #374151' }}>

            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb', margin: '0 0 4px' }}>
              🎁 Crear Paquete / Combo
            </h2>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>
              Agrega de 2 a 5 productos. Este combo se mostrará en la sección &ldquo;Paquetes en Oferta&rdquo; y no afectará tu inventario normal.
            </p>

            {loadingV && <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>Cargando inventario…</p>}

            {/* Nombre del paquete */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>
                Nombre del Paquete
              </label>
              <input value={nombre} onChange={e => setNombre(e.target.value)}
                placeholder="Ej: combo fuerza extrema…"
                style={DARK} />
            </div>

            {/* Filas de productos */}
            {rows.map((row, i) => (
              <RowInput key={i} row={row} index={i} variants={variants} categories={categories}
                onChange={updateRow} onRemove={removeRow} canRemove={rows.length > 2} />
            ))}

            {rows.length < 5 && (
              <button onClick={addRow} style={{ width: '100%', padding: '9px', borderRadius: 8,
                border: '1px dashed #374151', background: 'transparent',
                color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 16 }}>
                + Agregar otro producto al paquete (Máx 5)
              </button>
            )}

            {/* Resumen de precios */}
            {sumCosto > 0 && (
              <div style={{ padding: '14px 16px', background: '#111827', borderRadius: 10,
                marginBottom: 16, border: '1px solid #374151' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>Suma Costo Real (Admin):</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#6ee7b7' }}>{fmt(sumCosto)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>Suma Precio Público (Normal):</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(sumLista)}</span>
                </div>
              </div>
            )}

            {/* Precio oferta del paquete */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>
                💰 Precio de Venta (Oferta del Paquete)
              </label>
              <input type="number" step="0.01" min="0" value={precioOferta}
                onChange={e => setPrecioOferta(e.target.value)}
                disabled={!allSelected}
                placeholder={allSelected ? `Sugerido: menor a ${fmt(sumLista)}` : 'Completa todos los productos primero'}
                style={{ ...DARK, fontSize: 16, padding: '12px 14px',
                  border: `1px solid ${allSelected ? '#f59e0b' : '#374151'}`,
                  opacity: allSelected ? 1 : 0.5 }} />
            </div>

            {/* Botones */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={close}
                style={{ flex: 1, padding: '12px', borderRadius: 8, fontSize: 13,
                  background: 'transparent', border: '1px solid #374151', color: '#9ca3af', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={save}
                disabled={!nombre.trim() || !allSelected || !precioOferta || saving}
                style={{ flex: 2, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                  background: nombre && allSelected && precioOferta
                    ? 'linear-gradient(135deg, #7c3aed, #4f46e5)' : '#374151',
                  color: '#fff', border: 'none',
                  cursor: nombre && allSelected && precioOferta && !saving ? 'pointer' : 'not-allowed',
                  opacity: nombre && allSelected && precioOferta ? 1 : 0.6 }}>
                {saving ? 'Guardando…' : '💾 Guardar Paquete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
