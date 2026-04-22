'use client'

import type { ProductVariant } from '@/types'

interface Props {
  variants: ProductVariant[]
  onClose: () => void
}

const PALETTE = [
  '#f59e0b', '#60a5fa', '#4ade80', '#f87171', '#a78bfa',
  '#34d399', '#fb923c', '#e879f9', '#38bdf8', '#facc15',
  '#86efac', '#fca5a5', '#c4b5fd', '#6ee7b7', '#93c5fd',
]

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface SliceData {
  label: string
  value: number
  color: string
}

function PieChart({ data, total }: { data: SliceData[]; total: number }) {
  if (total === 0 || data.length === 0) return null

  const cx = 110
  const cy = 110
  const r  = 90
  const ir = 50 // inner radius (donut)

  let angle = -Math.PI / 2
  const slices = data.map(d => {
    const start = angle
    const sweep = (d.value / total) * 2 * Math.PI
    angle += sweep
    const end = angle

    const x1o = cx + r  * Math.cos(start)
    const y1o = cy + r  * Math.sin(start)
    const x2o = cx + r  * Math.cos(end)
    const y2o = cy + r  * Math.sin(end)
    const x1i = cx + ir * Math.cos(end)
    const y1i = cy + ir * Math.sin(end)
    const x2i = cx + ir * Math.cos(start)
    const y2i = cy + ir * Math.sin(start)

    const large = sweep > Math.PI ? 1 : 0

    // Donut arc path (outer arc → inner arc back)
    const path = [
      `M ${x1o.toFixed(2)} ${y1o.toFixed(2)}`,
      `A ${r} ${r} 0 ${large} 1 ${x2o.toFixed(2)} ${y2o.toFixed(2)}`,
      `L ${x1i.toFixed(2)} ${y1i.toFixed(2)}`,
      `A ${ir} ${ir} 0 ${large} 0 ${x2i.toFixed(2)} ${y2i.toFixed(2)}`,
      'Z',
    ].join(' ')

    return { ...d, path }
  })

  return (
    <svg width="220" height="220" viewBox="0 0 220 220">
      {slices.map((s, i) => (
        <path key={i} d={s.path} fill={s.color} stroke="var(--surface)" strokeWidth="2" />
      ))}
      <text
        x={cx} y={cy - 7}
        textAnchor="middle"
        style={{ fontSize: '11px', fill: 'var(--text-muted)', fontFamily: 'sans-serif' }}
      >
        valor costo
      </text>
      <text
        x={cx} y={cy + 16}
        textAnchor="middle"
        style={{ fontSize: '16px', fontWeight: 'bold', fill: 'var(--text)', fontFamily: 'monospace' }}
      >
        {total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })}
      </text>
    </svg>
  )
}

export default function ReporteModal({ variants, onClose }: Props) {
  const available = variants.filter(v => v.stock > 0)

  const totalUnits     = available.reduce((s, v) => s + v.stock,                  0)
  const totalCostValue = available.reduce((s, v) => s + v.cost_price  * v.stock,  0)
  const totalSaleValue = available.reduce((s, v) => s + v.sale_price  * v.stock,  0)

  // Group cost value by category
  const byCategory: Record<string, number> = {}
  for (const v of available) {
    const cat = v.product?.category?.trim() || 'Sin categoría'
    byCategory[cat] = (byCategory[cat] ?? 0) + v.cost_price * v.stock
  }

  const categories: SliceData[] = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl p-6 flex flex-col gap-5 overflow-y-auto"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxHeight: '90vh',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Reporte de Inventario</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {available.length} variantes · {categories.length} {categories.length === 1 ? 'categoría' : 'categorías'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            ✕
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Valor a costo
            </p>
            <p className="text-lg font-black font-mono leading-tight" style={{ color: '#f59e0b' }}>
              {fmt(totalCostValue)}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Valor a venta
            </p>
            <p className="text-lg font-black font-mono leading-tight" style={{ color: '#4ade80' }}>
              {fmt(totalSaleValue)}
            </p>
          </div>
          <div className="rounded-xl p-4" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Total unidades
            </p>
            <p className="text-lg font-black font-mono leading-tight" style={{ color: 'var(--accent)' }}>
              {totalUnits.toLocaleString('es-MX')}
            </p>
          </div>
        </div>

        {/* Pie chart + legend */}
        {categories.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
              Valor en costo por categoría
            </p>
            <div className="flex gap-6 items-center">
              <div className="shrink-0">
                <PieChart data={categories} total={totalCostValue} />
              </div>

              <div className="flex-1 flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: '220px' }}>
                {categories.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: c.color }}
                      />
                      <span className="text-xs truncate" style={{ color: 'var(--text)' }}>
                        {c.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className="text-xs font-mono font-bold"
                        style={{ color: c.color }}
                      >
                        {fmt(c.value)}
                      </span>
                      <span
                        className="text-xs font-mono"
                        style={{ color: 'var(--text-muted)', minWidth: '42px', textAlign: 'right' }}
                      >
                        {((c.value / totalCostValue) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {categories.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No hay productos con existencias.
          </p>
        )}
      </div>
    </div>
  )
}
