'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import type { ProductVariant, CartItem } from '@/types'

// Categorías reales de la tabla products.category
const CATEGORIES = [
  'PROTEINAS',
  'CREATINAS',
  'PRE ENTRENOS',
  'AMINOACIDOS',
  'QUEMADORES',
  'VITAMINAS',
  'BARRAS',
  'BEBIDAS',
  'ROPA',
  'OTROS',
]

function getDaysUntilExpiry(date: string | null): number | null {
  if (!date) return null
  const diff = new Date(date).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return null
  const days = getDaysUntilExpiry(date)
  if (days === null) return null
  if (days <= 0)  return <span style={{ background: '#4D1010', color: '#FF6B6B', fontSize: '10px', padding: '1px 5px', borderRadius: '4px' }}>VENCIDO</span>
  if (days <= 7)  return <span style={{ background: '#4D1010', color: '#FF6B6B', fontSize: '10px', padding: '1px 5px', borderRadius: '4px' }}>Vence {days}d</span>
  if (days <= 30) return <span style={{ background: '#3D2A00', color: '#F0B429', fontSize: '10px', padding: '1px 5px', borderRadius: '4px' }}>Vence {days}d</span>
  return null
}

interface Props {
  cart: CartItem[]
  onAdd: (variant: ProductVariant) => void
  searchRef: React.RefObject<HTMLInputElement | null>
  refreshKey?: number
}

export default function ProductPanel({ cart, onAdd, searchRef, refreshKey = 0 }: Props) {
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadProducts() }, [refreshKey])

  async function loadProducts() {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const LIMIT = 500
    let all: ProductVariant[] = []
    let page = 0

    const timer = setTimeout(() => {
      setLoading(false)
      setError('Tiempo agotado. Toca para reintentar.')
    }, 15000)

    try {
      // Productos: columnas reales confirmadas (category, no department)
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, category')
      if (prodError) throw new Error(`products: ${prodError.message}`)

      const productsMap: Record<string, { id: string; name: string; category: string | null }> = {}
      for (const p of (products ?? []) as Array<{ id: string; name: string; category: string | null }>) {
        productsMap[String(p.id)] = { id: String(p.id), name: p.name, category: p.category ?? null }
      }

      // Variantes: columnas reales confirmadas
      while (true) {
        const { data, error: dbError } = await supabase
          .from('product_variants')
          .select('id, product_id, barcode, flavor, sale_price, wholesale_price, cost_price, stock, min_stock, expiration_date')
          .range(page * LIMIT, (page + 1) * LIMIT - 1)
          .order('id')

        if (dbError) throw new Error(`product_variants: ${dbError.message}`)
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
      console.error('[ProductPanel]', e)
      setError('Error cargando productos. Toca para reintentar.')
    } finally {
      setLoading(false)
    }
  }

  const cartQtyMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const item of cart) m[item.variant.id] = item.quantity
    return m
  }, [cart])

  // Filtrado 100% en cliente — instantáneo. Usa product.category (no department)
  const filtered = useMemo(() => {
    let list = allVariants
    if (activeCategory) {
      list = list.filter(v =>
        (v.product?.category ?? '').toUpperCase() === activeCategory
      )
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(v =>
        v.product?.name?.toLowerCase().includes(q) ||
        (v.flavor ?? '').toLowerCase().includes(q) ||
        v.barcode.includes(q)
      )
    }
    return list
  }, [allVariants, search, activeCategory])

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const q = search.trim()
    if (!q) return
    const exact = allVariants.find(v => v.barcode === q)
    if (exact) { onAdd(exact); setSearch('') }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando productos…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <button onClick={loadProducts} className="px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Búsqueda */}
      <div className="p-3 shrink-0">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar por nombre, sabor o código de barras…"
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Filtro por categoría */}
      <div className="px-3 pb-2 shrink-0 flex gap-1.5 overflow-x-auto">
        <button onClick={() => setActiveCategory(null)}
          className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={{ background: !activeCategory ? 'var(--accent)' : 'var(--surface)', color: !activeCategory ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
          Todos
        </button>
        {CATEGORIES.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{ background: activeCategory === cat ? 'var(--accent)' : 'var(--surface)', color: activeCategory === cat ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {cat}
          </button>
        ))}
      </div>

      <div className="px-4 pb-1 shrink-0">
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{filtered.length} productos</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(variant => {
            const qty = cartQtyMap[variant.id] ?? 0
            const days = getDaysUntilExpiry(variant.expiration_date)
            const isExpired = days !== null && days <= 0

            return (
              <button key={variant.id} onClick={() => onAdd(variant)}
                className="relative flex flex-col items-start p-3 rounded-xl text-left transition-all"
                style={{ background: 'var(--surface)', border: `1px solid ${isExpired ? '#4D1A1A' : qty > 0 ? 'var(--accent)' : 'var(--border)'}`, opacity: variant.stock <= 0 ? 0.5 : 1 }}>

                {qty > 0 && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'var(--accent)', color: '#000' }}>
                    {qty}
                  </div>
                )}

                <p className="text-xs font-semibold leading-tight line-clamp-2" style={{ color: 'var(--text)' }}>
                  {variant.product?.name}
                </p>
                {variant.flavor && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{variant.flavor}</p>
                )}
                <p className="text-sm font-bold mt-2" style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                  ${variant.sale_price.toLocaleString('es-MX')}
                </p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-xs" style={{ color: variant.stock <= (variant.min_stock ?? 0) ? '#FF6B6B' : 'var(--text-muted)' }}>
                    {variant.stock} pzs
                  </span>
                  <ExpiryBadge date={variant.expiration_date} />
                </div>
              </button>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              Sin resultados{search ? ` para "${search}"` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
