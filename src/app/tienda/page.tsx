'use client'

import { useEffect, useState, useMemo } from 'react'
import type { StoreProduct } from '@/types'
import CategoryFilter from '@/components/tienda/CategoryFilter'
import ProductGrid from '@/components/tienda/ProductGrid'

export default function TiendaPage() {
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/store/products')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setProducts(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(() => {
    const cats = products.map(p => p.category).filter(Boolean) as string[]
    return [...new Set(cats)].sort()
  }, [products])

  const filtered = useMemo(() => {
    if (!selectedCategory) return products
    return products.filter(p => p.category === selectedCategory)
  }, [products, selectedCategory])

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Header */}
      <div style={{ marginBottom: '48px' }}>
        <h1 style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontWeight: 800,
          fontSize: 'clamp(40px, 7vw, 80px)',
          color: '#FFFFFF',
          margin: '0 0 12px',
          lineHeight: 0.95,
          letterSpacing: '-3px',
        }}>
          Catálogo
        </h1>
        <p style={{ fontSize: '15px', color: '#444444', margin: 0 }}>
          Suplementos y nutrición deportiva
        </p>
      </div>

      {/* Filtro de categorías */}
      {!loading && categories.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <CategoryFilter
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            border: '2px solid #1A1A1A',
            borderTopColor: '#F0B429',
            animation: 'spin 0.7s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#FF6B6B' }}>
          <p style={{ margin: 0 }}>Error al cargar productos: {error}</p>
        </div>
      ) : (
        <ProductGrid products={filtered} />
      )}
    </main>
  )
}
