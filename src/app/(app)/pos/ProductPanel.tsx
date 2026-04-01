'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { CartItem, ProductVariant } from '@/types'
import { useSearchFocus } from '@/hooks/useSearchFocus'

interface ComboForPOS {
  id: string
  name: string
  sale_price: number
  components: Array<{ variantId: string; quantity: number }>
}

interface Props {
  onAddToCart: (variant: ProductVariant) => void
  onAddComboToCart: (combo: ComboForPOS) => void
  cart: CartItem[]
}

const CATEGORY_ORDER = [
  'Proteinas',
  'Pre-entrenos',
  'Creatina',
  'AMINOACIDOS Y BCAAS',
  'Farmaco',
  'CLA Y CARNITINA',
  'Snacks',
  'COLAGENO',
]

export default function ProductPanel({ onAddToCart, onAddComboToCart, cart }: Props) {
  const supabase = createClient()
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [onlyInStock, setOnlyInStock] = useState(false)
  const [allVariants, setAllVariants] = useState<ProductVariant[]>([])
  const [combos, setCombos] = useState<ComboForPOS[]>([])
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // 1. Sacamos el controlador al nivel del useEffect para poder limpiarlo
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 8_000)

    async function fetchAll() {
      try {
        // 2. Disparamos ambas peticiones al mismo tiempo y AMBAS protegidas con abortSignal
        const variantsPromise = supabase
          .from('product_variants')
          .select('*, product:products(id, name, brand, category, description, image_url, active, supplier_id, sale_type, created_at, updated_at)')
          .eq('active', true)
          .abortSignal(ctrl.signal)

        const combosPromise = supabase
          .from('combos')
          .select('id, name, sale_price, items:combo_items(variant_id, quantity)')
          .eq('active', true)
          .abortSignal(ctrl.signal)

        // Esperamos a que ambas terminen (o fallen por el timeout de 8s)
        const [variantsRes, combosRes] = await Promise.all([variantsPromise, combosPromise])

        if (variantsRes.error) throw variantsRes.error
        if (combosRes.error) throw combosRes.error

        // Asignamos variantes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAllVariants((variantsRes.data ?? []) as any)

        // Asignamos combos
        if (combosRes.data) {
          setCombos(combosRes.data.map((c: any) => ({
            id: c.id as string,
            name: c.name as string,
            sale_price: Number(c.sale_price),
            components: ((c.items as Array<{ variant_id: string; quantity: number }>) ?? []).map(i => ({
              variantId: i.variant_id,
              quantity: i.quantity,
            })),
          })))
        }

      } catch (e: unknown) {
        console.error('[POS load] Error o Timeout:', e)
      } finally {
        clearTimeout(tid)
        setLoading(false)
      }
    }

    fetchAll();

    // 3. Limpieza de seguridad: Si el componente se cierra, abortamos la petición de red
    return () => {
      clearTimeout(tid)
      ctrl.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useSearchFocus(inputRef)

  // Categorías que existen en los datos, en el orden definido (comparación sin mayúsculas)
  const categories = useMemo(() => {
    const existing = new Set(
      allVariants.map(v => v.product?.category?.trim()).filter(Boolean) as string[]
    )
    return CATEGORY_ORDER.filter(c =>
      [...existing].some(e => e.toLowerCase() === c.toLowerCase())
    )
  }, [allVariants])

  // Filtrado 100% en cliente — instantáneo
  const products = useMemo(() => {
    const q = activeQuery.trim().toLowerCase()
    return allVariants.filter(v => {
      if (onlyInStock && v.stock <= 0) return false
      if (category) {
        const vCat = v.product?.category?.trim().toLowerCase() ?? ''
        if (vCat !== category.toLowerCase()) return false
      }
      if (!q) return true
      const name = v.product?.name?.toLowerCase() ?? ''
      const flavor = v.flavor?.toLowerCase() ?? ''
      const barcode = v.barcode?.toLowerCase() ?? ''
      return name.includes(q) || flavor.includes(q) || barcode.includes(q)
    })
  }, [allVariants, activeQuery, category, onlyInStock])

  const getCartQty = useCallback(
    (variantId: string) => cart.find(i => i.variant.id === variantId)?.quantity ?? 0,
    [cart]
  )

  const getComboCartQty = useCallback(
    (comboId: string) => cart.find(i => i.comboId === comboId)?.quantity ?? 0,
    [cart]
  )

  const filteredCombos = useMemo(() => {
    if (category) return [] // combos no tienen categoría, solo aparecen en "Todos"
    const q = activeQuery.trim().toLowerCase()
    if (!q) return combos
    return combos.filter(c => c.name.toLowerCase().includes(q))
  }, [combos, activeQuery, category])

  const fmt = (n: number) => `$${n.toFixed(2)}`

  function getExpLabel(dateStr: string | null): { text: string; color: string } | null {
    if (!dateStr) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const exp = new Date(dateStr + 'T00:00:00')
    const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
    if (days < 0) return { text: 'VENCIDO', color: 'var(--danger)' }
    if (days === 0) return { text: 'Vence hoy', color: 'var(--danger)' }
    if (days <= 7) return { text: `Vence en ${days}d`, color: 'var(--danger)' }
    if (days <= 30) return { text: `Vence en ${days}d`, color: 'var(--warning)' }
    return null
  }

  return (
    <div className="product-panel">
      {/* Search bar */}
      <div className="search-bar">
        <div className="search-input-wrap">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveQuery(e.target.value) }}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !query.trim()) return
              const match = allVariants.find(
                v => v.barcode.toLowerCase() === query.trim().toLowerCase()
              )
              if (match && match.stock > 0) {
                onAddToCart(match)
                setQuery('')
                // activeQuery se mantiene: el producto escaneado sigue visible
              }
            }}
            placeholder="Buscar producto o escanear código de barras…"
            className="search-input"
          />
          {query && (
            <button className="search-clear" onClick={() => { setQuery(''); setActiveQuery('') }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>
        <div className="search-meta">
          {loading ? (
            <span className="meta-loading">Buscando…</span>
          ) : (
            <span className="meta-count">{loading ? `${allVariants.length} cargando…` : `${products.length} productos`}</span>
          )}
        </div>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="category-bar">
          <div className="category-scroll">
            <button
              className={`cat-btn ${category === null ? 'cat-btn--active' : ''}`}
              onClick={() => setCategory(null)}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                className={`cat-btn ${category === cat ? 'cat-btn--active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
          <button
            className={`cat-btn cat-btn--stock ${onlyInStock ? 'cat-btn--active' : ''}`}
            onClick={() => setOnlyInStock(v => !v)}
            title="Mostrar solo productos con existencia"
          >
            ✓ Existencia
          </button>
        </div>
      )}

      {/* Product grid */}
      <div className="product-grid-wrap">
        {loading ? (
          <div className="grid-loading">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        ) : products.length === 0 && filteredCombos.length === 0 ? (
          <div className="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p>Sin resultados para <strong>"{query}"</strong></p>
          </div>
        ) : (
          <div className="product-grid">
            {filteredCombos.map(combo => {
              const qty = getComboCartQty(combo.id)
              return (
                <button
                  key={`combo-${combo.id}`}
                  className={`product-card product-card--combo ${qty > 0 ? 'product-card--in-cart' : ''}`}
                  onClick={() => onAddComboToCart(combo)}
                >
                  {qty > 0 && <span className="cart-badge">{qty}</span>}
                  <span className="combo-tag">COMBO</span>
                  <div className="card-body">
                    <span className="card-name">{combo.name}</span>
                    <span className="card-brand">{combo.components.length} productos</span>
                  </div>
                  <div className="card-footer">
                    <span className="card-price">{fmt(combo.sale_price)}</span>
                  </div>
                </button>
              )
            })}
            {products.map(variant => {
              const qty = getCartQty(variant.id)
              const outOfStock = variant.stock <= 0
              const expLabel = getExpLabel(variant.expiration_date ?? null)
              const isExpired = expLabel?.text === 'VENCIDO' || expLabel?.text === 'Vence hoy'
              return (
                <button
                  key={variant.id}
                  className={`product-card ${outOfStock ? 'product-card--out' : ''} ${qty > 0 ? 'product-card--in-cart' : ''} ${isExpired ? 'product-card--expired' : ''}`}
                  onClick={() => !outOfStock && onAddToCart(variant)}
                  disabled={outOfStock}
                >
                  {qty > 0 && <span className="cart-badge">{qty}</span>}
                  {expLabel && (
                    <span className="exp-tag" style={{ color: expLabel.color, borderColor: expLabel.color }}>
                      {expLabel.text}
                    </span>
                  )}
                  <div className="card-body">
                    <span className="card-name">{variant.product?.name ?? '—'}</span>
                    {variant.flavor && <span className="card-flavor">{variant.flavor}</span>}
                    {variant.product?.brand && <span className="card-brand">{variant.product.brand}</span>}
                  </div>
                  <div className="card-footer">
                    <span className="card-price">{fmt(variant.sale_price)}</span>
                    <span className={`card-stock ${variant.stock <= 3 ? 'card-stock--low' : ''}`}>
                      {outOfStock ? 'Agotado' : `${variant.stock} uds`}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <style>{`
        .product-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-right: 1px solid var(--border);
        }

        /* Search */
        .search-bar {
          padding: 14px 16px 12px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .search-input-wrap {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
        }

        .search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-muted);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 9px 36px 9px 38px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }

        .search-input:focus { border-color: var(--accent); }
        .search-input::placeholder { color: var(--text-muted); }

        .search-clear {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          padding: 2px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .search-clear:hover { color: var(--text-primary); }

        .search-meta { flex-shrink: 0; }
        .meta-count, .meta-loading {
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        /* Categories */
        .category-bar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .category-scroll {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          scrollbar-width: none;
          flex: 1;
        }
        .category-scroll::-webkit-scrollbar { display: none; }

        .cat-btn {
          padding: 5px 12px;
          border-radius: 20px;
          border: 1px solid var(--border);
          background: transparent;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .cat-btn:hover { border-color: var(--accent); color: var(--accent); }
        .cat-btn--active {
          background: var(--accent);
          border-color: var(--accent);
          color: #0D0D12;
          font-weight: 700;
        }

        /* Grid */
        .product-grid-wrap {
          flex: 1;
          overflow-y: auto;
          padding: 14px;
        }

        .product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px;
        }

        .product-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          cursor: pointer;
          text-align: left;
          transition: all 0.15s;
          position: relative;
          min-height: 100px;
        }

        .product-card:hover:not(:disabled) {
          border-color: var(--accent);
          background: var(--bg-hover);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .product-card--in-cart {
          border-color: rgba(240,180,41,0.4);
          background: rgba(240,180,41,0.05);
        }

        .product-card--out {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .product-card--expired {
          border-color: rgba(239,68,68,0.35);
        }

        .product-card--combo {
          border-color: rgba(99,102,241,0.35);
          background: rgba(99,102,241,0.05);
        }
        .product-card--combo:hover:not(:disabled) {
          border-color: rgba(99,102,241,0.7);
        }

        .combo-tag {
          display: inline-block;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: #818CF8;
          border: 1px solid rgba(99,102,241,0.5);
          border-radius: 3px;
          padding: 1px 5px;
          background: rgba(99,102,241,0.12);
          align-self: flex-start;
        }

        .exp-tag {
          position: absolute;
          bottom: 6px;
          right: 6px;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
          padding: 1px 5px;
          border-radius: 3px;
          border: 1px solid;
          background: rgba(0,0,0,0.4);
          text-transform: uppercase;
        }

        .cart-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--accent);
          color: #0D0D12;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-syne, sans-serif);
        }

        .card-body { flex: 1; }

        .card-name {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          line-height: 1.3;
          margin-bottom: 3px;
        }

        .card-flavor {
          display: block;
          font-size: 11px;
          color: var(--accent);
          font-weight: 500;
        }

        .card-brand {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-top: 2px;
        }

        .card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: auto;
        }

        .card-price {
          font-family: var(--font-jetbrains, monospace);
          font-size: 14px;
          font-weight: 600;
          color: var(--accent);
        }

        .card-stock {
          font-size: 10px;
          color: var(--text-muted);
          background: var(--bg-hover);
          border-radius: 4px;
          padding: 2px 6px;
        }

        .card-stock--low { color: var(--warning, #F59E0B); }

        /* Empty/Loading */
        .grid-loading {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px;
        }

        .skeleton-card {
          height: 100px;
          border-radius: 10px;
          background: var(--bg-card);
          animation: skeleton-pulse 1.4s ease infinite;
        }

        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 60px 20px;
          color: var(--text-muted);
          text-align: center;
        }

        .empty-state p { font-size: 14px; }
        .empty-state strong { color: var(--text-secondary); }
      `}</style>
    </div>
  )
}
