'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

// ── Tipos locales ────────────────────────────────────────────────────────────

interface VoidSaleItem {
  id: string
  variant_id: string
  quantity: number
  unit_price: number
  subtotal: number
  name: string
  flavor: string | null
}

interface VoidableSale {
  id: string
  total: number
  payment_method: string
  created_at: string
  items: VoidSaleItem[]
}

interface Props {
  onClose: () => void
  onVoided: () => void   // dispara refreshKey en el POS
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', credit: 'Crédito', mixed: 'Mixto',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function VoidSaleModal({ onClose, onVoided }: Props) {
  const [sales, setSales]       = useState<VoidableSale[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<VoidableSale | null>(null)
  const [reason, setReason]     = useState('')
  const [processing, setProcessing] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')

  useEffect(() => { loadSales() }, [])

  async function loadSales() {
    setLoading(true)
    const supabase = createClient()
    const cutoff = new Date(Date.now() - 48 * 3_600_000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from('sales')
      .select('id, total, payment_method, created_at, sale_items(id, variant_id, quantity, unit_price, subtotal)')
      .eq('status', 'completed')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(30)

    if (err || !data) { setLoading(false); return }

    // Obtener nombres de variantes en una sola query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allItems: any[] = data.flatMap((s: any) => s.sale_items ?? [])
    const variantIds = [...new Set(allItems.map((i: any) => i.variant_id))]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let variantMap: Record<string, { name: string; flavor: string | null }> = {}
    if (variantIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: variants } = await (supabase as any)
        .from('product_variants')
        .select('id, flavor, products(name)')
        .in('id', variantIds)

      if (variants) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const v of variants) {
          variantMap[v.id] = { name: v.products?.name ?? 'Sin nombre', flavor: v.flavor ?? null }
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: VoidableSale[] = data.map((s: any) => ({
      id: s.id,
      total: s.total,
      payment_method: s.payment_method,
      created_at: s.created_at,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (s.sale_items ?? []).map((i: any) => ({
        id: i.id,
        variant_id: i.variant_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
        name: variantMap[i.variant_id]?.name ?? 'Sin nombre',
        flavor: variantMap[i.variant_id]?.flavor ?? null,
      })),
    }))

    setSales(result)
    setLoading(false)
  }

  async function handleVoid() {
    if (!selected) return
    setProcessing(true)
    setError(null)
    const supabase = createClient()

    try {
      // 1 — Marcar venta como cancelada
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: cancelErr } = await (supabase as any)
        .from('sales')
        .update({ status: 'cancelled' })
        .eq('id', selected.id)

      if (cancelErr) throw new Error(cancelErr.message)

      // 2 — Restaurar stock (obtener valores actuales primero)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: currentVariants } = await (supabase as any)
        .from('product_variants')
        .select('id, stock')
        .in('id', selected.items.map(i => i.variant_id))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stockMap: Record<string, number> = {}
      if (currentVariants) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const v of currentVariants) stockMap[v.id] = v.stock
      }

      await Promise.allSettled(
        selected.items.map(item =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from('product_variants')
            .update({ stock: (stockMap[item.variant_id] ?? 0) + item.quantity })
            .eq('id', item.variant_id)
        )
      )

      onVoided()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al anular la venta')
      setProcessing(false)
    }
  }

  const filtered = search.trim()
    ? sales.filter(s =>
        s.id.slice(-6).toLowerCase().includes(search.toLowerCase()) ||
        String(s.total).includes(search) ||
        s.items.some(i => i.name.toLowerCase().includes(search.toLowerCase()))
      )
    : sales

  // ── Pantalla de confirmación ─────────────────────────────────────────────
  if (selected) {
    const totalItems = selected.items.reduce((s, i) => s + i.quantity, 0)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)' }}>
        <div className="w-full max-w-sm rounded-2xl flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

          <div className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ background: '#2D1010', border: '2px solid #FF6B6B' }}>
              ⚠
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Confirmar anulación</p>
              <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                #{selected.id.slice(-6).toUpperCase()} — ${selected.total.toLocaleString('es-MX')}
              </p>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3">
            {/* Items */}
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {selected.items.map(item => (
                <div key={item.id} className="flex justify-between px-3 py-2"
                  style={{ borderBottom: '1px solid var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>
                    {item.name}{item.flavor ? ` — ${item.flavor}` : ''} ×{item.quantity}
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    ${item.subtotal.toLocaleString('es-MX')}
                  </span>
                </div>
              ))}
            </div>

            {/* Motivo */}
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Motivo (opcional)"
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            />

            <p className="text-xs" style={{ color: '#F0B429' }}>
              Se restaurará el stock de {totalItems} {totalItems === 1 ? 'producto' : 'productos'} automáticamente.
            </p>

            {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

            <div className="flex gap-2 mt-1">
              <button onClick={() => { setSelected(null); setReason('') }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={handleVoid} disabled={processing}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: '#8B0000', color: '#fff', opacity: processing ? 0.7 : 1 }}>
                {processing ? 'Anulando…' : 'Anular venta'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Lista de ventas ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Anular venta</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Últimas 48 horas</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Búsqueda */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por monto, producto o #ID…"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
            autoFocus
          />
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {sales.length === 0 ? 'No hay ventas en las últimas 48 horas' : 'Sin resultados'}
              </p>
            </div>
          ) : (
            <div className="p-3 flex flex-col gap-2">
              {filtered.map(sale => (
                <button key={sale.id} onClick={() => setSelected(sale)}
                  className="w-full text-left rounded-xl p-3 transition-colors hover:opacity-80"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold" style={{ color: 'var(--text-muted)' }}>
                      #{sale.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-base font-black font-mono" style={{ color: 'var(--accent)' }}>
                      ${sale.total.toLocaleString('es-MX')}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text)' }}>
                    {sale.items.map(i => `${i.name}${i.flavor ? ` ${i.flavor}` : ''}`).join(', ')}
                  </p>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                      {formatTime(sale.created_at)}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
