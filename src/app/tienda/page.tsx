'use client'

import { useEffect, useState, useMemo } from 'react'
import type { StoreProduct } from '@/types'
import ProductGrid from '@/components/tienda/ProductGrid'

const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'

// 22 partículas con posiciones y timings determinísticos (SSR-safe)
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  left:     `${5  + ((i * 17 + 11) % 85)}%`,
  top:      `${10 + ((i * 23 +  7) % 75)}%`,
  size:     1.5 + (i % 3) * 0.7,
  delay:    `${((i * 280) % 3500) / 1000}s`,
  duration: `${3.5 + (i % 4) * 0.8}s`,
  color:    i % 5 === 0 ? '#ff6020' : '#cc2020',
  driftX:   `${-30 + (i % 7) * 10}px`,
}))

const HERO_CSS = `
  @keyframes glitch1 {
    0%, 88%, 100% { clip-path: inset(0 0 100% 0); transform: translate(0); }
    89% { clip-path: inset(15% 0 65% 0); transform: translate(-5px, 2px); }
    90% { clip-path: inset(55% 0 25% 0); transform: translate(5px, -2px); }
    91% { clip-path: inset(35% 0 45% 0); transform: translate(-3px, 1px); }
    92% { clip-path: inset(0 0 100% 0); }
  }
  @keyframes neonFlicker {
    0%, 93%, 100% {
      text-shadow: 0 0 10px rgba(200,20,20,0.9), 0 0 30px rgba(200,20,20,0.5), 0 0 60px rgba(200,20,20,0.2);
      opacity: 1;
    }
    94% { opacity: 0.6; text-shadow: 0 0 4px rgba(200,20,20,0.3); }
    95% { opacity: 1; text-shadow: 0 0 20px rgba(200,20,20,1), 0 0 50px rgba(200,20,20,0.7), 0 0 90px rgba(200,20,20,0.3); }
    96% { opacity: 0.8; }
    97% { opacity: 1; }
  }
  @keyframes particleDrift {
    0%   { transform: translateY(0)      translateX(0);             opacity: 0; }
    10%  { opacity: 1; }
    90%  { opacity: 0.5; }
    100% { transform: translateY(-400px) translateX(var(--dx, 20px)); opacity: 0; }
  }
  @keyframes scanline {
    from { top: -2px; }
    to   { top: 100%; }
  }
  @keyframes neonBorderPulse {
    0%,100% {
      box-shadow: 0 0 8px  rgba(200,20,20,0.4), 0 0 20px rgba(200,20,20,0.2), inset 0 0 12px rgba(200,20,20,0.08);
      border-color: rgba(200,20,20,0.5);
    }
    50% {
      box-shadow: 0 0 22px rgba(200,20,20,0.9), 0 0 45px rgba(200,20,20,0.5), 0 0 70px rgba(200,20,20,0.2), inset 0 0 20px rgba(200,20,20,0.12);
      border-color: rgba(200,20,20,0.95);
    }
  }
  @keyframes energyLine {
    0%   { transform: scaleX(0); opacity: 0.9; }
    60%  { transform: scaleX(1); opacity: 0.6; }
    100% { transform: scaleX(1); opacity: 0;   }
  }
  @keyframes heroTextSlide {
    from { transform: translateX(-60px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes logoScale {
    from { transform: translate(-50%, -50%) scale(0.65); opacity: 0; }
    to   { transform: translate(-50%, -50%) scale(1);    opacity: 1; }
  }
  @keyframes shockwave {
    0%   { transform: translate(-50%, -50%) scale(0.3); opacity: 0.8; }
    100% { transform: translate(-50%, -50%) scale(5.5); opacity: 0;   }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 0.45; }
  }
`

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
  const norm = productCat.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return keywords.some(k => norm.includes(k.toLowerCase()))
}

function Hero({ onShopClick }: { onShopClick: () => void }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick(k => k + 1), 8000)
    return () => clearInterval(t)
  }, [])

  return (
    <section style={{
      position: 'relative',
      minHeight: '92vh',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #050005 0%, #0a0005 50%, #050010 100%)',
    }}>
      <style>{HERO_CSS}</style>

      {/* Todo lo animado está bajo este div — al cambiar key React lo remonta y reinicia las animaciones */}
      <div key={tick} style={{ position: 'relative', width: '100%', minHeight: '92vh' }}>

        {/* Scanlines estáticas */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
        }} />

        {/* Scanline móvil */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(200,20,20,0.55), transparent)',
          zIndex: 3, pointerEvents: 'none',
          animation: 'scanline 5s linear infinite',
        }} />

        {/* Partículas */}
        {PARTICLES.map((p, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: p.left, top: p.top,
            width: `${p.size}px`, height: `${p.size}px`,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            zIndex: 1, pointerEvents: 'none',
            '--dx': p.driftX,
            animation: `particleDrift ${p.duration} ${p.delay} ease-in-out infinite`,
          } as React.CSSProperties} />
        ))}

        {/* Anillos shockwave ×3 */}
        {([0, 0.3, 0.6] as const).map((delay, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: '50%', top: '42%',
            width: '200px', height: '200px',
            borderRadius: '50%',
            border: `${1.5 - i * 0.3}px solid rgba(200,20,20,${0.6 - i * 0.15})`,
            zIndex: 4, pointerEvents: 'none',
            animation: `shockwave 1.5s ${delay}s ease-out both`,
          }} />
        ))}

        {/* Líneas de energía ×3 */}
        {([40, 44, 48] as const).map((top, i) => (
          <div key={i} style={{
            position: 'absolute', left: 0, right: 0,
            top: `${top}%`, height: '1px',
            background: `linear-gradient(90deg, transparent, rgba(200,20,20,${0.45 - i * 0.1}) 50%, transparent)`,
            zIndex: 4, pointerEvents: 'none',
            transformOrigin: 'center',
            animation: `energyLine 1.6s ${0.15 + i * 0.2}s ease-out both`,
          }} />
        ))}

        {/* Logo central */}
        <div style={{
          position: 'absolute',
          left: '50%', top: '42%',
          zIndex: 6,
          animation: 'logoScale 0.9s 0.15s ease-out both',
        }}>
          {/* Anillo exterior pulsante */}
          <div style={{
            width: '220px', height: '220px',
            borderRadius: '50%', overflow: 'hidden',
            border: '3px solid rgba(200,20,20,0.6)',
            animation: 'neonBorderPulse 2.8s ease-in-out infinite',
          }}>
            <img src={LOGO_URL} alt="Chocholand" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
          {/* Capa glitch encima */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%', overflow: 'hidden',
            zIndex: 1, pointerEvents: 'none',
          }}>
            <img src={LOGO_URL} alt="" aria-hidden style={{
              width: '100%', height: '100%', objectFit: 'cover',
              mixBlendMode: 'screen', opacity: 0.25,
              filter: 'hue-rotate(180deg) saturate(4)',
              animation: 'glitch1 5s 1s ease-in-out infinite',
            }} />
          </div>
        </div>

        {/* Texto hero — bottom left */}
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: 'max(24px, calc(50vw - 680px))',
          zIndex: 8,
          animation: 'heroTextSlide 0.9s 0.3s ease-out both',
        }}>
          <p style={{
            margin: '0 0 20px',
            fontSize: '15px', letterSpacing: '5px',
            color: '#cc2020',
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 600, textTransform: 'uppercase',
          }}>
            ▪ NUTRICIÓN DEPORTIVA · SUPLEMENTOS
          </p>

          <h1 style={{ margin: 0, lineHeight: 0.9 }}>
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-barlow-condensed, var(--font-syne, system-ui))',
              fontSize: 'clamp(56px, 8vw, 86px)', fontWeight: 900,
              color: '#FFFFFF', letterSpacing: '-2px',
              animation: 'glitch1 7s 2.5s ease-in-out infinite',
            }}>
              ELEVA TU
            </span>
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-barlow-condensed, var(--font-syne, system-ui))',
              fontSize: 'clamp(56px, 8vw, 86px)', fontWeight: 900,
              color: '#ff2020', letterSpacing: '-2px',
              animation: 'neonFlicker 4.5s 1.2s ease-in-out infinite',
              textShadow: '0 0 10px rgba(200,20,20,0.9), 0 0 30px rgba(200,20,20,0.5)',
            }}>
              RENDIMIENTO
            </span>
          </h1>

          <button
            onClick={onShopClick}
            style={{
              marginTop: '44px',
              display: 'inline-flex', alignItems: 'center', gap: '10px',
              padding: '14px 28px',
              background: 'rgba(200,20,20,0.12)',
              border: '1px solid rgba(200,20,20,0.7)',
              borderRadius: '8px', color: '#FFFFFF', fontSize: '13px',
              fontWeight: 700, fontFamily: 'var(--font-syne, system-ui)',
              letterSpacing: '0.1em', cursor: 'pointer',
              textTransform: 'uppercase',
              transition: 'background 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(200,20,20,0.28)'
              el.style.boxShadow = '0 0 22px rgba(200,20,20,0.4)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(200,20,20,0.12)'
              el.style.boxShadow = 'none'
            }}
          >
            VER CATÁLOGO
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* Texto vertical derecha */}
        <div style={{
          position: 'absolute',
          right: 'max(24px, calc(50vw - 680px))',
          top: '50%',
          zIndex: 5, pointerEvents: 'none',
          animation: 'fadeIn 1.2s 0.8s ease-out both',
          opacity: 0,
        }}>
          <span style={{
            display: 'block',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: '10px', letterSpacing: '0.2em',
            color: 'rgba(200,20,20,0.55)',
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 600, textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            transform: 'rotate(180deg)',
          }}>
            CHOCHOLAND · SUPLEMENTOS DEPORTIVOS · 2025
          </span>
        </div>

      </div>
    </section>
  )
}

const CATALOG_CSS = `
  @keyframes catGlow {
    0%, 100% { box-shadow: inset 3px 0 0 rgba(200,20,20,0.9), 0 0 10px rgba(200,20,20,0.25); }
    50%       { box-shadow: inset 3px 0 0 rgba(200,20,20,1),   0 0 22px rgba(200,20,20,0.55); }
  }
  @keyframes catPillGlow {
    0%, 100% { box-shadow: 0 0 8px rgba(200,20,20,0.4),  0 0 18px rgba(200,20,20,0.15); }
    50%       { box-shadow: 0 0 16px rgba(200,20,20,0.8), 0 0 30px rgba(200,20,20,0.35); }
  }
  /* Mobile: sidebar → pills horizontales */
  @media (max-width: 768px) {
    .cat-layout  { flex-direction: column !important; gap: 20px !important; }
    .cat-aside   { width: 100% !important; flex-shrink: 1 !important; }
    .cat-label   { display: none !important; }
    .cat-inner   {
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      overflow-x: auto !important;
      padding-bottom: 6px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .cat-inner::-webkit-scrollbar { display: none; }
    .cat-btn {
      width: auto !important;
      white-space: nowrap !important;
      padding: 8px 18px !important;
      border-radius: 999px !important;
      text-align: center !important;
      font-size: 12px !important;
      box-shadow: none !important;
    }
    .cat-btn-active {
      animation: catPillGlow 2.5s ease-in-out infinite !important;
    }
  }
`

function Sidebar({ selected, onSelect }: { selected: string | null; onSelect: (c: string | null) => void }) {
  const ALL_ITEMS = [{ label: 'TODOS', value: null as string | null }, ...STORE_CATEGORIES.map(c => ({ label: c.label, value: c.label }))]

  return (
    <aside className="cat-aside" style={{ width: '210px', flexShrink: 0 }}>
      <style>{CATALOG_CSS}</style>
      <p className="cat-label" style={{
        fontSize: '10px', fontWeight: 700,
        color: 'rgba(200,20,20,0.65)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        margin: '0 0 18px 4px',
        fontFamily: 'var(--font-syne, system-ui)',
      }}>
        — Categorías
      </p>

      <div className="cat-inner" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {ALL_ITEMS.map(({ label, value }) => {
          const active = selected === value
          return (
            <button
              key={label}
              className={`cat-btn${active ? ' cat-btn-active' : ''}`}
              onClick={() => onSelect(value)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '11px 18px',
                border: 'none',
                borderRadius: '6px',
                background: active ? 'rgba(200,20,20,0.1)' : 'transparent',
                color: active ? '#ff4040' : 'rgba(255,255,255,0.38)',
                fontFamily: 'var(--font-barlow-condensed, var(--font-syne, system-ui))',
                fontSize: '15px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s',
                textShadow: active ? '0 0 12px rgba(200,20,20,0.9), 0 0 28px rgba(200,20,20,0.45)' : 'none',
                animation: active ? 'catGlow 2.5s ease-in-out infinite' : 'none',
              }}
              onMouseEnter={e => {
                if (!active) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.color = 'rgba(255,255,255,0.9)'
                  el.style.background = 'rgba(255,255,255,0.05)'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  const el = e.currentTarget as HTMLButtonElement
                  el.style.color = 'rgba(255,255,255,0.38)'
                  el.style.background = 'transparent'
                }
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
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

        <div className="cat-layout" style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
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
