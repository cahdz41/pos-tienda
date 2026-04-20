'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Category } from '@/types'
import ProductModal from './ProductModal'
import CategoryModal from './CategoryModal'

export interface VariantFull {
  id: string
  barcode: string
  flavor: string | null
  sale_price: number
  wholesale_price: number
  cost_price: number
  stock: number
  min_stock: number
  expiration_date: string | null
  image_url: string | null
}

export interface ProductRow {
  id: string
  name: string
  category: string | null
  product_variants: VariantFull[]
  isOrphan?: boolean  // variante sin product record en la tabla products
}

export default function ProductosPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  const [editProduct, setEditProduct] = useState<ProductRow | 'new' | null>(null)
  const [showCategories, setShowCategories] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)
  const needsFocusRef = useRef(false)

  useEffect(() => { loadAll() }, [])

  // Auto-foco al entrar a la sección
  useEffect(() => { searchRef.current?.focus() }, [])

  // Foco al buscador cuando termina la recarga (tras guardar)
  useEffect(() => {
    if (!loading && needsFocusRef.current) {
      needsFocusRef.current = false
      searchRef.current?.focus()
      searchRef.current?.select()
    }
  }, [loading])

  function handleSaved() {
    setEditProduct(null)
    setSuccessMsg('Cambios guardados correctamente.')
    needsFocusRef.current = true
    loadAll()
    setTimeout(() => setSuccessMsg(null), 3000)
  }

  function handleClose() {
    setEditProduct(null)
    setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 50)
  }

  async function loadAll() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const LIMIT = 500

    try {
      // Queries independientes paginadas (igual que Inventario) para evitar
      // el límite de 1000 filas del JOIN y posibles diferencias de RLS
      const [prodRes, catRes] = await Promise.all([
        supabase.from('products').select('id, name, category').order('name'),
        supabase.from('categories').select('id, name, created_at').order('name'),
      ])
      if (prodRes.error) throw new Error(prodRes.error.message)
      if (catRes.error) throw new Error(catRes.error.message)

      const productsMap: Record<string, ProductRow> = {}
      for (const p of (prodRes.data ?? []) as { id: string; name: string; category: string | null }[]) {
        productsMap[p.id] = { id: p.id, name: p.name, category: p.category, product_variants: [] }
      }

      // Cargar variantes paginadas
      let page = 0
      while (true) {
        const { data: variants, error: varErr } = await supabase
          .from('product_variants')
          .select('id, product_id, barcode, flavor, sale_price, wholesale_price, cost_price, stock, min_stock, expiration_date, image_url')
          .range(page * LIMIT, (page + 1) * LIMIT - 1)
          .order('id')
        if (varErr) throw new Error(varErr.message)
        if (!variants || variants.length === 0) break

        for (const v of variants as (VariantFull & { product_id: string })[]) {
          if (!productsMap[v.product_id]) {
            productsMap[v.product_id] = {
              id: v.product_id,
              name: '',
              category: null,
              product_variants: [],
              isOrphan: true,
            }
          }
          productsMap[v.product_id].product_variants.push({
            id:              v.id,
            barcode:         v.barcode,
            flavor:          v.flavor,
            sale_price:      v.sale_price,
            wholesale_price: v.wholesale_price,
            cost_price:      v.cost_price,
            stock:           v.stock,
            min_stock:       v.min_stock,
            expiration_date: v.expiration_date,
            image_url:       v.image_url,
          })
        }

        if (variants.length < LIMIT) break
        page++
      }

      setProducts(Object.values(productsMap).sort((a, b) => a.name.localeCompare(b.name)))
      setCategories((catRes.data ?? []) as Category[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando productos')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(product: ProductRow) {
    if (!isOwner) return
    const variantIds = product.product_variants.map(v => v.id)
    const supabase = createClient()

    if (variantIds.length > 0) {
      const { data: sales } = await supabase
        .from('sale_items')
        .select('id')
        .in('variant_id', variantIds)
        .limit(1)

      if (sales && sales.length > 0) {
        alert('No se puede eliminar: este producto tiene ventas registradas.')
        return
      }
    }

    const msg = product.product_variants.length > 0
      ? `¿Eliminar "${product.name}" y sus ${product.product_variants.length} variante(s)?`
      : `¿Eliminar "${product.name}"?`
    if (!confirm(msg)) return

    if (variantIds.length > 0) {
      const { error: varErr } = await supabase
        .from('product_variants')
        .delete()
        .in('id', variantIds)
      if (varErr) { alert('Error eliminando variantes: ' + varErr.message); return }
    }

    const { error: prodErr } = await supabase
      .from('products')
      .delete()
      .eq('id', product.id)
    if (prodErr) { alert('Error eliminando producto: ' + prodErr.message); return }

    setProducts(prev => prev.filter(p => p.id !== product.id))
  }

  const filtered = useMemo(() => {
    let list = products
    if (categoryFilter) list = list.filter(p => (p.category ?? '') === categoryFilter)

    if (!search.trim()) return list

    const q = search.toLowerCase().trim()
    const exact = search.trim()

    const matched = list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.category ?? '').toLowerCase().includes(q) ||
      p.product_variants.some(v => v.barcode.includes(q))
    )

    // Coincidencia exacta de barcode primero, luego parcial, luego nombre
    return [...matched].sort((a, b) => {
      const aExact = a.product_variants.some(v => v.barcode === exact)
      const bExact = b.product_variants.some(v => v.barcode === exact)
      if (aExact !== bExact) return aExact ? -1 : 1
      const aBar = a.product_variants.some(v => v.barcode.includes(q))
      const bBar = b.product_variants.some(v => v.barcode.includes(q))
      if (aBar !== bBar) return aBar ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [products, search, categoryFilter])

  // Auto-abrir cuando el search es un barcode y hay exactamente 1 resultado
  useEffect(() => {
    if (
      filtered.length === 1 &&
      /^\d{6,}$/.test(search.trim()) &&
      editProduct === null &&
      !loading
    ) {
      setEditProduct(filtered[0])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered])

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-col gap-3 h-full">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando productos…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={loadAll} className="px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error} — Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Productos</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} de {products.length} productos
            </p>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCategories(true)}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Categorías
              </button>
              <button
                onClick={() => setEditProduct('new')}
                className="px-3 py-2 rounded-lg text-xs font-bold"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                + Nuevo producto
              </button>
            </div>
          )}
        </div>

        {/* Búsqueda + filtro */}
        <div className="flex gap-2">
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre o categoría…"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="rounded-lg px-3 py-2 text-xs outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mensaje de éxito */}
      {successMsg && (
        <div className="mx-5 mb-2 px-4 py-2.5 rounded-lg flex items-center gap-2 shrink-0"
          style={{ background: '#0A2E1A', border: '1px solid #1A5C36', color: '#4ADE80' }}>
          <span style={{ fontSize: '14px' }}>✓</span>
          <span className="text-xs font-semibold">{successMsg}</span>
        </div>
      )}

      {/* Tabla */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {search || categoryFilter ? 'Sin resultados' : 'No hay productos aún'}
            </p>
            {isOwner && !search && !categoryFilter && (
              <button
                onClick={() => setEditProduct('new')}
                className="px-4 py-2 rounded-lg text-xs font-bold"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                + Crear primer producto
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse" style={{ minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Producto', 'Categoría', 'Variantes', 'Stock total', ''].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-xs font-semibold"
                    style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const totalStock = p.product_variants.reduce((s, v) => s + v.stock, 0)
                const varCount = p.product_variants.length
                return (
                  <tr key={p.id}
                    style={{ borderBottom: '1px solid var(--border)' }}
                    className="hover:bg-[var(--surface)] transition-colors">

                    <td className="py-3 px-3">
                      <p className="font-semibold text-xs" style={{ color: 'var(--text)' }}>{p.name}</p>
                    </td>

                    <td className="py-3 px-3">
                      {p.category ? (
                        <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {p.category}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {varCount} {varCount === 1 ? 'variante' : 'variantes'}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <span className="text-xs font-mono font-semibold"
                        style={{ color: totalStock > 0 ? '#4CAF50' : '#FF6B6B' }}>
                        {totalStock}
                      </span>
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditProduct(p)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          {isOwner ? 'Editar' : 'Ver'}
                        </button>
                        {isOwner && (
                          <button
                            onClick={() => handleDelete(p)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editProduct !== null && (
        <ProductModal
          product={editProduct}
          categories={categories}
          isOwner={isOwner}
          highlightBarcode={search.trim() || undefined}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {showCategories && (
        <CategoryModal
          onClose={() => setShowCategories(false)}
          onChanged={loadAll}
        />
      )}
    </div>
  )
}
