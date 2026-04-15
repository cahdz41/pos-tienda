'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import type { StoreProduct } from '@/types'
import CategoryFilter from '@/components/tienda/CategoryFilter'
import ProductGrid from '@/components/tienda/ProductGrid'

function Hero({ onShopClick }: { onShopClick: () => void }) {
  return (
    <section style={{
      position: 'relative',
      minHeight: '92vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: '0 max(24px, calc(50vw - 640px)) 80px',
      overflow: 'hidden',
    }}>
      {/* Fondo con gradiente abstracto */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 60% 40%, #1A1200 0%, #0A0A0A 70%)',
        zIndex: 0,
      }} />
      {/* Acento de luz superior */}
      <div style={{
        position: 'absolute',
        top: '-200px',
        right: '-100px',
        width: '600px',
        height: '600px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(240,180,41,0.07) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      {/* Texto hero */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontSize: '11px',
          fontWeight: 600,
          color: '#F0B429',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          margin: '0 0 24px',
        }}>
          Nutrición deportiva · Suplementos
        </p>

        <h1 style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontWeight: 800,
          fontSize: 'clamp(52px, 10vw, 130px)',
          color: '#FFFFFF',
          margin: '0 0 32px',
          lineHeight: 0.92,
          letterSpacing: '-4px',
          maxWidth: '900px',
        }}>
          ELEVA TU<br />
          <span style={{ color: '#F0B429' }}>RENDIMIENTO</span>
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#555555',
          margin: '0 0 48px',
          maxWidth: '440px',
          lineHeight: 1.6,
        }}>
          Suplementos de calidad premium. Stock siempre actualizado en tiempo real con nuestra tienda.
        </p>

        <button
          onClick={onShopClick}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            padding: '16px 32px',
            background: '#F0B429',
            border: 'none',
            borderRadius: '8px',
            color: '#000000',
            fontSize: '14px',
            fontWeight: 700,
            fontFamily: 'var(--font-syne, system-ui)',
            letterSpacing: '0.05em',
            cursor: 'pointer',
            transition: 'background 0.15s, transform 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#FFCA4A'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#F0B429'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
          }}
        >
          VER CATÁLOGO
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      {/* Línea divisoria inferior */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: 'linear-gradient(90deg, transparent, #1A1A1A 20%, #1A1A1A 80%, transparent)',
        zIndex: 1,
      }} />
    </section>
  )
}

export default function TiendaPage() {
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const catalogRef = useRef<HTMLDivElement>(null)

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
    <>
      <Hero onShopClick={() => catalogRef.current?.scrollIntoView({ behavior: 'smooth' })} />

      {/* Sección catálogo */}
      <section
        ref={catalogRef}
        style={{ padding: '80px max(24px, calc(50vw - 640px)) 100px' }}
      >
        {/* Encabezado sección */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '24px',
          marginBottom: '40px',
        }}>
          <div>
            <p style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontSize: '11px',
              fontWeight: 600,
              color: '#F0B429',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              margin: '0 0 8px',
            }}>
              Productos
            </p>
            <h2 style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 800,
              fontSize: 'clamp(32px, 5vw, 56px)',
              color: '#FFFFFF',
              margin: 0,
              lineHeight: 1,
              letterSpacing: '-2px',
            }}>
              CATÁLOGO
            </h2>
          </div>

          {!loading && categories.length > 0 && (
            <CategoryFilter
              categories={categories}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />
          )}
        </div>

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
      </section>
    </>
  )
}
