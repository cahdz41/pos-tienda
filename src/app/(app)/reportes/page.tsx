'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const fmt = (n: number) =>
  '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number) => n.toFixed(2) + '%'

type Period = 'today' | 'week' | 'month' | 'last30'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: '7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'last30', label: '30 días' },
]

// Distinct colors for department segments
const DEPT_COLORS = [
  '#F0B429', '#10B981', '#3B82F6', '#8B5CF6',
  '#EF4444', '#F59E0B', '#06B6D4', '#EC4899', '#6B7280', '#84CC16',
]

function getPeriodDates(p: Period): { start: Date; end: Date } {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const endOfToday = new Date(today.getTime() + 86400000 - 1)
  if (p === 'today') return { start: today, end: endOfToday }
  if (p === 'week') {
    const s = new Date(today); s.setDate(today.getDate() - 6)
    return { start: s, end: endOfToday }
  }
  if (p === 'month') return { start: new Date(today.getFullYear(), today.getMonth(), 1), end: endOfToday }
  const s = new Date(today); s.setDate(today.getDate() - 29)
  return { start: s, end: endOfToday }
}

interface DaySale { date: string; label: string; total: number; count: number }
interface TopProduct { name: string; brand: string | null; flavor: string | null; units: number; revenue: number }
interface DeptStat {
  name: string
  revenue: number
  cost: number
  profit: number
  units: number
}
interface Stats {
  totalRevenue: number
  totalCost: number
  totalProfit: number
  profitMargin: number
  totalTransactions: number
  avgTicket: number
  cashTotal: number
  cardTotal: number
  creditTotal: number
  daySales: DaySale[]
  topProducts: TopProduct[]
  deptStats: DeptStat[]
}

/* ─── Bar Chart ─── */
function BarChart({ data }: { data: DaySale[] }) {
  const [hov, setHov] = useState<number | null>(null)
  const max = Math.max(...data.map(d => d.total), 1)
  const W = 560, H = 130, gap = 3
  const bw = data.length > 0 ? Math.max(4, Math.floor((W - gap * (data.length + 1)) / data.length)) : 20

  if (!data.length) return <div className="empty-state">Sin datos en este período</div>

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H + 28}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={0} y1={H * (1 - f)} x2={W} y2={H * (1 - f)}
            stroke="#2A2A3A" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const bh = Math.max(3, (d.total / max) * H)
          const x = gap + i * (bw + gap)
          const isHov = hov === i
          const skipLabel = data.length > 14 && i % Math.ceil(data.length / 14) !== 0
          return (
            <g key={d.date} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              <rect x={x} y={H - bh} width={bw} height={bh}
                fill={isHov ? '#F0B429' : 'rgba(240,180,41,0.5)'} rx="2"
                style={{ transition: 'fill 0.1s', cursor: 'default' }} />
              {!skipLabel && (
                <text x={x + bw / 2} y={H + 17} textAnchor="middle"
                  fill={isHov ? '#F0F0F8' : '#5A5A72'}
                  fontSize={data.length > 20 ? 8 : 9}>
                  {data.length <= 10 ? d.label : d.date.slice(8)}
                </text>
              )}
            </g>
          )
        })}
        <line x1={0} y1={H} x2={W} y2={H} stroke="#2A2A3A" strokeWidth="1" />
      </svg>
      {hov !== null && data[hov] && (
        <div style={{
          position: 'absolute',
          bottom: 32,
          left: `${Math.min(80, Math.max(10, (hov / data.length) * 100))}%`,
          transform: 'translateX(-50%)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '6px 10px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>{data[hov].label}</div>
          <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-jetbrains)', fontSize: 13, fontWeight: 600 }}>
            {fmt(data[hov].total)}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {data[hov].count} venta{data[hov].count !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Payment Breakdown ─── */
function PaymentBreakdown({ cash, card, credit, total }: {
  cash: number; card: number; credit: number; total: number
}) {
  const items = [
    { label: 'Efectivo', value: cash, color: 'var(--success)' },
    { label: 'Tarjeta', value: card, color: 'var(--info)' },
    { label: 'Crédito', value: credit, color: 'var(--accent)' },
  ]
  if (total === 0) return <div className="empty-state">Sin ventas en este período</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map(item => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, alignItems: 'baseline' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.label}</span>
              <div>
                <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-jetbrains)', fontSize: 13, fontWeight: 500 }}>
                  {fmt(item.value)}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 6 }}>
                  {pct.toFixed(0)}%
                </span>
              </div>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: item.color, borderRadius: 3,
                transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Donut Chart ─── */
function DonutChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const [hov, setHov] = useState<number | null>(null)
  const r = 36, cx = 50, cy = 50
  const C = 2 * Math.PI * r
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (!total) return null

  let cumulative = 0
  return (
    <svg viewBox="0 0 100 100" style={{ width: '100%', maxWidth: 180, height: 'auto', display: 'block' }}>
      {segments.map((seg, i) => {
        const fraction = seg.value / total
        const dash = fraction * C
        const rotation = -90 + (cumulative / total) * 360
        cumulative += seg.value
        return (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none"
            stroke={hov === i ? '#fff' : seg.color}
            strokeWidth={hov === i ? 20 : 17}
            strokeDasharray={`${dash} ${C - dash}`}
            transform={`rotate(${rotation}, ${cx}, ${cy})`}
            style={{ transition: 'stroke-width 0.15s', cursor: 'default' }}
            onMouseEnter={() => setHov(i)}
            onMouseLeave={() => setHov(null)}
          />
        )
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={r - 10} fill="var(--bg-surface)" />
      {/* Center label */}
      {hov !== null ? (
        <>
          <text x={cx} y={cy - 3} textAnchor="middle" fill="#F0F0F8" fontSize="7" fontWeight="600">
            {((segments[hov].value / total) * 100).toFixed(0)}%
          </text>
          <text x={cx} y={cy + 7} textAnchor="middle" fill="#5A5A72" fontSize="5">
            {segments[hov].label.length > 10 ? segments[hov].label.slice(0, 10) + '…' : segments[hov].label}
          </text>
        </>
      ) : (
        <text x={cx} y={cy + 3} textAnchor="middle" fill="#5A5A72" fontSize="6">
          {segments.length} depts
        </text>
      )}
    </svg>
  )
}

/* ─── Department Section ─── */
function DepartmentSection({ depts, totalRevenue }: { depts: DeptStat[]; totalRevenue: number }) {
  const [view, setView] = useState<'ventas' | 'ganancia'>('ventas')
  if (!depts.length) return <div className="empty-state">Sin datos de departamentos</div>

  const maxRevenue = depts[0]?.revenue ?? 1
  const maxProfit = Math.max(...depts.map(d => d.profit), 1)
  const segments = depts.map((d, i) => ({ value: d.revenue, color: DEPT_COLORS[i % DEPT_COLORS.length], label: d.name }))

  return (
    <div className="dept-wrap">
      {/* Donut + Legend */}
      <div className="dept-chart-col">
        <DonutChart segments={segments} />
        <div className="dept-legend">
          {depts.map((d, i) => (
            <div key={d.name} className="legend-item">
              <span className="legend-dot" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length] }} />
              <span className="legend-name">{d.name}</span>
              <span className="legend-val">{fmt(d.revenue)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="dept-table-col">
        <div className="view-toggle">
          <button className={`vt-btn${view === 'ventas' ? ' vt-btn--on' : ''}`} onClick={() => setView('ventas')}>
            Ventas
          </button>
          <button className={`vt-btn${view === 'ganancia' ? ' vt-btn--on' : ''}`} onClick={() => setView('ganancia')}>
            Ganancia
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {depts.map((d, i) => {
            const isGanancia = view === 'ganancia'
            const value = isGanancia ? d.profit : d.revenue
            const max = isGanancia ? maxProfit : maxRevenue
            const pct = totalRevenue > 0 ? (d.revenue / totalRevenue) * 100 : 0
            const margin = d.revenue > 0 ? (d.profit / d.revenue) * 100 : 0
            return (
              <div key={d.name} className="dept-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="legend-dot" style={{ background: DEPT_COLORS[i % DEPT_COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{d.name}</span>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12, color: isGanancia ? 'var(--success)' : 'var(--text-primary)', fontWeight: 600 }}>
                    {fmt(value)}
                  </span>
                  {isGanancia && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 38, textAlign: 'right' }}>
                      {fmtPct(margin)}
                    </span>
                  )}
                  {!isGanancia && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>
                      {pct.toFixed(0)}%
                    </span>
                  )}
                </div>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginLeft: 18 }}>
                  <div style={{
                    width: `${max > 0 ? (value / max) * 100 : 0}%`,
                    height: '100%',
                    background: isGanancia ? 'var(--success)' : DEPT_COLORS[i % DEPT_COLORS.length],
                    borderRadius: 2,
                    transition: 'width 0.5s cubic-bezier(0.34,1.56,0.64,1)',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ─── Top Products Table ─── */
function TopProductsTable({ products }: { products: TopProduct[] }) {
  const maxRev = products[0]?.revenue ?? 1
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th className="tbl-th" style={{ width: 32, textAlign: 'center' }}>#</th>
            <th className="tbl-th">Producto</th>
            <th className="tbl-th" style={{ textAlign: 'right' }}>Unidades</th>
            <th className="tbl-th" style={{ textAlign: 'right' }}>Ingresos</th>
            <th className="tbl-th" style={{ width: 120 }}>Participación</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, i) => (
            <tr key={i} className="tbl-row">
              <td style={{
                textAlign: 'center',
                color: i < 3 ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: i < 3 ? 700 : 400,
                fontSize: 12,
              }}>
                {i + 1}
              </td>
              <td>
                <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: 13 }}>
                  {p.name}{p.flavor ? ` — ${p.flavor}` : ''}
                </div>
                {p.brand && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.brand}</div>}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains)', fontSize: 13, color: 'var(--text-secondary)' }}>
                {p.units}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--font-jetbrains)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                {fmt(p.revenue)}
              </td>
              <td style={{ paddingRight: 8 }}>
                <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    width: `${(p.revenue / maxRev) * 100}%`, height: '100%',
                    background: i === 0 ? 'var(--accent)' : 'rgba(240,180,41,0.4)',
                    borderRadius: 2,
                  }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ─── KPI Card ─── */
function KpiCard({ label, value, sub, accent, green }: {
  label: string; value: string; sub?: string; accent?: boolean; green?: boolean
}) {
  return (
    <div className={`kpi-card${accent ? ' kpi-card--accent' : green ? ' kpi-card--green' : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

/* ─── Page ─── */
export default function ReportesPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    setLoading(true); setErr(null)
    const { start, end } = getPeriodDates(period)

    try {
      // 1. Sales in period
      const { data: sales, error: sErr } = await supabase
        .from('sales')
        .select('id, created_at, total, payment_method')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at')
      if (sErr) throw sErr

      const totalRevenue = sales?.reduce((a, s) => a + s.total, 0) ?? 0
      const totalTransactions = sales?.length ?? 0
      const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0
      const cashTotal = sales?.filter(s => s.payment_method === 'cash').reduce((a, s) => a + s.total, 0) ?? 0
      const cardTotal = sales?.filter(s => s.payment_method === 'card').reduce((a, s) => a + s.total, 0) ?? 0
      const creditTotal = sales?.filter(s => s.payment_method === 'credit').reduce((a, s) => a + s.total, 0) ?? 0

      // Daily grouping
      const dayMap = new Map<string, { total: number; count: number }>()
      for (const s of sales ?? []) {
        const key = new Date(s.created_at).toLocaleDateString('sv-SE')
        const ex = dayMap.get(key) ?? { total: 0, count: 0 }
        dayMap.set(key, { total: ex.total + s.total, count: ex.count + 1 })
      }
      const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      const daySales: DaySale[] = []
      const cur = new Date(start)
      while (cur <= end) {
        const key = cur.toLocaleDateString('sv-SE')
        const d = dayMap.get(key) ?? { total: 0, count: 0 }
        daySales.push({ date: key, label: `${DAY_NAMES[cur.getDay()]} ${cur.getDate()}`, ...d })
        cur.setDate(cur.getDate() + 1)
      }

      // 2. Sale items — includes cost_price and category for profit/dept calculations
      let topProducts: TopProduct[] = []
      let deptStats: DeptStat[] = []
      let totalCost = 0
      const saleIds = (sales ?? []).map(s => s.id)

      if (saleIds.length > 0) {
        const { data: items, error: iErr } = await supabase
          .from('sale_items')
          .select('quantity, subtotal, variant:product_variants!inner(cost_price, flavor, product:products!inner(name, brand, category))')
          .in('sale_id', saleIds)
        if (iErr) throw iErr

        const pMap = new Map<string, TopProduct>()
        const dMap = new Map<string, DeptStat>()

        for (const item of items ?? []) {
          const v = item.variant as {
            cost_price: number
            flavor: string | null
            product: { name: string; brand: string | null; category: string | null }
          }
          const revenue = item.subtotal ?? 0
          const cost = (v.cost_price ?? 0) * item.quantity
          totalCost += cost

          // Top products aggregate
          const pKey = `${v.product.name}||${v.flavor ?? ''}`
          const pEx = pMap.get(pKey) ?? { name: v.product.name, brand: v.product.brand, flavor: v.flavor, units: 0, revenue: 0 }
          pMap.set(pKey, { ...pEx, units: pEx.units + item.quantity, revenue: pEx.revenue + revenue })

          // Department aggregate
          const dept = v.product.category ?? 'Sin categoría'
          const dEx = dMap.get(dept) ?? { name: dept, revenue: 0, cost: 0, profit: 0, units: 0 }
          dMap.set(dept, {
            ...dEx,
            revenue: dEx.revenue + revenue,
            cost: dEx.cost + cost,
            profit: dEx.profit + (revenue - cost),
            units: dEx.units + item.quantity,
          })
        }

        topProducts = [...pMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10)
        deptStats = [...dMap.values()].sort((a, b) => b.revenue - a.revenue)
      }

      const totalProfit = totalRevenue - totalCost
      const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

      setStats({
        totalRevenue, totalCost, totalProfit, profitMargin,
        totalTransactions, avgTicket,
        cashTotal, cardTotal, creditTotal,
        daySales, topProducts, deptStats,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const periodLabel = PERIODS.find(p => p.key === period)?.label ?? ''

  return (
    <div className="rpt-page">
      {/* Header */}
      <div className="rpt-header">
        <div>
          <h1 className="rpt-title">Reportes</h1>
          <p className="rpt-sub">Análisis de ventas y rentabilidad</p>
        </div>
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button key={p.key}
              className={`period-tab${period === p.key ? ' period-tab--on' : ''}`}
              onClick={() => setPeriod(p.key)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="err-bar">{err}</div>}

      {loading ? (
        <div className="loading-wrap">
          <div className="spinner" />
          <span>Cargando reportes…</span>
        </div>
      ) : !stats ? null : (
        <div className="rpt-body">

          {/* KPI row 1 — Ventas */}
          <div className="section-label">Ventas</div>
          <div className="kpi-row">
            <KpiCard label="Ingresos totales" value={fmt(stats.totalRevenue)} accent />
            <KpiCard label="Transacciones" value={stats.totalTransactions.toLocaleString('es-MX')} />
            <KpiCard label="Ticket promedio" value={fmt(stats.avgTicket)} />
            <KpiCard
              label="Efectivo cobrado"
              value={fmt(stats.cashTotal)}
              sub={stats.totalRevenue > 0 ? `${((stats.cashTotal / stats.totalRevenue) * 100).toFixed(0)}% del total` : undefined}
            />
          </div>

          {/* KPI row 2 — Rentabilidad */}
          <div className="section-label" style={{ marginTop: 4 }}>Rentabilidad</div>
          <div className="kpi-row kpi-row--2">
            <KpiCard label="Ganancia neta" value={fmt(stats.totalProfit)} green
              sub={stats.totalRevenue > 0 ? `Costo total: ${fmt(stats.totalCost)}` : undefined} />
            <KpiCard label="Margen de utilidad" value={fmtPct(stats.profitMargin)} green
              sub={stats.profitMargin >= 20 ? 'Margen saludable' : 'Margen bajo'} />
          </div>

          {/* Charts row */}
          <div className="charts-row">
            <div className="chart-card">
              <div className="card-hdr">
                <span className="card-ttl">Ventas por día</span>
                <span className="card-badge">{periodLabel}</span>
              </div>
              <BarChart data={stats.daySales} />
            </div>
            <div className="chart-card">
              <div className="card-hdr">
                <span className="card-ttl">Método de pago</span>
              </div>
              <PaymentBreakdown
                cash={stats.cashTotal}
                card={stats.cardTotal}
                credit={stats.creditTotal}
                total={stats.totalRevenue}
              />
            </div>
          </div>

          {/* Department breakdown */}
          <div className="chart-card">
            <div className="card-hdr">
              <span className="card-ttl">Ventas por Departamento</span>
              <span className="card-badge">{stats.deptStats.length} departamentos</span>
            </div>
            <DepartmentSection depts={stats.deptStats} totalRevenue={stats.totalRevenue} />
          </div>

          {/* Top products */}
          <div className="chart-card">
            <div className="card-hdr">
              <span className="card-ttl">Productos más vendidos</span>
              <span className="card-badge">Top {Math.min(stats.topProducts.length, 10)} por ingresos</span>
            </div>
            {stats.topProducts.length === 0
              ? <div className="empty-state">Sin ventas registradas en este período</div>
              : <TopProductsTable products={stats.topProducts} />
            }
          </div>

        </div>
      )}

      <style>{`
        .rpt-page {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow-y: auto;
          background: var(--bg-base);
          padding: 24px;
          gap: 16px;
        }

        /* Header */
        .rpt-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .rpt-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0;
          letter-spacing: -0.02em;
        }
        .rpt-sub { color: var(--text-muted); font-size: 13px; margin: 3px 0 0; }

        .section-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
          padding: 0 2px;
        }

        /* Period selector */
        .period-tabs {
          display: flex;
          gap: 4px;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 3px;
        }
        .period-tab {
          padding: 6px 14px;
          border-radius: 7px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .period-tab:hover { color: var(--text-primary); background: var(--bg-hover); }
        .period-tab--on { background: var(--accent-glow); color: var(--accent); font-weight: 600; }

        /* Error / Loading */
        .err-bar {
          background: var(--danger-dim);
          border: 1px solid rgba(239,68,68,0.3);
          color: var(--danger);
          border-radius: 8px;
          padding: 10px 16px;
          font-size: 13px;
        }
        .loading-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: var(--text-muted);
          padding: 80px 0;
          font-size: 13px;
        }
        .spinner {
          width: 20px; height: 20px;
          border: 2px solid var(--border);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .rpt-body { display: flex; flex-direction: column; gap: 14px; }

        /* KPI cards */
        .kpi-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .kpi-row--2 { grid-template-columns: repeat(2, 1fr); }
        @media (max-width: 900px) {
          .kpi-row { grid-template-columns: repeat(2, 1fr); }
          .kpi-row--2 { grid-template-columns: repeat(2, 1fr); }
        }

        .kpi-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .kpi-card--accent { background: var(--accent-glow); border-color: rgba(240,180,41,0.3); }
        .kpi-card--green  { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
        .kpi-label {
          font-size: 10px; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.07em;
          color: var(--text-muted); margin-bottom: 8px;
        }
        .kpi-value {
          font-family: var(--font-jetbrains, monospace);
          font-size: 22px; font-weight: 600;
          color: var(--text-primary); line-height: 1;
        }
        .kpi-card--accent .kpi-value { color: var(--accent); }
        .kpi-card--green  .kpi-value { color: var(--success); }
        .kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 5px; }

        /* Charts */
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 12px;
        }
        @media (max-width: 900px) { .charts-row { grid-template-columns: 1fr; } }

        .chart-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 16px 18px;
        }
        .card-hdr {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .card-ttl { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .card-badge {
          font-size: 10px;
          background: var(--bg-hover);
          color: var(--text-muted);
          border-radius: 5px;
          padding: 2px 7px;
          border: 1px solid var(--border);
        }
        .empty-state {
          color: var(--text-muted);
          text-align: center;
          padding: 32px 0;
          font-size: 13px;
        }

        /* Department */
        .dept-wrap {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 700px) { .dept-wrap { grid-template-columns: 1fr; } }

        .dept-chart-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .dept-legend {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
        }
        .legend-dot {
          width: 8px; height: 8px;
          border-radius: 2px;
          flex-shrink: 0;
        }
        .legend-name { flex: 1; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .legend-val { font-family: var(--font-jetbrains, monospace); font-size: 10px; color: var(--text-muted); }

        .dept-table-col { flex: 1; }

        .view-toggle {
          display: flex;
          gap: 4px;
          background: var(--bg-hover);
          border-radius: 8px;
          padding: 3px;
          width: fit-content;
        }
        .vt-btn {
          padding: 5px 12px;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .vt-btn:hover { color: var(--text-primary); }
        .vt-btn--on { background: var(--bg-surface); color: var(--text-primary); font-weight: 600; }

        .dept-row { padding: 2px 0; }

        /* Table */
        .tbl-th {
          padding: 8px 10px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--text-muted);
          border-bottom: 1px solid var(--border);
        }
        .tbl-row td { padding: 10px 10px; border-bottom: 1px solid rgba(42,42,58,0.5); }
        .tbl-row:last-child td { border-bottom: none; }
        .tbl-row:hover td { background: var(--bg-hover); }
      `}</style>
    </div>
  )
}
