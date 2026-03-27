'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SaleRow {
  id: string
  folio: string
  total: number
  payment_method: string
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_name: string | null
  customer_name: string | null
  shift_id: string | null
  items_count: number
}

interface SaleDetail {
  id: string
  variant_id: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number | null
  variant: {
    barcode: string
    flavor: string | null
    product: { name: string }
  } | null
}

interface ShiftOption {
  id: string
  label: string
}

const PAY_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', credit: 'Crédito',
  transfer: 'Transferencia', mixed: 'Mixto', wallet: 'Monedero',
}

const fmt = (n: number) => `$${Number(n).toFixed(2)}`
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
const todayStr = () => new Date().toISOString().slice(0, 10)

export default function VentasPage() {
  const supabase = createClient()
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [date, setDate] = useState(todayStr())
  const [shiftFilter, setShiftFilter] = useState<string>('all')
  const [shifts, setShifts] = useState<ShiftOption[]>([])
  const [detail, setDetail] = useState<{ sale: SaleRow; items: SaleDetail[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Cargar turnos recientes para el filtro
  useEffect(() => {
    supabase.from('shifts')
      .select('id, opened_at, cashier:profiles(name)')
      .order('opened_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!data) return
        setShifts(data.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          label: `${fmtDate((s as { opened_at: string }).opened_at)} — ${((s as { cashier: { name?: string } | null }).cashier)?.name ?? 'Sin cajero'}`,
        })))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSales = useCallback(async () => {
    setLoading(true)
    // Usar timezone local para el rango de fechas
    const start = new Date(`${date}T00:00:00`).toISOString()
    const end = new Date(`${date}T23:59:59`).toISOString()

    let q = supabase
      .from('sales')
      .select('id, total, payment_method, status, created_at, shift_id, cashier_id, customer_id')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    if (shiftFilter !== 'all') q = q.eq('shift_id', shiftFilter)

    const { data, error } = await q
    if (error) { console.error('[Ventas]', error); setLoading(false); return }
    if (!data || data.length === 0) { setSales([]); setLoading(false); return }

    const ids = data.map(s => s.id as string)
    const cashierIds = [...new Set(data.map(s => s.cashier_id as string).filter(Boolean))]
    const customerIds = [...new Set(data.map(s => s.customer_id as string).filter(Boolean))]

    // Queries en paralelo: items, cajeros, clientes
    const [itemsRes, cashiersRes, customersRes] = await Promise.all([
      supabase.from('sale_items').select('sale_id').in('sale_id', ids),
      cashierIds.length > 0
        ? supabase.from('profiles').select('id, name').in('id', cashierIds)
        : Promise.resolve({ data: [] }),
      customerIds.length > 0
        ? supabase.from('customers').select('id, name').in('id', customerIds)
        : Promise.resolve({ data: [] }),
    ])

    const countMap: Record<string, number> = {}
    for (const r of itemsRes.data ?? []) {
      const sid = (r as { sale_id: string }).sale_id
      countMap[sid] = (countMap[sid] ?? 0) + 1
    }
    const cashierMap: Record<string, string> = {}
    for (const c of cashiersRes.data ?? []) cashierMap[(c as { id: string; name: string }).id] = (c as { id: string; name: string }).name
    const customerMap: Record<string, string> = {}
    for (const c of customersRes.data ?? []) customerMap[(c as { id: string; name: string }).id] = (c as { id: string; name: string }).name

    setSales(data.map(s => ({
      id: s.id as string,
      folio: `#${(s.id as string).slice(0, 8).toUpperCase()}`,
      total: Number(s.total),
      payment_method: s.payment_method as string,
      status: s.status as 'completed' | 'cancelled',
      created_at: s.created_at as string,
      cashier_name: s.cashier_id ? (cashierMap[s.cashier_id as string] ?? null) : null,
      customer_name: s.customer_id ? (customerMap[s.customer_id as string] ?? null) : null,
      shift_id: s.shift_id as string | null,
      items_count: countMap[s.id as string] ?? 0,
    })))
    setLoading(false)
  }, [date, shiftFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadSales() }, [loadSales])

  async function openDetail(sale: SaleRow) {
    setDetailLoading(true)
    setDetail({ sale, items: [] })
    try {
      // Paso 1: obtener items
      const { data: items, error } = await supabase
        .from('sale_items')
        .select('id, variant_id, quantity, unit_price, discount, subtotal')
        .eq('sale_id', sale.id)
      if (error) throw error

      // Paso 2: obtener variantes + producto
      const variantIds = [...new Set((items ?? []).map(i => (i as { variant_id: string }).variant_id).filter(Boolean))]
      const { data: variants } = variantIds.length > 0
        ? await supabase.from('product_variants').select('id, barcode, flavor, product:products(name)').in('id', variantIds)
        : { data: [] }

      const variantMap: Record<string, { barcode: string; flavor: string | null; product: { name: string } }> = {}
      for (const v of variants ?? []) {
        const vv = v as { id: string; barcode: string; flavor: string | null; product: { name: string } | { name: string }[] }
        variantMap[vv.id] = {
          barcode: vv.barcode,
          flavor: vv.flavor,
          product: Array.isArray(vv.product) ? vv.product[0] : vv.product,
        }
      }

      const mapped: SaleDetail[] = (items ?? []).map(i => {
        const ii = i as { id: string; variant_id: string; quantity: number; unit_price: number; discount: number; subtotal: number | null }
        return { ...ii, variant: variantMap[ii.variant_id] ?? null }
      })
      setDetail({ sale, items: mapped })
    } catch (e) {
      console.error('[Ventas detail]', e)
      setDetail({ sale, items: [] })
    } finally {
      setDetailLoading(false)
    }
  }

  const totalDia = sales.filter(s => s.status === 'completed').reduce((a, s) => a + s.total, 0)
  const canceladas = sales.filter(s => s.status === 'cancelled').length

  return (
    <div className="ventas-page">
      {/* Header */}
      <div className="ventas-header">
        <div>
          <h1 className="ventas-title">Ventas</h1>
          <p className="ventas-sub">
            {sales.length} venta{sales.length !== 1 ? 's' : ''} · Total: <strong>{fmt(totalDia)}</strong>
            {canceladas > 0 && <span className="cancelled-badge"> · {canceladas} cancelada{canceladas !== 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="ventas-filters">
          <input
            type="date"
            className="filter-input"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <select
            className="filter-input"
            value={shiftFilter}
            onChange={e => setShiftFilter(e.target.value)}
          >
            <option value="all">Todos los turnos</option>
            {shifts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="ventas-table-wrap">
        {loading ? (
          <div className="ventas-loading">Cargando ventas…</div>
        ) : sales.length === 0 ? (
          <div className="ventas-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <p>No hay ventas para este día</p>
          </div>
        ) : (
          <table className="ventas-table">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Hora</th>
                <th>Cajero</th>
                <th>Cliente</th>
                <th>Método</th>
                <th>Artículos</th>
                <th>Total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {sales.map(s => (
                <tr
                  key={s.id}
                  className={`sale-row ${s.status === 'cancelled' ? 'sale-row--cancelled' : ''}`}
                  onDoubleClick={() => openDetail(s)}
                  title="Doble clic para ver detalle"
                >
                  <td className="folio-cell">{s.folio}</td>
                  <td className="time-cell">{fmtTime(s.created_at)}</td>
                  <td>{s.cashier_name ?? '—'}</td>
                  <td>{s.customer_name ?? <span className="muted">Público general</span>}</td>
                  <td><span className={`pay-badge pay-badge--${s.payment_method}`}>{PAY_LABEL[s.payment_method] ?? s.payment_method}</span></td>
                  <td className="center">{s.items_count}</td>
                  <td className="total-cell">{fmt(s.total)}</td>
                  <td>
                    <span className={`status-badge status-badge--${s.status}`}>
                      {s.status === 'completed' ? 'Completada' : 'Cancelada'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <div className="detail-header">
              <div>
                <div className="detail-folio">{detail.sale.folio}</div>
                <div className="detail-meta">
                  {fmtDate(detail.sale.created_at)} · {fmtTime(detail.sale.created_at)}
                  {detail.sale.cashier_name && ` · ${detail.sale.cashier_name}`}
                </div>
              </div>
              <button className="detail-close" onClick={() => setDetail(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="detail-body">
              {detailLoading ? (
                <div className="detail-loading">Cargando detalle…</div>
              ) : (
                <>
                  <table className="detail-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th className="center">Qty</th>
                        <th className="right">P. Unit</th>
                        <th className="right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map(item => (
                        <tr key={item.id}>
                          <td>
                            <div className="item-name">{item.variant?.product?.name ?? '—'}</div>
                            {item.variant?.flavor && <div className="item-flavor">{item.variant.flavor}</div>}
                          </td>
                          <td className="center">{item.quantity}</td>
                          <td className="right">{fmt(item.unit_price)}</td>
                          <td className="right">{fmt(item.subtotal ?? item.unit_price * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="detail-footer">
                    <div className="detail-row">
                      <span>Método de pago</span>
                      <span className={`pay-badge pay-badge--${detail.sale.payment_method}`}>{PAY_LABEL[detail.sale.payment_method] ?? detail.sale.payment_method}</span>
                    </div>
                    {detail.sale.customer_name && (
                      <div className="detail-row">
                        <span>Cliente</span>
                        <span>{detail.sale.customer_name}</span>
                      </div>
                    )}
                    <div className="detail-row detail-total">
                      <span>Total</span>
                      <span>{fmt(detail.sale.total)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ventas-page {
          flex: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          background: var(--bg-base);
        }
        .ventas-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 24px 28px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          gap: 16px;
          flex-wrap: wrap;
        }
        .ventas-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
        }
        .ventas-sub {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }
        .ventas-sub strong { color: var(--accent); font-family: var(--font-jetbrains, monospace); }
        .cancelled-badge { color: var(--danger); }
        .ventas-filters {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .filter-input {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 12px;
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }
        .filter-input:focus { border-color: var(--accent); }
        .ventas-table-wrap {
          flex: 1;
          overflow-y: auto;
          padding: 16px 28px 24px;
        }
        .ventas-loading, .ventas-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 64px;
          color: var(--text-muted);
          font-size: 14px;
        }
        .ventas-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .ventas-table th {
          text-align: left;
          padding: 8px 12px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }
        .ventas-table th.center, .ventas-table td.center { text-align: center; }
        .ventas-table th.right, .ventas-table td.right { text-align: right; }
        .sale-row {
          cursor: pointer;
          transition: background 0.1s;
          border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .sale-row:hover { background: var(--bg-hover); }
        .sale-row--cancelled { opacity: 0.5; }
        .ventas-table td {
          padding: 11px 12px;
          color: var(--text-primary);
          vertical-align: middle;
        }
        .folio-cell {
          font-family: var(--font-jetbrains, monospace);
          font-size: 12px;
          color: var(--accent) !important;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .time-cell {
          font-family: var(--font-jetbrains, monospace);
          font-size: 12px;
          color: var(--text-muted) !important;
        }
        .total-cell {
          font-family: var(--font-jetbrains, monospace);
          font-weight: 700;
        }
        .muted { color: var(--text-muted); }
        .pay-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
        }
        .pay-badge--cash { background: rgba(34,197,94,0.15); color: #22c55e; }
        .pay-badge--card { background: rgba(99,102,241,0.15); color: #818cf8; }
        .pay-badge--credit { background: rgba(239,68,68,0.15); color: #f87171; }
        .pay-badge--transfer { background: rgba(14,165,233,0.15); color: #38bdf8; }
        .pay-badge--mixed { background: rgba(240,180,41,0.15); color: #F0B429; }
        .pay-badge--wallet { background: rgba(168,85,247,0.15); color: #c084fc; }
        .status-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
        }
        .status-badge--completed { background: rgba(34,197,94,0.12); color: #22c55e; }
        .status-badge--cancelled { background: rgba(239,68,68,0.12); color: #f87171; }

        /* Detail modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .detail-modal {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          width: 560px;
          max-width: 95vw;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 24px 48px rgba(0,0,0,0.5);
          overflow: hidden;
        }
        .detail-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--border);
        }
        .detail-folio {
          font-family: var(--font-jetbrains, monospace);
          font-size: 18px;
          font-weight: 700;
          color: var(--accent);
          letter-spacing: 0.06em;
          margin-bottom: 4px;
        }
        .detail-meta {
          font-size: 12px;
          color: var(--text-muted);
        }
        .detail-close {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid var(--border);
          border-radius: 7px; color: var(--text-muted); cursor: pointer;
          transition: all 0.15s; flex-shrink: 0;
        }
        .detail-close:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.4); }
        .detail-body {
          overflow-y: auto;
          flex: 1;
        }
        .detail-loading {
          padding: 40px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
        }
        .detail-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .detail-table th {
          padding: 10px 16px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          text-align: left;
          border-bottom: 1px solid var(--border);
        }
        .detail-table td {
          padding: 10px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          color: var(--text-primary);
          vertical-align: middle;
        }
        .item-name { font-weight: 500; }
        .item-flavor { font-size: 11px; color: var(--accent); margin-top: 2px; }
        .detail-footer {
          padding: 14px 16px;
          border-top: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--text-secondary);
        }
        .detail-total {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          font-family: var(--font-jetbrains, monospace);
          padding-top: 8px;
          border-top: 1px solid var(--border);
          margin-top: 4px;
        }
      `}</style>
    </div>
  )
}
