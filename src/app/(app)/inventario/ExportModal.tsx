'use client'

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import type { ProductVariant } from '@/types'

// ── Tipos ────────────────────────────────────────────────────────────────────

type StockFilter  = 'all' | 'with' | 'without'
type PriceColumns = 'all' | 'sale' | 'wholesale' | 'cost'
type DetailLevel  = 'variants' | 'generic'

interface Props {
  variants: ProductVariant[]
  onClose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function RadioGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { id: T; label: string; sub?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <div className="flex flex-col gap-1.5">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
            style={{
              background: value === opt.id ? 'rgba(250,200,0,0.08)' : 'var(--bg)',
              border: `1px solid ${value === opt.id ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0 flex items-center justify-center"
              style={{
                border: `2px solid ${value === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                background: value === opt.id ? 'var(--accent)' : 'transparent',
              }}
            >
              {value === opt.id && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#000' }} />}
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: value === opt.id ? 'var(--accent)' : 'var(--text)' }}>
                {opt.label}
              </span>
              {opt.sub && (
                <span className="text-xs ml-1.5" style={{ color: 'var(--text-muted)' }}>— {opt.sub}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function ExportModal({ variants, onClose }: Props) {
  const [stockFilter,  setStockFilter]  = useState<StockFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [priceColumns, setPriceColumns] = useState<PriceColumns>('all')
  const [detailLevel,  setDetailLevel]  = useState<DetailLevel>('variants')
  const [exporting, setExporting]       = useState(false)

  // Categorías disponibles
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const v of variants) {
      if (v.product?.category) set.add(v.product.category)
    }
    return [...set].sort()
  }, [variants])

  // Preview count
  const previewCount = useMemo(() => {
    let list = variants

    // Filtro stock
    if (stockFilter === 'with')    list = list.filter(v => v.stock > 0)
    if (stockFilter === 'without') list = list.filter(v => v.stock <= 0)

    // Filtro categoría
    if (categoryFilter !== 'all') list = list.filter(v => v.product?.category === categoryFilter)

    // Nivel de detalle
    if (detailLevel === 'generic') {
      const seen = new Set<string>()
      list = list.filter(v => { const ok = !seen.has(v.product_id); seen.add(v.product_id); return ok })
    }

    return list.length
  }, [variants, stockFilter, categoryFilter, detailLevel])

  // ── Exportar ──────────────────────────────────────────────────────────────

  function handleExport() {
    setExporting(true)

    // 1. Aplicar filtros base
    let list = variants
    if (stockFilter === 'with')    list = list.filter(v => v.stock > 0)
    if (stockFilter === 'without') list = list.filter(v => v.stock <= 0)
    if (categoryFilter !== 'all') list = list.filter(v => v.product?.category === categoryFilter)

    // 2. Construir filas según nivel de detalle
    type Row = (string | number)[]
    const rows: Row[] = []

    if (detailLevel === 'variants') {
      // Una fila por variante — nombre incluye el sabor
      for (const v of list) {
        const productName = v.flavor
          ? `${v.product?.name ?? 'Sin nombre'} - ${v.flavor}`
          : (v.product?.name ?? 'Sin nombre')
        const row: Row = [v.barcode || '—', productName]
        if (priceColumns === 'all' || priceColumns === 'cost')       row.push(v.cost_price)
        if (priceColumns === 'all' || priceColumns === 'sale')       row.push(v.sale_price)
        if (priceColumns === 'all' || priceColumns === 'wholesale')  row.push(v.wholesale_price)
        row.push(v.stock, v.min_stock, 0, v.product?.category || '—')
        rows.push(row)
      }
    } else {
      // Agrupar por product_id — una fila por producto
      const grouped = new Map<string, { name: string; category: string; barcode: string; stock: number; variants: ProductVariant[] }>()
      for (const v of list) {
        const key = v.product_id
        if (!grouped.has(key)) {
          grouped.set(key, {
            name:     v.product?.name ?? 'Sin nombre',
            category: v.product?.category ?? '—',
            barcode:  v.barcode || '—',
            stock:    0,
            variants: [],
          })
        }
        const entry = grouped.get(key)!
        entry.stock += v.stock
        entry.variants.push(v)
      }

      for (const [, g] of grouped) {
        const ref = g.variants[0]
        const row: Row = [g.barcode, g.name]
        if (priceColumns === 'all' || priceColumns === 'cost')       row.push(ref.cost_price)
        if (priceColumns === 'all' || priceColumns === 'sale')       row.push(ref.sale_price)
        if (priceColumns === 'all' || priceColumns === 'wholesale')  row.push(ref.wholesale_price)
        row.push(g.stock, ref.min_stock, 0, g.category)
        rows.push(row)
      }
    }

    // 3. Construir cabecera (misma estructura para ambos modos)
    const headers: string[] = ['Código', 'Producto']
    if (priceColumns === 'all' || priceColumns === 'cost')       headers.push('P.Costo')
    if (priceColumns === 'all' || priceColumns === 'sale')       headers.push('P.Venta')
    if (priceColumns === 'all' || priceColumns === 'wholesale')  headers.push('P.Mayoreo')
    headers.push('Existencia', 'Inv. Mínimo', 'Inv. Máximo', 'Departamento')

    // 4. Crear libro Excel
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

    // Anchos de columna
    ws['!cols'] = headers.map(h => {
      if (h === 'Código')      return { wch: 16 }
      if (h === 'Producto')    return { wch: 42 }
      if (h.startsWith('P.')) return { wch: 14 }
      if (h === 'Departamento') return { wch: 20 }
      return { wch: 13 }
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventario')

    // Nombre del archivo descriptivo
    const today = new Date().toISOString().slice(0, 10)
    const cat   = categoryFilter === 'all' ? 'todas-categorias' : categoryFilter.replace(/\s+/g, '-').toLowerCase()
    const stock = stockFilter === 'all' ? '' : stockFilter === 'with' ? '-con-stock' : '-sin-stock'
    XLSX.writeFile(wb, `inventario-${cat}${stock}-${today}.xlsx`)

    setExporting(false)
    onClose()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: '#052e16' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Exportar Inventario</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Personaliza qué datos incluir</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}
          >×</button>
        </div>

        {/* Opciones — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {/* ── Existencias ─────────────────────────────────────────────── */}
          <RadioGroup<StockFilter>
            label="Existencias"
            value={stockFilter}
            onChange={setStockFilter}
            options={[
              { id: 'all',     label: 'Todos los productos',      sub: 'con y sin stock' },
              { id: 'with',    label: 'Solo con existencias',      sub: 'stock > 0' },
              { id: 'without', label: 'Solo sin existencias',      sub: 'stock = 0' },
            ]}
          />

          {/* ── Categoría ───────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              Categoría
            </p>
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              <option value="all">Todas las categorías</option>
              {categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* ── Precios ─────────────────────────────────────────────────── */}
          <RadioGroup<PriceColumns>
            label="Columnas de precio"
            value={priceColumns}
            onChange={setPriceColumns}
            options={[
              { id: 'all',       label: 'Todos los precios',    sub: 'público, mayoreo y costo' },
              { id: 'sale',      label: 'Solo precio público'  },
              { id: 'wholesale', label: 'Solo precio mayoreo'  },
              { id: 'cost',      label: 'Solo precio costo'    },
            ]}
          />

          {/* ── Nivel de detalle ─────────────────────────────────────────── */}
          <RadioGroup<DetailLevel>
            label="Nivel de detalle"
            value={detailLevel}
            onChange={setDetailLevel}
            options={[
              { id: 'variants', label: 'Con variantes de sabor',   sub: 'una fila por sabor' },
              { id: 'generic',  label: 'Producto genérico',         sub: 'una fila por producto, stock sumado' },
            ]}
          />

          {/* Info del archivo */}
          <div
            className="px-3 py-2.5 rounded-xl text-xs"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            Se exportarán{' '}
            <span className="font-bold" style={{ color: 'var(--accent)' }}>
              {previewCount} {detailLevel === 'variants' ? 'variante' : 'producto'}{previewCount !== 1 ? 's' : ''}
            </span>
            {' '}en un archivo <span style={{ color: 'var(--text)' }}>.xlsx</span> con una hoja llamada{' '}
            <span style={{ color: 'var(--accent)' }}>Inventario</span>.
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 px-5 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || previewCount === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{
              background: previewCount === 0 ? 'var(--bg)' : '#166534',
              color: previewCount === 0 ? 'var(--text-muted)' : '#4ade80',
              opacity: exporting ? 0.7 : 1,
              border: previewCount === 0 ? '1px solid var(--border)' : 'none',
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
                {previewCount === 0 ? 'Sin resultados' : 'Descargar .xlsx'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
