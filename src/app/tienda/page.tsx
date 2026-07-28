'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { StoreProduct, Offer, Package } from '@/types'
import ProductGrid from '@/components/tienda/ProductGrid'
import { ProductGridSkeleton } from '@/components/tienda/ProductSkeleton'
import StoreSearch from '@/components/tienda/StoreSearch'
import { cldUrl } from '@/lib/cloudinary'

const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'
const LOGO_HERO = cldUrl(LOGO_URL, { width: 440, crop: 'fill' }) // 220px @2x

// Hero aligerado: una sola animación infinita sutil (el pulso del borde del logo).
// El resto son animaciones de entrada que corren una vez y se detienen.
const HERO_CSS = `
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
  @keyframes heroTextSlide {
    from { transform: translateX(-40px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes logoScale {
    from { transform: translate(-50%, -50%) scale(0.7); opacity: 0; }
    to   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 0.45; }
  }
  @media (max-width: 640px) {
    .hero-section { min-height: 62vh !important; }
    .hero-logo-ring { width: 150px !important; height: 150px !important; }
    .hero-text-block { bottom: 40px !important; }
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
  return (
    <section className="hero-section" style={{
      position: 'relative',
      minHeight: '92vh',
      overflow: 'hidden',
      background: 'linear-gradient(135deg, #050005 0%, #0a0005 50%, #050010 100%)',
    }}>
      <style>{HERO_CSS}</style>

      <div style={{ position: 'relative', width: '100%', minHeight: 'inherit' }}>

        {/* Scanlines estáticas (textura, sin animación) */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.04) 3px, rgba(0,0,0,0.04) 4px)',
        }} />

        {/* Logo central */}
        <div style={{
          position: 'absolute',
          left: '50%', top: '42%',
          zIndex: 6,
          animation: 'logoScale 0.8s 0.1s ease-out both',
        }}>
          <div className="hero-logo-ring" style={{
            width: '220px', height: '220px',
            borderRadius: '50%', overflow: 'hidden',
            border: '3px solid rgba(200,20,20,0.6)',
            animation: 'neonBorderPulse 3s ease-in-out infinite',
          }}>
            <img src={LOGO_HERO} alt="Chocholand" width={220} height={220} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        </div>

        {/* Texto hero — bottom left */}
        <div className="hero-text-block" style={{
          position: 'absolute',
          bottom: '80px',
          left: 'max(24px, calc(50vw - 680px))',
          zIndex: 8,
          animation: 'heroTextSlide 0.7s 0.25s ease-out both',
        }}>
          <p style={{
            margin: '0 0 20px',
            fontSize: '15px', letterSpacing: '5px',
            color: '#cc2020',
            fontFamily: 'var(--font-barlow-condensed, system-ui)',
            fontWeight: 600, textTransform: 'uppercase',
          }}>
            ▪ NUTRICIÓN DEPORTIVA · SUPLEMENTOS
          </p>

          <h1 style={{ margin: 0, lineHeight: 0.9 }}>
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-barlow-condensed, system-ui)',
              fontSize: 'clamp(56px, 8vw, 86px)', fontWeight: 900,
              color: '#FFFFFF', letterSpacing: '-2px',
            }}>
              ELEVA TU
            </span>
            <span style={{
              display: 'block',
              fontFamily: 'var(--font-barlow-condensed, system-ui)',
              fontSize: 'clamp(56px, 8vw, 86px)', fontWeight: 900,
              color: '#ff2020', letterSpacing: '-2px',
              textShadow: '0 0 10px rgba(200,20,20,0.9), 0 0 30px rgba(200,20,20,0.5), 0 0 60px rgba(200,20,20,0.2)',
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
              fontWeight: 700, fontFamily: 'var(--font-barlow-condensed, system-ui)',
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

        {/* Texto vertical derecha (aparece una vez) */}
        <div style={{
          position: 'absolute',
          right: 'max(24px, calc(50vw - 680px))',
          top: '50%',
          zIndex: 5, pointerEvents: 'none',
          animation: 'fadeIn 1s 0.6s ease-out both',
          opacity: 0,
        }}>
          <span style={{
            display: 'block',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            fontSize: '10px', letterSpacing: '0.2em',
            color: 'rgba(200,20,20,0.55)',
            fontFamily: 'var(--font-barlow-condensed, system-ui)',
            fontWeight: 600, textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            transform: 'rotate(180deg)',
          }}>
            CHOCHOLAND · SUPLEMENTOS DEPORTIVOS
          </span>
        </div>

      </div>
    </section>
  )
}

const CATALOG_CSS = `
  @keyframes offerBtnGlow {
    0%, 100% { box-shadow: 0 0 8px rgba(255,80,0,0.6), 0 0 20px rgba(255,50,0,0.25); border-color: rgba(220,80,0,0.7); }
    50%       { box-shadow: 0 0 18px rgba(255,130,0,1), 0 0 38px rgba(255,80,0,0.5); border-color: rgba(255,120,0,1); }
  }
  @keyframes pkgBtnGlow {
    0%, 100% { box-shadow: 0 0 8px rgba(255,190,0,0.5), 0 0 18px rgba(255,160,0,0.2); border-color: rgba(245,158,11,0.6); }
    50%       { box-shadow: 0 0 16px rgba(255,220,0,0.9), 0 0 30px rgba(255,190,0,0.4); border-color: rgba(255,210,0,0.9); }
  }
  @keyframes catGlow {
    0%, 100% { box-shadow: inset 3px 0 0 rgba(200,20,20,0.9), 0 0 10px rgba(200,20,20,0.25); }
    50%       { box-shadow: inset 3px 0 0 rgba(200,20,20,1),   0 0 22px rgba(200,20,20,0.55); }
  }
  /* Mobile: sidebar → cuadrícula de tiles (todas las categorías visibles) */
  @media (max-width: 768px) {
    .cat-layout  { flex-direction: column !important; gap: 20px !important; }
    .cat-aside   { width: 100% !important; flex-shrink: 1 !important; }
    .cat-label   { display: none !important; }
    .cat-inner   {
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    }
    .cat-btn {
      width: 100% !important;
      text-align: center !important;
      padding: 15px 12px !important;
      border-radius: 12px !important;
      font-size: 13px !important;
      box-shadow: none !important;
      white-space: normal !important;
    }
    .cat-btn:not(.cat-special) {
      border: 1px solid rgba(255,255,255,0.09) !important;
      background: rgba(255,255,255,0.03) !important;
      color: rgba(255,255,255,0.78) !important;
    }
    .cat-btn-active:not(.cat-special) {
      border-color: rgba(200,20,20,0.6) !important;
      background: rgba(200,20,20,0.12) !important;
      color: #ff4040 !important;
      animation: none !important;
    }
    .cat-sep     { display: none !important; }
    .cat-special { grid-column: 1 / -1 !important; }
  }
`

type TiendaView = 'catalogo' | 'ofertas' | 'paquetes'

function Sidebar({ selected, onSelect, view, onViewChange }: {
  selected: string | null
  onSelect: (c: string | null) => void
  view: TiendaView
  onViewChange: (v: TiendaView) => void
}) {
  const ALL_ITEMS = [{ label: 'TODOS', value: null as string | null }, ...STORE_CATEGORIES.map(c => ({ label: c.label, value: c.label }))]

  const catBtnBase: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '11px 18px',
    border: 'none', borderRadius: '6px', cursor: 'pointer',
    transition: 'color 0.15s, background 0.15s',
    fontFamily: 'var(--font-barlow-condensed, system-ui)',
    fontSize: '15px', fontWeight: 700, letterSpacing: '0.14em',
  }

  return (
    <aside className="cat-aside" style={{ width: '210px', flexShrink: 0 }}>
      <style>{CATALOG_CSS}</style>
      <p className="cat-label" style={{
        fontSize: '10px', fontWeight: 700, color: 'rgba(200,20,20,0.65)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
        margin: '0 0 18px 4px', fontFamily: 'var(--font-barlow-condensed, system-ui)',
      }}>
        — Categorías
      </p>

      <div className="cat-inner" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {ALL_ITEMS.map(({ label, value }) => {
          const active = view === 'catalogo' && selected === value
          return (
            <button key={label}
              className={`cat-btn${active ? ' cat-btn-active' : ''}`}
              onClick={() => { onSelect(value); onViewChange('catalogo') }}
              style={{
                ...catBtnBase,
                background: active ? 'rgba(200,20,20,0.1)' : 'transparent',
                color: active ? '#ff4040' : 'rgba(255,255,255,0.38)',
                textShadow: active ? '0 0 12px rgba(200,20,20,0.9), 0 0 28px rgba(200,20,20,0.45)' : 'none',
                animation: active ? 'catGlow 2.5s ease-in-out infinite' : 'none',
              }}
              onMouseEnter={e => { if (!active) { const el = e.currentTarget as HTMLButtonElement; el.style.color = 'rgba(255,255,255,0.9)'; el.style.background = 'rgba(255,255,255,0.05)' } }}
              onMouseLeave={e => { if (!active) { const el = e.currentTarget as HTMLButtonElement; el.style.color = 'rgba(255,255,255,0.38)'; el.style.background = 'transparent' } }}
            >
              {label}
            </button>
          )
        })}

        {/* Separador */}
        <div className="cat-sep" style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '10px 0' }} />

        {/* Botón OFERTAS DEL MES */}
        <button
          className="cat-btn cat-special"
          onClick={() => onViewChange('ofertas')}
          style={{
            ...catBtnBase,
            padding: '12px 18px',
            border: `1px solid ${view === 'ofertas' ? 'rgba(220,80,0,0.7)' : 'rgba(220,80,0,0.25)'}`,
            background: view === 'ofertas' ? 'rgba(220,38,38,0.15)' : 'rgba(180,40,0,0.07)',
            color: view === 'ofertas' ? '#ff6030' : 'rgba(255,120,60,0.6)',
            animation: view === 'ofertas' ? 'offerBtnGlow 2.2s ease-in-out infinite' : 'none',
            textShadow: view === 'ofertas' ? '0 0 10px rgba(255,80,0,0.8)' : 'none',
          }}
        >
          🔥 OFERTAS DEL MES
        </button>

        {/* Botón PAQUETES EN OFERTA */}
        <button
          className="cat-btn cat-special"
          onClick={() => onViewChange('paquetes')}
          style={{
            ...catBtnBase,
            padding: '12px 18px',
            marginTop: 4,
            border: `1px solid ${view === 'paquetes' ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.2)'}`,
            background: view === 'paquetes' ? 'rgba(245,158,11,0.1)' : 'rgba(180,130,0,0.06)',
            color: view === 'paquetes' ? '#fbbf24' : 'rgba(251,191,36,0.45)',
            animation: view === 'paquetes' ? 'pkgBtnGlow 2.2s ease-in-out infinite' : 'none',
            textShadow: view === 'paquetes' ? '0 0 10px rgba(255,200,0,0.7)' : 'none',
          }}
        >
          🎁 PAQUETES EN OFERTA
        </button>
      </div>
    </aside>
  )
}

// ── Skeletons shimmer ─────────────────────────────────────────────────────────

const SHIMMER_CSS = `
  @keyframes shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`

function ShimmerBlock({ width = '100%', height }: { width?: string; height: number }) {
  return (
    <div style={{ width, height, borderRadius: 6, background: '#1A1A1A', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg, #1A1A1A 25%, #252525 50%, #1A1A1A 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }} />
    </div>
  )
}

function OfertaCardSkeleton() {
  return (
    <div style={{ background: '#111', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div style={{ height: 190, background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(90deg, #0a0a0a 25%, #141414 50%, #0a0a0a 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      </div>
      <div style={{ padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ShimmerBlock width="40%" height={10} />
        <ShimmerBlock width="85%" height={14} />
        <ShimmerBlock width="55%" height={14} />
        <ShimmerBlock width="35%" height={22} />
      </div>
    </div>
  )
}

function OfertasGridSkeleton() {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
        {Array.from({ length: 6 }).map((_, i) => <OfertaCardSkeleton key={i} />)}
      </div>
    </>
  )
}

function PaqueteCardSkeleton() {
  return (
    <div style={{ background: '#111', borderRadius: 16, padding: '20px 22px', border: '1px solid rgba(255,200,0,0.08)', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <ShimmerBlock width="100px" height={22} />
        <ShimmerBlock width="50px" height={22} />
      </div>
      <ShimmerBlock width="75%" height={22} />
      {[0, 1, 2].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 6, background: '#1A1A1A', flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #1A1A1A 25%, #252525 50%, #1A1A1A 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }} />
          </div>
          <ShimmerBlock width="70%" height={12} />
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
        <ShimmerBlock width="50%" height={28} />
      </div>
    </div>
  )
}

function PaquetesGridSkeleton() {
  return (
    <>
      <style>{SHIMMER_CSS}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
        {Array.from({ length: 4 }).map((_, i) => <PaqueteCardSkeleton key={i} />)}
      </div>
    </>
  )
}

// ── Ofertas ──────────────────────────────────────────────────────────────────

function fmtMXN(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function OfertaCard({ offer }: { offer: Offer }) {
  const router = useRouter()
  const pct   = offer.precio_lista > 0 ? Math.round(((offer.precio_lista - offer.precio_oferta) / offer.precio_lista) * 100) : 0
  const ahorro = offer.precio_lista - offer.precio_oferta
  return (
    <div
      onClick={() => router.push(`/tienda/ofertas/${offer.id}`)}
      style={{ background: '#111', borderRadius: 16, overflow: 'hidden', position: 'relative',
        border: '1px solid rgba(255,255,255,0.07)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(0,0,0,0.5)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Badge descuento */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2,
        background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 800,
        padding: '4px 10px', borderRadius: 20 }}>
        -{pct}%
      </div>

      {/* Imagen */}
      <div style={{ height: 190, background: '#0a0a0a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {offer.imagen
          ? <img src={cldUrl(offer.imagen, { width: 440 })} alt={offer.nombre} loading="lazy" decoding="async"
              style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 48 }}>📦</span>
        }
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px 18px' }}>
        <p style={{ fontSize: 10, color: '#cc2020', textTransform: 'uppercase', fontWeight: 700,
          letterSpacing: '0.12em', margin: '0 0 5px',
          fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
          {offer.categoria}
        </p>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 12px',
          lineHeight: 1.3, fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
          {offer.nombre}
        </h3>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>
            {fmtMXN(offer.precio_lista)}
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#ff4040',
            fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
            {fmtMXN(offer.precio_oferta)}
          </span>
        </div>
        {ahorro > 0 && (
          <span style={{ display: 'inline-block', marginTop: 8,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
            ¡Ahorras {fmtMXN(ahorro)}!
          </span>
        )}
      </div>
    </div>
  )
}

function OfertasSection({ offers, loading }: { offers: Offer[]; loading: boolean }) {
  const [cat, setCat] = useState<string | null>(null)

  const categories = useMemo(() => {
    const s = new Set(offers.map(o => o.categoria).filter(Boolean))
    return Array.from(s).sort() as string[]
  }, [offers])

  const filtered = useMemo(() =>
    cat ? offers.filter(o => o.categoria === cat) : offers
  , [offers, cat])

  const pillActive: React.CSSProperties = {
    padding: '7px 18px', borderRadius: 999, border: '1px solid rgba(220,38,38,0.5)',
    cursor: 'pointer', fontWeight: 700, fontSize: 12, letterSpacing: '0.08em',
    fontFamily: 'var(--font-barlow-condensed, system-ui)',
    background: 'rgba(220,38,38,0.15)', color: '#ff5050',
  }
  const pillInactive: React.CSSProperties = {
    ...pillActive, background: 'transparent', color: 'rgba(255,255,255,0.35)',
    border: '1px solid rgba(255,255,255,0.1)',
  }

  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontSize: 11, fontWeight: 600,
          color: '#ff6030', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          Promociones
        </p>
        <h2 style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontWeight: 800,
          fontSize: 'clamp(28px, 4vw, 48px)', color: '#FFFFFF', margin: 0,
          lineHeight: 1, letterSpacing: '-2px' }}>
          OFERTAS DEL MES
        </h2>
      </div>

      {/* Filtros por categoría */}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
          <button onClick={() => setCat(null)} style={cat === null ? pillActive : pillInactive}>TODOS</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)} style={cat === c ? pillActive : pillInactive}>{c}</button>
          ))}
        </div>
      )}

      {loading ? (
        <OfertasGridSkeleton />
      ) : filtered.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', padding: '60px 0' }}>
          No hay ofertas disponibles por el momento.
        </p>
      ) : (
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
          {filtered.map(o => <OfertaCard key={o.id} offer={o} />)}
        </div>
      )}
    </>
  )
}

// ── Paquetes ─────────────────────────────────────────────────────────────────

function PaqueteCard({ pkg }: { pkg: Package }) {
  const router = useRouter()
  const pct    = pkg.precio_lista > 0 ? Math.round(((pkg.precio_lista - pkg.precio_oferta) / pkg.precio_lista) * 100) : 0
  const ahorro = pkg.precio_lista - pkg.precio_oferta
  return (
    <div
      onClick={() => router.push(`/tienda/paquetes/${pkg.id}`)}
      style={{ background: '#111', borderRadius: 16, padding: '20px 22px', position: 'relative',
        border: '1px solid rgba(255,200,0,0.15)', transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer' }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 32px rgba(0,0,0,0.5), 0 0 24px rgba(255,190,0,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'none'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Badges */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)',
          color: '#fbbf24', fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
          letterSpacing: '0.08em', fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
          COMBO ESPECIAL
        </span>
        <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, fontWeight: 800,
          padding: '4px 10px', borderRadius: 20, fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
          -{pct}%
        </span>
      </div>

      {/* Nombre */}
      <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', textTransform: 'uppercase',
        margin: '0 0 16px', letterSpacing: '-0.5px',
        fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
        {pkg.nombre}
      </h3>

      {/* Productos: thumbnails + nombres */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {pkg.productos.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {p.imagen
              ? <img src={cldUrl(p.imagen, { width: 80 })} alt="" loading="lazy" decoding="async" style={{ width: 38, height: 38, objectFit: 'contain',
                  borderRadius: 6, background: '#0a0a0a', flexShrink: 0 }} />
              : <div style={{ width: 38, height: 38, borderRadius: 6, background: '#1a1a1a',
                  flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📦</div>
            }
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3 }}>
              {p.nombre.split(' — ')[0]}
            </span>
          </div>
        ))}
      </div>

      {/* Precios */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textDecoration: 'line-through' }}>
            {fmtMXN(pkg.precio_lista)}
          </span>
          <span style={{ fontSize: 28, fontWeight: 800, color: '#4ade80',
            fontFamily: 'var(--font-barlow-condensed, system-ui)' }}>
            {fmtMXN(pkg.precio_oferta)}
          </span>
        </div>
        {ahorro > 0 && (
          <span style={{ display: 'inline-block', marginTop: 8,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
            ¡Ahorras {fmtMXN(ahorro)}!
          </span>
        )}
      </div>
    </div>
  )
}

function PaquetesSection({ packages, loading }: { packages: Package[]; loading: boolean }) {
  return (
    <>
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontSize: 11, fontWeight: 600,
          color: '#fbbf24', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          Combos Exclusivos
        </p>
        <h2 style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontWeight: 800,
          fontSize: 'clamp(28px, 4vw, 48px)', color: '#FFFFFF', margin: 0,
          lineHeight: 1, letterSpacing: '-2px' }}>
          PAQUETES EN OFERTA
        </h2>
      </div>

      {loading ? (
        <PaquetesGridSkeleton />
      ) : packages.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', padding: '60px 0' }}>
          No hay paquetes disponibles por el momento.
        </p>
      ) : (
        <div style={{ display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
          {packages.map(p => <PaqueteCard key={p.id} pkg={p} />)}
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TiendaPage() {
  const [products,         setProducts]         = useState<StoreProduct[]>([])
  const [productsLoading,  setProductsLoading]  = useState(true)
  const [productsError,    setProductsError]    = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [view,             setView]             = useState<TiendaView>('catalogo')
  const [offers,           setOffers]           = useState<Offer[]>([])
  const [offersLoading,    setOffersLoading]    = useState(true)
  const [packages,         setPackages]         = useState<Package[]>([])
  const [packagesLoading,  setPackagesLoading]  = useState(false)

  useEffect(() => {
    fetch('/api/store/products')
      .then(r => r.json())
      .then(data => { if (data.error) throw new Error(data.error); setProducts(data) })
      .catch(e => setProductsError(e.message))
      .finally(() => setProductsLoading(false))

    // Cargar ofertas al inicio para mostrar badges de descuento en el catálogo
    fetch('/api/ofertas').then(r => r.json())
      .then(d => setOffers(Array.isArray(d) ? d : []))
      .finally(() => setOffersLoading(false))
  }, [])

  // Mapa variant_id → oferta, para cruzar precios en las tarjetas del catálogo
  const offersByVariant = useMemo(() => {
    const m = new Map<string, Offer>()
    for (const o of offers) {
      if (o.variant_id) m.set(o.variant_id, o)
    }
    return m
  }, [offers])

  // Recarga los paquetes cada vez que se abre la vista para reflejar cambios del POS.
  useEffect(() => {
    if (view !== 'paquetes') return

    let cancelled = false
    void Promise.resolve().then(() => {
      if (!cancelled) setPackagesLoading(true)
    })
    fetch('/api/paquetes', { cache: 'no-store' }).then(r => r.json())
      .then(d => {
        if (!cancelled) setPackages(Array.isArray(d) ? d.filter((p: Package) => p.activo) : [])
      })
      .finally(() => {
        if (!cancelled) setPackagesLoading(false)
      })

    return () => { cancelled = true }
  }, [view])

  function goToView(v: TiendaView) {
    setView(v)
    document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' })
  }

  const filteredProducts = useMemo(() => {
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

        {/* Header del catálogo (solo en vista catálogo) */}
        {view === 'catalogo' && (
          <div style={{ marginBottom: '48px' }}>
            <p style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontSize: '11px', fontWeight: 600,
              color: '#F0B429', letterSpacing: '0.2em', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Productos
            </p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap', marginBottom: '32px' }}>
              <h2 style={{ fontFamily: 'var(--font-barlow-condensed, system-ui)', fontWeight: 800,
                fontSize: 'clamp(32px, 5vw, 56px)', color: '#FFFFFF', margin: 0,
                lineHeight: 1, letterSpacing: '-2px' }}>
                CATÁLOGO
              </h2>
              {!productsLoading && !productsError && products.length > 0 && (
                <StoreSearch products={products} />
              )}
            </div>
          </div>
        )}

        <div className="cat-layout" style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
          <Sidebar
            selected={selectedCategory}
            onSelect={setSelectedCategory}
            view={view}
            onViewChange={goToView}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            {view === 'catalogo' && (
              productsLoading ? (
                <ProductGridSkeleton count={8} />
              ) : productsError ? (
                <div style={{ padding: '80px 0', color: '#FF6B6B' }}>
                  <p style={{ margin: 0 }}>Error: {productsError}</p>
                </div>
              ) : (
                <ProductGrid products={filteredProducts} offersByVariant={offersByVariant} />
              )
            )}

            {view === 'ofertas' && (
              <OfertasSection offers={offers} loading={offersLoading} />
            )}

            {view === 'paquetes' && (
              <PaquetesSection packages={packages} loading={packagesLoading} />
            )}
          </div>
        </div>
      </section>
    </>
  )
}
