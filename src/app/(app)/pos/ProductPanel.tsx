'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { ProductVariant, CartItem } from '@/types'

const CATEGORY_PRIORITY = [
  'PROTEINAS', 'GANADORES', 'CREATINAS', 'PRE-ENTRENOS', 'PRE ENTRENOS',
  'AMINOACIDOS', 'QUEMADORES', 'TERMOGENICOS', 'VITAMINAS',
  'BARRAS', 'SNACKS', 'BEBIDAS', 'ACCESORIOS', 'ROPA', 'OTROS',
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
  onAdd: (variant: ProductVariant) => void | Promise<void>
  searchRef: React.RefObject<HTMLInputElement | null>
  refreshKey?: number
}

export default function ProductPanel({ cart, onAdd, searchRef, refreshKey = 0 }: Props) {
  const router = useRouter()
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [soloConStock, setSoloConStock] = useState(false)
  const [lastScanned, setLastScanned] = useState<ProductVariant | null>(null)
  const [noStockVariant, setNoStockVariant] = useState<ProductVariant | null>(null)

  // Foco automático al montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { searchRef.current?.focus() }, [])

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
      const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name, category')
      if (prodError) throw new Error(`products: ${prodError.message}`)

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
            image_url: null,
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

  const categories = useMemo(() => {
    const seen = new Set<string>()
    for (const v of allVariants) {
      const cat = v.product?.category
      if (cat) seen.add(cat.trim().toUpperCase())
    }
    return Array.from(seen).sort((a, b) => {
      const ai = CATEGORY_PRIORITY.indexOf(a)
      const bi = CATEGORY_PRIORITY.indexOf(b)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.localeCompare(b, 'es')
    })
  }, [allVariants])

  const cartQtyMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const item of cart) m[item.variant.id] = item.quantity
    return m
  }, [cart])

  const filtered = useMemo(() => {
    let list = allVariants
    if (activeCategory) {
      list = list.filter(v =>
        (v.product?.category ?? '').trim().toUpperCase() === activeCategory
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
    if (soloConStock) list = list.filter(v => v.stock > 0)
    return list
  }, [allVariants, search, activeCategory, soloConStock])

  // Intento de agregar un producto — la validación de stock real la hace PosPage
  function handleCardClick(variant: ProductVariant) {
    onAdd(variant)
  }

  // Escaneo por código de barras (Enter en el buscador)
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const q = search.trim()
    if (!q) return
    const exact = allVariants.find(v => v.barcode === q)
    if (exact) {
      onAdd(exact)
      setLastScanned(exact)
      // Seleccionar el código para que el próximo escaneo lo reemplace automáticamente
      requestAnimationFrame(() => searchRef.current?.select())
    }
  }

  function closeNoStock() {
    setNoStockVariant(null)
    requestAnimationFrame(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    })
  }

  function goToInventory() {
    if (!noStockVariant) return
    router.push(`/inventario?ajustar=${encodeURIComponent(noStockVariant.barcode)}`)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center flex-col gap-3 min-w-0 overflow-hidden">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando productos…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
        <button onClick={loadProducts} className="px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error}
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">

      {/* Buscador */}
      <div className="p-3 shrink-0">
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value)
            // Limpiar tarjeta escaneada al escribir texto nuevo
            if (e.target.value !== search) setLastScanned(null)
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Buscar por nombre, sabor o código de barras…"
          className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* Tarjeta del último producto escaneado */}
      {lastScanned && (
        <div style={{
          margin: '0 12px 8px',
          padding: '10px 12px',
          borderRadius: '10px',
          background: 'var(--surface)',
          border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', gap: '10px',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{
                fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                background: 'rgba(240,180,41,0.15)', color: 'var(--accent)', fontWeight: 700,
              }}>
                ✓ Agregado
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Cód: {lastScanned.barcode}
              </span>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)', margin: 0, lineHeight: 1.3 }}>
              {lastScanned.product?.name}{lastScanned.flavor ? ` — ${lastScanned.flavor}` : ''}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'monospace' }}>
                ${lastScanned.sale_price.toLocaleString('es-MX')}
              </span>
              <span style={{ fontSize: '11px', color: lastScanned.stock <= 5 ? '#F0B429' : 'var(--text-muted)' }}>
                {lastScanned.stock} pzs
              </span>
            </div>
          </div>
          <button
            onClick={() => setLastScanned(null)}
            style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'var(--bg)', color: 'var(--text-muted)',
              fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, border: 'none', cursor: 'pointer', lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Filtro por categoría */}
      <div className="px-3 pb-2 shrink-0 flex gap-1.5 overflow-x-auto">
        <button onClick={() => setActiveCategory(null)}
          className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
          style={{ background: !activeCategory ? 'var(--accent)' : 'var(--surface)', color: !activeCategory ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
          Todos
        </button>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className="shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all"
            style={{ background: activeCategory === cat ? 'var(--accent)' : 'var(--surface)', color: activeCategory === cat ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {cat}
          </button>
        ))}
      </div>

      <div className="px-3 pb-2 shrink-0 flex items-center justify-between gap-2">
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{filtered.length} productos</span>
        <button
          onClick={() => setSoloConStock(v => !v)}
          className="shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all"
          style={{
            background: soloConStock ? 'var(--accent)' : 'var(--surface)',
            color: soloConStock ? '#000' : 'var(--text-muted)',
            border: '1px solid var(--border)',
          }}
        >
          Solo con existencias
        </button>
      </div>

      {/* Grid de productos */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(variant => {
            const qty = cartQtyMap[variant.id] ?? 0
            const days = getDaysUntilExpiry(variant.expiration_date)
            const isExpired = days !== null && days <= 0
            const sinStock = variant.stock <= 0

            return (
              <button key={variant.id} onClick={() => handleCardClick(variant)}
                className="relative flex flex-col items-start p-3 rounded-xl text-left transition-all"
                style={{
                  background: 'var(--surface)',
                  border: `1px solid ${isExpired ? '#4D1A1A' : qty > 0 ? 'var(--accent)' : 'var(--border)'}`,
                  opacity: sinStock ? 0.5 : 1,
                  cursor: sinStock ? 'not-allowed' : 'pointer',
                }}>

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
                  <span className="text-xs" style={{ color: sinStock ? '#FF6B6B' : variant.stock <= (variant.min_stock ?? 0) ? '#F0B429' : 'var(--text-muted)' }}>
                    {sinStock ? 'Sin stock' : `${variant.stock} pzs`}
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

      {/* Diálogo: sin stock — ¿ir a inventario? */}
      {noStockVariant && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeNoStock() }}
        >
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            padding: '24px 20px 20px',
            maxWidth: '320px', width: '100%',
          }}>
            <div style={{ fontSize: '30px', textAlign: 'center', marginBottom: '12px' }}>📦</div>
            <p style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text)', textAlign: 'center', margin: '0 0 4px' }}>
              Sin stock disponible
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 4px', fontWeight: 600 }}>
              {noStockVariant.product?.name}
              {noStockVariant.flavor ? ` — ${noStockVariant.flavor}` : ''}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', margin: '0 0 20px' }}>
              ¿Quieres modificar su inventario?
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={closeNoStock}
                style={{
                  flex: 1, padding: '11px', borderRadius: '12px',
                  background: 'var(--bg)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  fontWeight: 600, fontSize: '14px', cursor: 'pointer',
                }}
              >
                No
              </button>
              <button
                onClick={goToInventory}
                style={{
                  flex: 1, padding: '11px', borderRadius: '12px',
                  background: 'var(--accent)', color: '#000',
                  border: 'none', fontWeight: 700, fontSize: '14px', cursor: 'pointer',
                }}
              >
                Sí, ajustar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
