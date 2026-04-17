'use client'

import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string
  total: number
  payment_method: string
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_id: string
  cashier_name: string
  item_count: number
  item_names: string
}

interface SaleDetail {
  id: string
  total: number
  payment_method: string
  amount_paid: number
  change_given: number
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_name: string
  items: {
    id: string
    name: string
    flavor: string | null
    quantity: number
    unit_price: number
    subtotal: number
  }[]
}

interface Cashier {
  id: string
  name: string
}

type ExportRange = 'day' | 'week' | 'month' | 'custom'

// ── Helpers ──────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  cash:     'Efectivo',
  card:     'Tarjeta',
  transfer: 'Transferencia',
  credit:   'Crédito',
  mixed:    'Mixto',
}

const METHOD_COLOR: Record<string, string> = {
  cash:     '#4ade80',
  card:     '#60a5fa',
  transfer: '#34d399',
  credit:   '#f59e0b',
  mixed:    '#a78bfa',
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const target = new Date(y, m - 1, d)

  if (target.getTime() === today.getTime()) return 'Hoy'
  if (target.getTime() === yesterday.getTime()) return 'Ayer'
  return target.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Devuelve {start, end} ISO para el rango elegido, relativo a selectedDate */
function getRangeISO(range: ExportRange, selectedDate: string, customFrom: string, customTo: string) {
  const now = new Date()
  if (range === 'day') {
    const [y, m, d] = selectedDate.split('-').map(Number)
    return {
      start: new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(),
      end:   new Date(y, m - 1, d, 23, 59, 59, 999).toISOString(),
      label: selectedDate,
    }
  }
  if (range === 'week') {
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    return {
      start: monday.toISOString(),
      end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString(),
      label: `semana-${toLocalDateStr(monday)}`,
    }
  }
  if (range === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    return {
      start: first.toISOString(),
      end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString(),
      label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    }
  }
  // custom
  const [fy, fm, fd] = customFrom.split('-').map(Number)
  const [ty, tm, td] = customTo.split('-').map(Number)
  return {
    start: new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString(),
    end:   new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString(),
    label: `${customFrom}_${customTo}`,
  }
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function VentasPage() {
  const [selectedDate, setSelectedDate]   = useState<string>(toLocalDateStr(new Date()))
  const [cashiers, setCashiers]           = useState<Cashier[]>([])
  const [cashierFilter, setCashierFilter] = useState<string>('all')
  const [sales, setSales]                 = useState<SaleRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [detail, setDetail]               = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)

  // Export
  const [showExport, setShowExport]     = useState(false)
  const [exportRange, setExportRange]   = useState<ExportRange>('day')
  const [exportFrom, setExportFrom]     = useState<string>(toLocalDateStr(new Date()))
  const [exportTo, setExportTo]         = useState<string>(toLocalDateStr(new Date()))
  const [exporting, setExporting]       = useState(false)

  // Cargar cajeros al montar
  useEffect(() => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any)
      .from('profiles')
      .select('id, name')
      .order('name')
      .then(({ data }: { data: Cashier[] | null }) => {
        if (data) setCashiers(data)
      })
  }, [])

  // Cargar ventas cuando cambia fecha o cajero
  const loadSales = useCallback(async () => {
    setLoading(true)
    setDetail(null)
    const supabase = createClient()

    const [y, m, d] = selectedDate.split('-').map(Number)
    const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString()
    const end   = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('sales')
      .select('id, total, payment_method, status, created_at, cashier_id, sale_items(id, quantity)')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    if (cashierFilter !== 'all') query = query.eq('cashier_id', cashierFilter)

    const { data: salesData, error } = await query
    if (error || !salesData) { setLoading(false); return }

    // Nombres de cajeros
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashierIds = [...new Set((salesData as any[]).map((s: any) => s.cashier_id))]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashierMap: Record<string, string> = {}
    if (cashierIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, name').in('id', cashierIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (profiles) for (const p of profiles) cashierMap[p.id] = p.name
    }

    // Preview de productos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saleIds = (salesData as any[]).map((s: any) => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemPreviewMap: Record<string, string> = {}
    if (saleIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items } = await (supabase as any)
        .from('sale_items')
        .select('sale_id, product_variants(flavor, products(name))')
        .in('sale_id', saleIds)
      if (items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const grouped: Record<string, string[]> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of items) {
          const name = item.product_variants?.products?.name ?? 'Sin nombre'
          if (!grouped[item.sale_id]) grouped[item.sale_id] = []
          if (!grouped[item.sale_id].includes(name)) grouped[item.sale_id].push(name)
        }
        for (const id of Object.keys(grouped))
          itemPreviewMap[id] = grouped[id].slice(0, 3).join(', ') + (grouped[id].length > 3 ? '…' : '')
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSales((salesData as any[]).map((s: any) => ({
      id:             s.id,
      total:          s.total,
      payment_method: s.payment_method,
      status:         s.status,
      created_at:     s.created_at,
      cashier_id:     s.cashier_id,
      cashier_name:   cashierMap[s.cashier_id] ?? 'Desconocido',
      item_count:     (s.sale_items ?? []).length,
      item_names:     itemPreviewMap[s.id] ?? '—',
    })))
    setLoading(false)
  }, [selectedDate, cashierFilter])

  useEffect(() => { loadSales() }, [loadSales])

  // Detalle de una venta
  async function loadDetail(saleId: string) {
    setDetailLoading(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sale } = await (supabase as any)
      .from('sales')
      .select('id, total, payment_method, amount_paid, change_given, status, created_at, cashier_id')
      .eq('id', saleId).single()
    if (!sale) { setDetailLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase as any)
      .from('sale_items')
      .select('id, quantity, unit_price, subtotal, product_variants(id, flavor, products(name))')
      .eq('sale_id', saleId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cashierProfile } = await (supabase as any)
      .from('profiles').select('name').eq('id', sale.cashier_id).single()

    setDetail({
      id:             sale.id,
      total:          sale.total,
      payment_method: sale.payment_method,
      amount_paid:    sale.amount_paid,
      change_given:   sale.change_given,
      status:         sale.status,
      created_at:     sale.created_at,
      cashier_name:   cashierProfile?.name ?? 'Desconocido',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (items ?? []).map((i: any) => ({
        id:         i.id,
        name:       i.product_variants?.products?.name ?? 'Sin nombre',
        flavor:     i.product_variants?.flavor ?? null,
        quantity:   i.quantity,
        unit_price: i.unit_price,
        subtotal:   i.subtotal,
      })),
    })
    setDetailLoading(false)
  }

  // ── Exportar a Excel ─────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true)
    const supabase = createClient()
    const { start, end, label } = getRangeISO(exportRange, selectedDate, exportFrom, exportTo)

    // 1. Traer ventas del rango
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: salesData } = await (supabase as any)
      .from('sales')
      .select('id, total, payment_method, amount_paid, change_given, status, created_at, cashier_id')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })

    if (!salesData || salesData.length === 0) {
      setExporting(false)
      setShowExport(false)
      return
    }

    // 2. Nombres de cajeros
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashierIds = [...new Set((salesData as any[]).map((s: any) => s.cashier_id))]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashierMap: Record<string, string> = {}
    if (cashierIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, name').in('id', cashierIds)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (profiles) for (const p of profiles) cashierMap[p.id] = p.name
    }

    // 3. Items de todas las ventas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saleIds = (salesData as any[]).map((s: any) => s.id)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: allItems } = await (supabase as any)
      .from('sale_items')
      .select('sale_id, quantity, unit_price, subtotal, product_variants(flavor, products(name))')
      .in('sale_id', saleIds)

    // Mapa sale_id → nombres para preview
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const previewMap: Record<string, string[]> = {}
    if (allItems) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of allItems) {
        const name = item.product_variants?.products?.name ?? 'Sin nombre'
        if (!previewMap[item.sale_id]) previewMap[item.sale_id] = []
        if (!previewMap[item.sale_id].includes(name)) previewMap[item.sale_id].push(name)
      }
    }

    // ── Hoja 1: Resumen de ventas ──────────────────────────────────────────

    const summaryHeaders = [
      'Folio', 'Fecha', 'Hora', 'Cajero', 'Productos', 'Método de Pago',
      'Total', 'Pagó', 'Cambio', 'Estado',
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summaryRows = (salesData as any[]).map((s: any) => {
      const dt = new Date(s.created_at)
      return [
        s.id.slice(-6).toUpperCase(),
        dt.toLocaleDateString('es-MX'),
        dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }),
        cashierMap[s.cashier_id] ?? 'Desconocido',
        (previewMap[s.id] ?? []).join(', ') || '—',
        METHOD_LABEL[s.payment_method] ?? s.payment_method,
        s.total,
        s.amount_paid,
        s.change_given,
        s.status === 'completed' ? 'Completada' : 'Anulada',
      ]
    })

    const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows])

    // Anchos de columna para el resumen
    wsSummary['!cols'] = [
      { wch: 10 }, // Folio
      { wch: 13 }, // Fecha
      { wch: 10 }, // Hora
      { wch: 18 }, // Cajero
      { wch: 40 }, // Productos
      { wch: 14 }, // Método
      { wch: 12 }, // Total
      { wch: 12 }, // Pagó
      { wch: 12 }, // Cambio
      { wch: 12 }, // Estado
    ]

    // ── Hoja 2: Detalle por línea ──────────────────────────────────────────

    const detailHeaders = [
      'Folio', 'Fecha', 'Hora', 'Cajero', 'Producto', 'Sabor',
      'Cantidad', 'Precio Unitario', 'Subtotal', 'Estado Venta',
    ]

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detailRows: unknown[][] = []
    if (allItems) {
      // Mapa rápido de venta → metadatos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saleMetaMap: Record<string, any> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of salesData as any[]) saleMetaMap[s.id] = s

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const item of allItems as any[]) {
        const s = saleMetaMap[item.sale_id]
        if (!s) continue
        const dt = new Date(s.created_at)
        detailRows.push([
          s.id.slice(-6).toUpperCase(),
          dt.toLocaleDateString('es-MX'),
          dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }),
          cashierMap[s.cashier_id] ?? 'Desconocido',
          item.product_variants?.products?.name ?? 'Sin nombre',
          item.product_variants?.flavor ?? '—',
          item.quantity,
          item.unit_price,
          item.subtotal,
          s.status === 'completed' ? 'Completada' : 'Anulada',
        ])
      }
    }

    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])
    wsDetail['!cols'] = [
      { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 18 },
      { wch: 28 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 14 },
    ]

    // ── Crear libro y descargar ────────────────────────────────────────────

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ventas')
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle líneas')
    XLSX.writeFile(wb, `ventas-${label}.xlsx`)

    setExporting(false)
    setShowExport(false)
  }

  // ── Estadísticas ─────────────────────────────────────────────────────────

  const completed     = sales.filter(s => s.status === 'completed')
  const totalRevenue  = completed.reduce((s, r) => s + r.total, 0)
  const cashTotal     = completed.filter(s => s.payment_method === 'cash').reduce((s, r) => s + r.total, 0)
  const cardTotal     = completed.filter(s => s.payment_method === 'card').reduce((s, r) => s + r.total, 0)

  // ── Navegación de fechas ──────────────────────────────────────────────────

  function shiftDate(days: number) {
    const [y, m, d] = selectedDate.split('-').map(Number)
    setSelectedDate(toLocalDateStr(new Date(y, m - 1, d + days)))
  }

  const isToday = selectedDate === toLocalDateStr(new Date())

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Panel principal ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
        >
          <div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>Historial de Ventas</h1>
            <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {formatDateLabel(selectedDate)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Exportar */}
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#052e16', color: '#4ade80', border: '1px solid #166534' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Exportar Excel
            </button>

            {/* Cajero filter */}
            <select
              value={cashierFilter}
              onChange={e => setCashierFilter(e.target.value)}
              className="text-xs rounded-lg px-3 py-2 outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}
            >
              <option value="all">Todos los cajeros</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* Fecha anterior */}
            <button
              onClick={() => shiftDate(-1)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-opacity hover:opacity-70"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Día anterior"
            >‹</button>

            {/* Date picker */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <span>📅</span>
                <span>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
              </button>
              {showDatePicker && (
                <div
                  className="absolute right-0 top-10 z-50 rounded-xl p-1 shadow-2xl"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                  <input
                    type="date"
                    value={selectedDate}
                    max={toLocalDateStr(new Date())}
                    onChange={e => { setSelectedDate(e.target.value); setShowDatePicker(false) }}
                    className="rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: 'var(--bg)', border: 'none', color: 'var(--text)', colorScheme: 'dark' }}
                    autoFocus
                    onBlur={() => setTimeout(() => setShowDatePicker(false), 150)}
                  />
                </div>
              )}
            </div>

            {/* Fecha siguiente */}
            <button
              onClick={() => shiftDate(1)}
              disabled={isToday}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-opacity hover:opacity-70 disabled:opacity-30"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              title="Día siguiente"
            >›</button>

            {/* Hoy */}
            {!isToday && (
              <button
                onClick={() => setSelectedDate(toLocalDateStr(new Date()))}
                className="px-3 py-2 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                Hoy
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-0 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          {[
            { label: 'Total del día',  value: fmt(totalRevenue), sub: `${completed.length} venta${completed.length !== 1 ? 's' : ''}`, color: 'var(--accent)' },
            { label: 'Efectivo',       value: fmt(cashTotal),    sub: `${completed.filter(s => s.payment_method === 'cash').length} transacciones`, color: '#4ade80' },
            { label: 'Tarjeta',        value: fmt(cardTotal),    sub: `${completed.filter(s => s.payment_method === 'card').length} transacciones`, color: '#60a5fa' },
            { label: 'Anuladas',       value: String(sales.filter(s => s.status === 'cancelled').length), sub: 'ventas canceladas', color: '#FF6B6B' },
          ].map(stat => (
            <div key={stat.label} className="px-5 py-3" style={{ borderRight: '1px solid var(--border)' }}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              <p className="text-xl font-black font-mono mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : sales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{ background: 'var(--surface)' }}>🧾</div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                Sin ventas para este día
              </p>
            </div>
          ) : (
            <>
              <div
                className="grid text-xs font-semibold px-4 py-2 sticky top-0"
                style={{
                  gridTemplateColumns: '90px 70px 1fr 130px 90px 100px',
                  color: 'var(--text-muted)',
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span>Folio</span>
                <span>Hora</span>
                <span>Productos</span>
                <span>Cajero</span>
                <span>Método</span>
                <span className="text-right">Total</span>
              </div>

              {sales.map(sale => {
                const isSelected  = detail?.id === sale.id
                const isCancelled = sale.status === 'cancelled'
                return (
                  <button
                    key={sale.id}
                    onClick={() => loadDetail(sale.id)}
                    className="w-full text-left grid px-4 py-3 transition-colors"
                    style={{
                      gridTemplateColumns: '90px 70px 1fr 130px 90px 100px',
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(250,200,0,0.07)' : 'transparent',
                      opacity: isCancelled ? 0.5 : 1,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      #{sale.id.slice(-6).toUpperCase()}
                      {isCancelled && <span className="ml-1 text-xs" style={{ color: '#FF6B6B' }}>✕</span>}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatHour(sale.created_at)}</span>
                    <span className="text-xs truncate pr-2" style={{ color: 'var(--text)' }}>{sale.item_names}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sale.cashier_name}</span>
                    <span>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: `${METHOD_COLOR[sale.payment_method] ?? '#888'}22`,
                          color: METHOD_COLOR[sale.payment_method] ?? '#888',
                        }}
                      >
                        {METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                      </span>
                    </span>
                    <span
                      className="text-sm font-black font-mono text-right"
                      style={{ color: isCancelled ? '#FF6B6B' : 'var(--accent)' }}
                    >
                      {fmt(sale.total)}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Panel de detalle ─────────────────────────────────────────────── */}
      <div
        className="flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: detail || detailLoading ? '320px' : '0px',
          borderLeft: detail || detailLoading ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)',
          overflow: 'hidden',
        }}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 w-80">
            <div className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : detail ? (
          <div className="flex flex-col h-full overflow-y-auto w-80">
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0 sticky top-0"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}
            >
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  Ticket #{detail.id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {formatHour(detail.created_at)} · {detail.cashier_name}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
              >×</button>
            </div>

            <div className="px-4 pt-3">
              <span
                className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: detail.status === 'completed' ? '#052e16' : '#2D1010',
                  color: detail.status === 'completed' ? '#4ade80' : '#FF6B6B',
                }}
              >
                {detail.status === 'completed' ? 'Completada' : 'Anulada'}
              </span>
            </div>

            <div className="px-4 pt-3 flex flex-col gap-1.5">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Productos</p>
              {detail.items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {item.name}{item.flavor ? ` — ${item.flavor}` : ''}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.quantity} × {fmt(item.unit_price)}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold ml-2 shrink-0" style={{ color: 'var(--text)' }}>
                    {fmt(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="px-4 pt-4 pb-4 mt-auto">
              <div className="rounded-xl p-3 flex flex-col gap-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Método de pago</span>
                  <span className="font-semibold" style={{ color: METHOD_COLOR[detail.payment_method] ?? 'var(--text)' }}>
                    {METHOD_LABEL[detail.payment_method] ?? detail.payment_method}
                  </span>
                </div>
                {detail.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Pagó</span>
                      <span style={{ color: 'var(--text)' }}>{fmt(detail.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Cambio</span>
                      <span style={{ color: 'var(--text)' }}>{fmt(detail.change_given)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-sm pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="font-bold" style={{ color: 'var(--text)' }}>Total</span>
                  <span className="font-black font-mono" style={{ color: 'var(--accent)' }}>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Modal de exportación ─────────────────────────────────────────── */}
      {showExport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowExport(false) }}
        >
          <div
            className="w-full max-w-sm rounded-2xl flex flex-col gap-0 overflow-hidden shadow-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            {/* Header del modal */}
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: '#052e16' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Exportar a Excel</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Elige el período a exportar</p>
                </div>
              </div>
              <button
                onClick={() => setShowExport(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
              >×</button>
            </div>

            {/* Opciones de período */}
            <div className="p-4 flex flex-col gap-2">
              {([
                { id: 'day',   label: 'Día actual',          sub: `${formatDateLabel(selectedDate)} (${selectedDate})` },
                { id: 'week',  label: 'Esta semana',          sub: 'Lunes de esta semana hasta hoy' },
                { id: 'month', label: 'Este mes',             sub: new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) },
                { id: 'custom', label: 'Período personalizado', sub: 'Selecciona un rango de fechas' },
              ] as { id: ExportRange; label: string; sub: string }[]).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setExportRange(opt.id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{
                    background: exportRange === opt.id ? '#052e16' : 'var(--bg)',
                    border: `1px solid ${exportRange === opt.id ? '#166534' : 'var(--border)'}`,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{
                      border: `2px solid ${exportRange === opt.id ? '#4ade80' : 'var(--border)'}`,
                      background: exportRange === opt.id ? '#4ade80' : 'transparent',
                    }}
                  >
                    {exportRange === opt.id && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#000' }} />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: exportRange === opt.id ? '#4ade80' : 'var(--text)' }}>
                      {opt.label}
                    </p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{opt.sub}</p>
                  </div>
                </button>
              ))}

              {/* Rango personalizado */}
              {exportRange === 'custom' && (
                <div
                  className="flex items-center gap-2 mt-1 px-4 py-3 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                >
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Desde</p>
                    <input
                      type="date"
                      value={exportFrom}
                      max={exportTo}
                      onChange={e => setExportFrom(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }}
                    />
                  </div>
                  <div className="text-xs pt-4" style={{ color: 'var(--text-muted)' }}>—</div>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Hasta</p>
                    <input
                      type="date"
                      value={exportTo}
                      min={exportFrom}
                      max={toLocalDateStr(new Date())}
                      onChange={e => setExportTo(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Info del archivo */}
            <div
              className="mx-4 mb-4 px-3 py-2.5 rounded-xl text-xs"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              El archivo incluirá <span style={{ color: 'var(--text)' }}>2 hojas</span>:{' '}
              <span style={{ color: 'var(--accent)' }}>Ventas</span> (resumen por ticket) y{' '}
              <span style={{ color: 'var(--accent)' }}>Detalle líneas</span> (una fila por producto vendido).
            </div>

            {/* Botones */}
            <div className="flex gap-2 px-4 pb-4">
              <button
                onClick={() => setShowExport(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleExport}
                disabled={exporting || (exportRange === 'custom' && (!exportFrom || !exportTo))}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity"
                style={{
                  background: '#166534',
                  color: '#4ade80',
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                {exporting ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 animate-spin"
                      style={{ borderColor: '#4ade80', borderTopColor: 'transparent' }} />
                    Generando…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Descargar .xlsx
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
