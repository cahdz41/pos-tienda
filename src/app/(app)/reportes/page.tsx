'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

type Period = 'today' | '7days' | 'month' | '30days'

interface SaleRow {
  id: string
  total: number
  payment_method: string
  created_at: string
}

interface ItemRow {
  sale_id: string
  quantity: number
  subtotal: number
  product_variants: {
    cost_price: number
    products: { name: string; category: string | null } | null
  } | null
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getStart(period: Period): Date {
  const now = new Date()
  switch (period) {
    case 'today':  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    case '7days':  return new Date(Date.now() - 7  * 86_400_000)
    case 'month':  return new Date(now.getFullYear(), now.getMonth(), 1)
    case '30days': return new Date(Date.now() - 30 * 86_400_000)
  }
}

// ── Gráfica de barras SVG ─────────────────────────────────────────────────

const CW      = 500
const CH      = 150
const PAD_TOP = 36   // espacio para tooltip de 2 líneas
const PAD_BOT = 20

interface ChartBar { label: string; revenue: number; profit: number }

function BarChart({ data }: { data: ChartBar[] }) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-24"
        style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Sin ventas en el período
      </div>
    )
  }

  const maxVal = Math.max(...data.map(d => d.revenue), 1)
  const n      = data.length
  const barW   = Math.max(6, (CW - 20) / n * 0.6)
  const gap    = (CW - 20 - barW * n) / (n + 1)
  const totalH = CH + PAD_TOP + PAD_BOT
  const step   = n <= 15 ? 1 : Math.ceil(n / 10)

  return (
    <svg viewBox={`0 0 ${CW} ${totalH}`} style={{ width: '100%', height: 'auto' }}>
      {data.map((d, i) => {
        const barH  = Math.max(2, (d.revenue / maxVal) * CH)
        const x     = 10 + gap + i * (barW + gap)
        const y     = PAD_TOP + CH - barH
        const cx    = x + barW / 2
        const isHov = hovered === i

        return (
          <g key={i}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}>
            {/* Área hover */}
            <rect x={x - gap / 2} y={PAD_TOP} width={barW + gap} height={CH}
              fill="transparent" style={{ cursor: 'default' }} />
            {/* Barra */}
            <rect x={x} y={y} width={barW} height={barH} rx={2}
              style={{ fill: isHov ? 'var(--accent)' : '#7A6800', transition: 'fill 0.1s' }} />
            {/* Etiqueta de día */}
            {i % step === 0 && (
              <text x={cx} y={PAD_TOP + CH + PAD_BOT - 2} textAnchor="middle"
                style={{ fontSize: n > 20 ? 6 : 8, fill: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {d.label}
              </text>
            )}
            {/* Tooltip: venta (ámbar) + ganancia (verde) */}
            {isHov && (
              <>
                <text x={cx} y={y - 14} textAnchor="middle"
                  style={{ fontSize: 9, fontWeight: 'bold', fontFamily: 'monospace', fill: 'var(--accent)' }}>
                  {fmt(d.revenue)}
                </text>
                <text x={cx} y={y - 3} textAnchor="middle"
                  style={{ fontSize: 8, fontFamily: 'monospace', fill: '#4CAF50' }}>
                  {fmt(d.profit)}
                </text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Barra horizontal ──────────────────────────────────────────────────────

function HBar({ label, value, maxVal, color, suffix = '' }: {
  label: string; value: number; maxVal: number; color: string; suffix?: string
}) {
  const pct = maxVal > 0 ? (value / maxVal) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs shrink-0 w-24 truncate text-right" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono shrink-0 w-20 text-right" style={{ color: 'var(--text)' }}>
        {suffix}
      </span>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',  label: 'Hoy'      },
  { key: '7days',  label: '7 días'   },
  { key: 'month',  label: 'Este mes' },
  { key: '30days', label: '30 días'  },
]

const METHOD_META: Record<string, { label: string; color: string }> = {
  cash:   { label: 'Efectivo', color: '#4CAF50' },
  card:   { label: 'Tarjeta',  color: '#2196F3' },
  mixed:  { label: 'Mixto',    color: '#9C27B0' },
  credit: { label: 'Crédito',  color: '#FF6B6B' },
}

export default function ReportesPage() {
  const [period,  setPeriod]  = useState<Period>('7days')
  const [loading, setLoading] = useState(true)
  const [sales,   setSales]   = useState<SaleRow[]>([])
  const [items,   setItems]   = useState<ItemRow[]>([])

  useEffect(() => { loadData() }, [period])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()
    const start    = getStart(period)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: salesData } = await (supabase as any)
      .from('sales')
      .select('id, total, payment_method, created_at')
      .eq('status', 'completed')
      .gte('created_at', start.toISOString())
      .order('created_at')

    const salesList = (salesData ?? []) as SaleRow[]
    setSales(salesList)

    if (salesList.length > 0) {
      const ids = salesList.map(s => s.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: itemsData } = await (supabase as any)
        .from('sale_items')
        .select('sale_id, quantity, subtotal, product_variants(cost_price, products(name, category))')
        .in('sale_id', ids)
      setItems((itemsData ?? []) as ItemRow[])
    } else {
      setItems([])
    }

    setLoading(false)
  }

  // ── KPIs ──────────────────────────────────────────────────────────────
  const totalRevenue = sales.reduce((s, x) => s + x.total, 0)
  const txCount      = sales.length
  const avgTicket    = txCount > 0 ? totalRevenue / txCount : 0
  const cashTx       = sales.filter(s => s.payment_method === 'cash' || s.payment_method === 'mixed').length
  const pctCash      = txCount > 0 ? (cashTx / txCount) * 100 : 0

  const totalProfit  = items.reduce((s, item) => {
    const cost = item.product_variants?.cost_price ?? 0
    return s + item.subtotal - cost * item.quantity
  }, 0)

  // ── Ventas + ganancia por día ─────────────────────────────────────────
  const saleDateMap: Record<string, string> = {}
  for (const s of sales) saleDateMap[s.id] = s.created_at.substring(0, 10)

  const byDay: Record<string, { revenue: number; profit: number }> = {}
  for (const s of sales) {
    const day = s.created_at.substring(0, 10)
    if (!byDay[day]) byDay[day] = { revenue: 0, profit: 0 }
    byDay[day].revenue += s.total
  }
  for (const item of items) {
    const day = saleDateMap[item.sale_id]
    if (!day || !byDay[day]) continue
    const cost = item.product_variants?.cost_price ?? 0
    byDay[day].profit += item.subtotal - cost * item.quantity
  }

  const chartData: ChartBar[] = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      label: new Date(date + 'T12:00:00').toLocaleDateString('es-MX', {
        day: '2-digit', month: '2-digit',
      }),
      revenue: v.revenue,
      profit:  v.profit,
    }))

  // ── Desglose por método ───────────────────────────────────────────────
  const methodCount: Record<string, number> = {}
  for (const s of sales) {
    methodCount[s.payment_method] = (methodCount[s.payment_method] || 0) + 1
  }

  // ── Ventas por departamento ───────────────────────────────────────────
  const catMap: Record<string, number> = {}
  for (const item of items) {
    const cat = item.product_variants?.products?.category ?? 'Sin categoría'
    catMap[cat] = (catMap[cat] || 0) + item.subtotal
  }
  const catData = Object.entries(catMap)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
  const maxCatRevenue = catData[0]?.revenue ?? 1

  // ── Top 10 productos ──────────────────────────────────────────────────
  const productMap: Record<string, { units: number; revenue: number }> = {}
  for (const item of items) {
    const name = item.product_variants?.products?.name ?? 'Sin nombre'
    if (!productMap[name]) productMap[name] = { units: 0, revenue: 0 }
    productMap[name].units   += item.quantity
    productMap[name].revenue += item.subtotal
  }
  const top10 = Object.entries(productMap)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 10)

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Reportes</h1>
          <div className="flex gap-0.5 p-1 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className="px-3 py-1 rounded-lg text-xs font-semibold"
                style={{
                  background: period === p.key ? 'var(--accent)' : 'transparent',
                  color:      period === p.key ? '#000' : 'var(--text-muted)',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-7 h-7 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">

            {/* ── KPIs ── */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: 'Ingresos',      value: fmt(totalRevenue), color: 'var(--accent)' },
                { label: 'Ganancia',      value: fmt(totalProfit),  color: '#4CAF50'       },
                { label: 'Transacciones', value: String(txCount),    color: 'var(--text)'   },
                { label: 'Ticket prom.',  value: fmt(avgTicket),    color: '#F0B429'       },
                { label: '% Efectivo',    value: `${pctCash.toFixed(0)}%`, color: '#2196F3' },
              ].map(k => (
                <div key={k.label} className="rounded-xl p-3 text-center"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <p className="text-lg font-black font-mono" style={{ color: k.color }}>{k.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
                </div>
              ))}
            </div>

            {/* ── Gráfica de barras ── */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-4 mb-3">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Ventas por día</p>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span><span style={{ color: 'var(--accent)' }}>■</span> Venta</span>
                  <span><span style={{ color: '#4CAF50' }}>■</span> Ganancia</span>
                </div>
              </div>
              <BarChart data={chartData} />
            </div>

            {/* ── Departamentos ── */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                Ventas por departamento
              </p>
              {catData.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin datos en el período</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {catData.map(c => (
                    <HBar key={c.name}
                      label={c.name}
                      value={c.revenue}
                      maxVal={maxCatRevenue}
                      color="var(--accent)"
                      suffix={fmt(c.revenue)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Método de pago ── */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                Método de pago
              </p>
              {txCount === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin datos en el período</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {Object.entries(METHOD_META).map(([key, { label, color }]) => {
                    const count = methodCount[key] || 0
                    const pct   = txCount > 0 ? (count / txCount) * 100 : 0
                    return (
                      <HBar key={key}
                        label={label}
                        value={count}
                        maxVal={txCount}
                        color={color}
                        suffix={`${pct.toFixed(0)}%  (${count})`}
                      />
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Top 10 productos ── */}
            <div className="rounded-xl p-4"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
                Top 10 productos
              </p>
              {top10.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Sin datos en el período</p>
              ) : (
                <div className="flex flex-col">
                  <div className="grid px-2 mb-1 text-xs font-semibold"
                    style={{ gridTemplateColumns: '24px 1fr 52px 88px', color: 'var(--text-muted)' }}>
                    <span>#</span>
                    <span>Producto</span>
                    <span className="text-right">Uds.</span>
                    <span className="text-right">Ingresos</span>
                  </div>
                  {top10.map((p, i) => (
                    <div key={p.name}
                      className="grid items-center px-2 py-1.5 rounded-lg text-xs"
                      style={{
                        gridTemplateColumns: '24px 1fr 52px 88px',
                        background: i % 2 === 0 ? 'var(--bg)' : 'transparent',
                      }}>
                      <span className="font-bold"
                        style={{ color: i < 3 ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {i + 1}
                      </span>
                      <span className="truncate" style={{ color: 'var(--text)' }}>{p.name}</span>
                      <span className="text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                        {p.units}
                      </span>
                      <span className="text-right font-mono font-semibold" style={{ color: 'var(--text)' }}>
                        {fmt(p.revenue)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
