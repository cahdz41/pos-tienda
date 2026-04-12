'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { ProductVariant } from '@/types'
import AdjustModal from './AdjustModal'

// ── Helpers ─────────────────────────────────────────────────────────────────

function getDaysUntilExpiry(date: string | null): number | null {
  if (!date) return null
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000)
}

function StockBadge({ stock, minStock }: { stock: number; minStock: number }) {
  if (stock <= 0) {
    return (
      <span style={{
        background: '#4D1010', color: '#FF6B6B',
        fontSize: '11px', padding: '2px 7px', borderRadius: '5px', fontWeight: 600,
      }}>
        Sin stock
      </span>
    )
  }
  if (stock <= minStock) {
    return (
      <span style={{
        background: '#3D2A00', color: '#F0B429',
        fontSize: '11px', padding: '2px 7px', borderRadius: '5px', fontWeight: 600,
      }}>
        {stock} bajo
      </span>
    )
  }
  return (
    <span style={{
      background: '#0D2B0D', color: '#4CAF50',
      fontSize: '11px', padding: '2px 7px', borderRadius: '5px', fontWeight: 600,
    }}>
      {stock}
    </span>
  )
}

function ExpiryCell({ date }: { date: string | null }) {
  if (!date) return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
  const days = getDaysUntilExpiry(date)
  if (days === null) return null
  const label = new Date(date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
  if (days <= 0)  return <span style={{ color: '#FF6B6B', fontSize: '12px', fontWeight: 600 }}>{label} ⚠ Vencido</span>
  if (days <= 7)  return <span style={{ color: '#FF6B6B', fontSize: '12px' }}>{label} ({days}d)</span>
  if (days <= 30) return <span style={{ color: '#F0B429', fontSize: '12px' }}>{label} ({days}d)</span>
  return <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{label}</span>
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function InventarioPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [allVariants, setAllVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [soloConExistencias, setSoloConExistencias] = useState(false)

  // Modal de ajuste de stock
  const [adjustVariant, setAdjustVariant] = useState<ProductVariant | null>(null)

  // Edición inline de fecha de caducidad
  const [editingExpiry, setEditingExpiry] = useState<string | null>(null) // variant id
  const [editingExpiryVal, setEditingExpiryVal] = useState('')
  const expiryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadInventory() }, [])

  async function loadInventory() {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const LIMIT = 500
    let all: ProductVariant[] = []
    let page = 0

    const timer = setTimeout(() => {
      setLoading(false)
      setError('Tiempo agotado. Toca para reintentar.')
    }, 15_000)

    try {
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, category')
      if (prodError) throw new Error(prodError.message)

      const productsMap: Record<string, { id: string; name: string; category: string | null }> = {}
      for (const p of (products ?? []) as Array<{ id: string; name: string; category: string | null }>) {
        productsMap[String(p.id)] = { id: String(p.id), name: p.name, category: p.category ?? null }
      }

      while (true) {
        const { data, error: dbError } = await supabase
          .from('product_variants')
          .select('id, product_id, barcode, flavor, sale_price, wholesale_price, cost_price, stock, min_stock, expiration_date')
          .range(page * LIMIT, (page + 1) * LIMIT - 1)
          .order('id')

        if (dbError) throw new Error(dbError.message)
        if (!data || data.length === 0) break

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enriched: ProductVariant[] = (data as any[])
          .filter((v: any) => v.id != null)
          .map((v: any) => ({
            id:              String(v.id),
            product_id:      String(v.product_id),
            barcode:         String(v.barcode ?? ''),
            flavor:          v.flavor ? String(v.flavor) : null,
            sale_price:      Number(v.sale_price ?? 0),
            wholesale_price: Number(v.wholesale_price ?? 0),
            cost_price:      Number(v.cost_price ?? 0),
            stock:           Number(v.stock ?? 0),
            min_stock:       Number(v.min_stock ?? 0),
            expiration_date: v.expiration_date ? String(v.expiration_date) : null,
            product: productsMap[String(v.product_id)] ?? { id: String(v.product_id), name: 'Sin nombre', category: null },
          }))

        all = [...all, ...enriched]
        if (data.length < LIMIT) break
        page++
      }

      clearTimeout(timer)
      setAllVariants(all)
    } catch (e: unknown) {
      clearTimeout(timer)
      setError('Error cargando inventario. Toca para reintentar.')
      console.error('[Inventario]', e)
    } finally {
      setLoading(false)
    }
  }

  function startEditExpiry(variantId: string, currentDate: string | null) {
    setEditingExpiry(variantId)
    setEditingExpiryVal(currentDate ?? '')
    setTimeout(() => expiryInputRef.current?.focus(), 0)
  }

  async function saveExpiry(variantId: string) {
    const newDate = editingExpiryVal || null
    setEditingExpiry(null)

    const supabase = createClient()
    const { error } = await supabase
      .from('product_variants')
      .update({ expiration_date: newDate })
      .eq('id', variantId)

    if (error) {
      console.error('[Inventario] Error guardando fecha:', error.message)
      return
    }

    setAllVariants(prev =>
      prev.map(v => v.id === variantId ? { ...v, expiration_date: newDate } : v)
    )
  }

  const filtered = useMemo(() => {
    let list = allVariants
    if (soloConExistencias) list = list.filter(v => v.stock > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(v =>
        v.product?.name?.toLowerCase().includes(q) ||
        (v.flavor ?? '').toLowerCase().includes(q) ||
        v.barcode.includes(q) ||
        (v.product?.category ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [allVariants, search, soloConExistencias])

  function handleStockSaved(
    variantId: string,
    newStock: number,
    prices?: { sale_price: number; cost_price: number; wholesale_price: number }
  ) {
    setAllVariants(prev =>
      prev.map(v => v.id === variantId
        ? { ...v, stock: newStock, ...(prices ?? {}) }
        : v
      )
    )
  }

  // ── Estados de carga / error ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-col gap-3 h-full">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando inventario…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={loadInventory} className="px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error}
        </button>
      </div>
    )
  }

  // ── Vista principal ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Inventario</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} de {allVariants.length} variantes
            </p>
          </div>
        </div>

        {/* Búsqueda + filtros */}
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, sabor, código o categoría…"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={() => setSoloConExistencias(v => !v)}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: soloConExistencias ? 'var(--accent)' : 'var(--surface)',
              color: soloConExistencias ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
            Solo con existencias
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Sin resultados{search ? ` para "${search}"` : ''}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse" style={{ minWidth: '700px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Producto', 'Código', 'Categoría', 'Stock', 'Vencimiento', 'P. Venta', 'P. Costo', 'P. Mayoreo', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}
                  style={{ borderBottom: '1px solid var(--border)' }}
                  className="hover:bg-[var(--surface)] transition-colors">

                  {/* Producto */}
                  <td className="py-2.5 px-3">
                    <p className="font-semibold text-xs leading-tight" style={{ color: 'var(--text)' }}>
                      {v.product?.name}
                    </p>
                    {v.flavor && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{v.flavor}</p>
                    )}
                  </td>

                  {/* Código */}
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      {v.barcode || '—'}
                    </span>
                  </td>

                  {/* Categoría */}
                  <td className="py-2.5 px-3">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {v.product?.category || '—'}
                    </span>
                  </td>

                  {/* Stock */}
                  <td className="py-2.5 px-3">
                    <StockBadge stock={v.stock} minStock={v.min_stock} />
                  </td>

                  {/* Vencimiento — editable inline para owner */}
                  <td className="py-2.5 px-3">
                    {isOwner && editingExpiry === v.id ? (
                      <input
                        ref={expiryInputRef}
                        type="date"
                        value={editingExpiryVal}
                        onChange={e => setEditingExpiryVal(e.target.value)}
                        onBlur={() => saveExpiry(v.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveExpiry(v.id)
                          if (e.key === 'Escape') setEditingExpiry(null)
                        }}
                        className="rounded px-2 py-0.5 text-xs outline-none"
                        style={{
                          background: 'var(--bg)', border: '1px solid var(--accent)',
                          color: 'var(--text)', width: '130px',
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => isOwner && startEditExpiry(v.id, v.expiration_date)}
                        style={{ cursor: isOwner ? 'pointer' : 'default' }}
                        title={isOwner ? 'Clic para editar fecha' : undefined}
                      >
                        <ExpiryCell date={v.expiration_date} />
                        {isOwner && !v.expiration_date && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>+ fecha</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Precios */}
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                      ${v.sale_price.toLocaleString('es-MX')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      ${v.cost_price.toLocaleString('es-MX')}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                      ${v.wholesale_price.toLocaleString('es-MX')}
                    </span>
                  </td>

                  {/* Acción ajuste de stock */}
                  <td className="py-2.5 px-3">
                    <button
                      onClick={() => setAdjustVariant(v)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                    >
                      Ajustar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal ajuste de stock */}
      {adjustVariant && (
        <AdjustModal
          variant={adjustVariant}
          onClose={() => setAdjustVariant(null)}
          onSaved={handleStockSaved}
        />
      )}
    </div>
  )
}
