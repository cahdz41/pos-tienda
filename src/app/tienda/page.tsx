'use client'

import { useEffect, useState, useMemo } from 'react'
import type { StoreProduct } from '@/types'
import ProductGrid from '@/components/tienda/ProductGrid'

// Categorías de display → keywords para matchear contra categorías internas del inventario
const STORE_CATEGORIES = [
  { label: 'PROTEINAS',    keywords: ['prote'] },
  { label: 'GANADORES',    keywords: ['ganador', 'masa', 'gainer'] },
  { label: 'PRE-ENTRENOS', keywords: ['pre-entreno', 'preentreno', 'pre entreno', 'preworkout', 'pre-workout'] },
  { label: 'CREATINAS',    keywords: ['creatina'] },
  { label: 'AMINOACIDOS',  keywords: ['amino', 'bcaa', 'glutamin'] },
  { label: 'TERMOGENICOS', keywords: ['termog', 'quemador', 'fat burn'] },
  { label: 'ACCESORIOS',   keywords: ['accesorio', 'shaker', 'guante', 'banda', 'equipo'] },
  { label: 'SNACKS',       keywords: ['snack', 'barra', ' bar '] },
]

function matchCategory(productCat: string | null, keywords: string[]): boolean {
  if (!productCat) return false
  // Normaliza: minúsculas + quita acentos
  const norm = productCat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return keywords.some(k => norm.includes(k.toLowerCase()))
}

function Hero({ onShopClick }: { onShopClick: () => void }) {
  return (
    <section style={{
      position: 'relative',
      minHeight: '92vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      padding: '0 max(24px, calc(50vw - 680px)) 80px',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 80% 60% at 60% 40%, #1A1200 0%, #0A0A0A 70%)',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', top: '-200px', right: '-100px',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(240,180,41,0.07) 0%, transparent 70%)',
        zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <p style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontSize: '11px', fontWeight: 600, color: '#F0B429',
          letterSpacing: '0.25em', textTransform: 'uppercase', margin: '0 0 24px',
        }}>
          Nutrición deportiva · Suplementos
        </p>
        <h1 style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontWeight: 800,
          fontSize: 'clamp(52px, 10vw, 130px)',
          color: '#FFFFFF', margin: '0 0 32px',
          lineHeight: 0.92, letterSpacing: '-4px', maxWidth: '900px',
        }}>
          ELEVA TU<br />
          <span style={{ color: '#F0B429' }}>RENDIMIENTO</span>
        </h1>
        <p style={{
          fontSize: '16px', color: '#555555', margin: '0 0 48px',
          maxWidth: '440px', lineHeight: 1.6,
        }}>
          Suplementos de calidad premium. Stock siempre actualizado en tiempo real con nuestra tienda.
        </p>
        <button
          onClick={onShopClick}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '10px',
            padding: '16px 32px', background: '#F0B429', border: 'none',
            borderRadius: '8px', color: '#000000', fontSize: '14px',
            fontWeight: 700, fontFamily: 'var(--font-syne, system-ui)',
            letterSpacing: '0.05em', cursor: 'pointer', transition: 'background 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FFCA4A' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F0B429' }}
        >
          VER CATÁLOGO
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent, #1A1A1A 20%, #1A1A1A 80%, transparent)',
        zIndex: 1,
      }} />
    </section>
  )
}

function Sidebar({ selected, onSelect }: { selected: string | null; onSelect: (c: string | null) => void }) {
  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    background: active ? 'rgba(240,180,41,0.08)' : 'transparent',
    color: active ? '#F0B429' : '#555555',
    fontFamily: 'var(--font-syne, system-ui)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    cursor: 'pointer',
    transition: 'color 0.15s, background 0.15s',
  })

  return (
    <aside style={{ width: '180px', flexShrink: 0, paddingTop: '4px' }}>
      <p style={{
        fontSize: '10px', fontWeight: 600, color: '#333333',
        letterSpacing: '0.15em', textTransform: 'uppercase',
        margin: '0 0 12px 14px',
      }}>
        Categorías
      </p>
      <button style={itemStyle(selected === null)} onClick={() => onSelect(null)}
        onMouseEnter={e => { if (selected !== null) (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF' }}
        onMouseLeave={e => { if (selected !== null) (e.currentTarget as HTMLButtonElement).style.color = '#555555' }}
      >
        TODOS
      </button>
      {STORE_CATEGORIES.map(cat => (
        <button
          key={cat.label}
          style={itemStyle(selected === cat.label)}
          onClick={() => onSelect(cat.label)}
          onMouseEnter={e => { if (selected !== cat.label) (e.currentTarget as HTMLButtonElement).style.color = '#FFFFFF' }}
          onMouseLeave={e => { if (selected !== cat.label) (e.currentTarget as HTMLButtonElement).style.color = '#555555' }}
        >
          {cat.label}
        </button>
      ))}
    </aside>
  )
}

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

  const filtered = useMemo(() => {
    if (!selectedCategory) return products
    const cat = STORE_CATEGORIES.find(c => c.label === selectedCategory)
    if (!cat) return products
    return products.filter(p => matchCategory(p.category, cat.keywords))
  }, [products, selectedCategory])

  return (
    <>
      <Hero onShopClick={() => {
        document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
      }} />

      <section id="catalogo" style={{ padding: '80px max(24px, calc(50vw - 680px)) 100px' }}>
        {/* Encabezado */}
        <div style={{ marginBottom: '48px' }}>
          <p style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontSize: '11px', fontWeight: 600, color: '#F0B429',
            letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px',
          }}>
            Productos
          </p>
          <h2 style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800, fontSize: 'clamp(32px, 5vw, 56px)',
            color: '#FFFFFF', margin: 0, lineHeight: 1, letterSpacing: '-2px',
          }}>
            CATÁLOGO
          </h2>
        </div>

        {/* Layout: sidebar + grid */}
        <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
          <Sidebar selected={selectedCategory} onSelect={setSelectedCategory} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  border: '2px solid #1A1A1A', borderTopColor: '#F0B429',
                  animation: 'spin 0.7s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            ) : error ? (
              <div style={{ padding: '80px 0', color: '#FF6B6B' }}>
                <p style={{ margin: 0 }}>Error: {error}</p>
              </div>
            ) : (
              <ProductGrid products={filtered} />
            )}
          </div>
        </div>
      </section>
    </>
  )
}
