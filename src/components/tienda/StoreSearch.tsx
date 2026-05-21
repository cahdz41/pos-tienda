'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import type { StoreProduct } from '@/types'

interface Props {
  products: StoreProduct[]
}

// ── Normalización de texto ───────────────────────────────────────────────────
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Distancia de Levenshtein ─────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

// ── Scoring ──────────────────────────────────────────────────────────────────
function scoreProduct(product: StoreProduct, queryRaw: string): number {
  const query = normalize(queryRaw)
  const name = normalize(product.name)
  const category = normalize(product.category || '')
  if (!query || !name) return 0

  const qWords = query.split(' ').filter(w => w.length > 0)
  const nameWords = name.split(' ').filter(w => w.length > 0)
  const catWords = category.split(' ').filter(w => w.length > 0)

  let score = 0
  if (name === query) score += 200
  else if (name.includes(query)) score += 100

  for (const qw of qWords) {
    if (!qw) continue
    if (nameWords.includes(qw)) score += 50
    else if (name.includes(qw)) score += 35
    if (catWords.includes(qw)) score += 20
    else if (category.includes(qw)) score += 10
    for (const nw of nameWords) { if (nw.startsWith(qw)) score += 30 }
    for (const cw of catWords) { if (cw.startsWith(qw)) score += 15 }
    if (qw.length >= 3) {
      for (const nw of nameWords) {
        if (nw.length >= 3 && levenshtein(qw, nw) <= 1 && qw !== nw) score += 20
      }
    }
  }
  const allInName = qWords.every(qw => name.includes(qw))
  if (allInName) score += 25
  return score
}

// ── Highlight ────────────────────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>
  const qWords = normalize(query).split(' ').filter(w => w.length > 0).sort((a, b) => b.length - a.length)
  if (qWords.length === 0) return <>{text}</>
  const pattern = new RegExp(
    '(' + qWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')',
    'gi'
  )
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = qWords.some(qw => normalize(part) === qw)
        return isMatch ? (
          <mark key={i} style={{ background: 'rgba(200,20,20,0.35)', color: '#ff4040', fontWeight: 700, borderRadius: '3px', padding: '0 3px', textShadow: '0 0 8px rgba(200,20,20,0.5)' }}>
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}

// ── Componente ───────────────────────────────────────────────────────────────
export default function StoreSearch({ products }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const results = useMemo(() => {
    if (!query.trim()) return []
    return products
      .map(p => ({ product: p, score: scoreProduct(p, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(x => x.product)
  }, [query, products])

  useEffect(() => { setSelectedIndex(0) }, [results.length])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => (i + 1) % results.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + results.length) % results.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const product = results[selectedIndex]
        if (product) window.location.href = `/tienda/productos/${product.id}`
      } else if (e.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    },
    [open, results, selectedIndex]
  )

  const minPrice = (p: StoreProduct) => Math.min(...p.product_variants.map(v => v.sale_price))

  const isActive = focused || open

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', maxWidth: '520px' }}>
      {/* Efectos CSS */}
      <style>{`
        @keyframes searchGlow {
          0%, 100% { box-shadow: 0 0 18px rgba(200,20,20,0.45), 0 0 50px rgba(200,20,20,0.18), 0 0 90px rgba(200,20,20,0.06), inset 0 0 30px rgba(200,20,20,0.06); border-color: rgba(200,20,20,0.55); }
          50% { box-shadow: 0 0 36px rgba(200,20,20,0.85), 0 0 80px rgba(200,20,20,0.35), 0 0 140px rgba(200,20,20,0.12), inset 0 0 50px rgba(200,20,20,0.12); border-color: rgba(255,40,40,0.95); }
        }
        @keyframes searchFloat {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 0.6; }
          100% { transform: translateY(-60px) translateX(var(--dx, 10px)); opacity: 0; }
        }
        @keyframes searchPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        @keyframes lupaGlow {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(200,20,20,0.4)); }
          50% { filter: drop-shadow(0 0 8px rgba(200,20,20,0.9)); }
        }
      `}</style>

      {/* Input container */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          padding: '0 20px',
          height: '56px',
          background: 'linear-gradient(135deg, rgba(10,0,10,0.95) 0%, rgba(15,0,5,0.95) 100%)',
          border: `2px solid ${isActive ? 'rgba(200,20,20,0.7)' : 'rgba(200,20,20,0.25)'}`,
          borderRadius: '16px',
          transition: 'border-color 0.3s, box-shadow 0.3s',
          animation: isActive ? 'searchGlow 2.2s ease-in-out infinite' : 'none',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Partículas flotantes alrededor del input */}
        {isActive && (
          <>
            {[
              { left: '-6px', top: '80%', size: 2.5, delay: '0s', duration: '2.5s', dx: '-12px', color: '#ff2020' },
              { left: '15%', top: '-8px', size: 2, delay: '0.4s', duration: '3s', dx: '8px', color: '#cc2020' },
              { left: '45%', top: '-10px', size: 3, delay: '0.8s', duration: '2.8s', dx: '-6px', color: '#ff4040' },
              { left: '70%', top: '-6px', size: 2, delay: '1.2s', duration: '3.2s', dx: '10px', color: '#cc2020' },
              { left: '102%', top: '30%', size: 2.5, delay: '0.6s', duration: '2.6s', dx: '14px', color: '#ff2020' },
              { left: '102%', top: '65%', size: 2, delay: '1s', duration: '3s', dx: '-8px', color: '#cc2020' },
              { left: '30%', top: '105%', size: 2, delay: '1.4s', duration: '2.4s', dx: '-10px', color: '#ff3030' },
              { left: '60%', top: '108%', size: 2.5, delay: '0.2s', duration: '2.8s', dx: '12px', color: '#cc2020' },
              { left: '-4px', top: '30%', size: 2, delay: '1.6s', duration: '3s', dx: '-10px', color: '#ff2020' },
              { left: '85%', top: '105%', size: 2, delay: '0.9s', duration: '2.6s', dx: '6px', color: '#ff4040' },
              { left: '5%', top: '-10px', size: 1.8, delay: '1.1s', duration: '2.2s', dx: '-4px', color: '#cc2020' },
              { left: '95%', top: '-8px', size: 2.2, delay: '0.3s', duration: '2.9s', dx: '8px', color: '#ff2020' },
            ].map((p, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: p.left,
                  top: p.top,
                  width: `${p.size}px`,
                  height: `${p.size}px`,
                  borderRadius: '50%',
                  background: p.color,
                  boxShadow: `0 0 ${p.size * 3}px ${p.color}, 0 0 ${p.size * 6}px ${p.color}`,
                  pointerEvents: 'none',
                  zIndex: 70,
                  '--dx': p.dx,
                  animation: `searchFloat ${p.duration} ${p.delay} ease-in-out infinite`,
                } as React.CSSProperties}
              />
            ))}
          </>
        )}

        {/* Scanline decorativa */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, height: '1.5px',
          background: 'linear-gradient(90deg, transparent, rgba(200,20,20,0.45), rgba(200,20,20,0.25), transparent)',
          top: '50%',
          pointerEvents: 'none',
          opacity: isActive ? 0.8 : 0.25,
          transition: 'opacity 0.3s',
        }} />

        {/* Glow de fondo radial */}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: '80%',
          height: '120%',
          background: isActive
            ? 'radial-gradient(ellipse at center, rgba(200,20,20,0.08) 0%, transparent 70%)'
            : 'none',
          pointerEvents: 'none',
          transition: 'background 0.4s',
        }} />

        {/* Lupa */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke={isActive ? '#cc2020' : '#444444'}
          strokeWidth="2"
          strokeLinecap="round"
          style={{
            flexShrink: 0,
            animation: isActive ? 'lupaGlow 2s ease-in-out infinite' : 'none',
            transition: 'stroke 0.3s',
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            const val = e.target.value
            setQuery(val)
            if (debounceRef.current) clearTimeout(debounceRef.current)
            debounceRef.current = setTimeout(() => {
              setOpen(val.trim().length > 0)
            }, 120)
          }}
          onFocus={() => {
            setFocused(true)
            if (query.trim().length > 0) setOpen(true)
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Busca proteínas, creatinas, pre-entrenos..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#FFFFFF',
            fontSize: '15px',
            fontFamily: 'var(--font-dm-sans, system-ui)',
            caretColor: '#cc2020',
            letterSpacing: '0.02em',
          }}
        />

        {/* Placeholder decorativo cuando está vacío */}
        {!query && (
          <span style={{
            position: 'absolute',
            left: '54px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#333333',
            fontSize: '15px',
            fontFamily: 'var(--font-dm-sans, system-ui)',
            letterSpacing: '0.02em',
            pointerEvents: 'none',
            animation: 'searchPulse 3s ease-in-out infinite',
          }}>
            Busca proteínas, creatinas, pre-entrenos...
          </span>
        )}

        {/* Línea de energía decorativa abajo */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0, height: '1.5px',
          background: isActive
            ? 'linear-gradient(90deg, transparent, rgba(200,20,20,0.9) 20%, rgba(255,50,50,0.7) 50%, rgba(200,20,20,0.9) 80%, transparent)'
            : 'linear-gradient(90deg, transparent, rgba(200,20,20,0.2) 50%, transparent)',
          transition: 'background 0.3s',
          boxShadow: isActive ? '0 0 12px rgba(200,20,20,0.4)' : 'none',
        }} />

        {/* Clear button */}
        {query && (
          <button
            onClick={() => {
              setQuery('')
              setOpen(false)
              inputRef.current?.focus()
            }}
            style={{
              background: 'rgba(200,20,20,0.1)',
              border: '1px solid rgba(200,20,20,0.3)',
              borderRadius: '8px',
              color: '#cc2020',
              cursor: 'pointer',
              fontSize: '16px',
              lineHeight: 1,
              padding: '4px 8px',
              transition: 'background 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(200,20,20,0.2)'
              el.style.borderColor = 'rgba(200,20,20,0.6)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.background = 'rgba(200,20,20,0.1)'
              el.style.borderColor = 'rgba(200,20,20,0.3)'
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            right: 0,
            background: 'linear-gradient(180deg, rgba(10,0,10,0.98) 0%, rgba(8,0,5,0.98) 100%)',
            border: '1.5px solid rgba(200,20,20,0.35)',
            borderRadius: '16px',
            padding: '10px',
            zIndex: 60,
            boxShadow: '0 24px 80px rgba(0,0,0,0.9), 0 0 40px rgba(200,20,20,0.1)',
            maxHeight: '440px',
            overflowY: 'auto',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Scanlines del dropdown */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '16px',
            pointerEvents: 'none',
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
            zIndex: 1,
          }} />

          {results.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', position: 'relative', zIndex: 2 }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#555555', fontWeight: 600 }}>
                No se encontraron productos
              </p>
              <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#333333' }}>
                Intenta con “prote”, “whey”, “crea”, “pre”...
              </p>
            </div>
          ) : (
            results.map((product, index) => {
              const imageUrl = product.image_url ?? product.product_variants[0]?.image_url
              const isSelected = index === selectedIndex
              return (
                <Link
                  key={product.id}
                  href={`/tienda/productos/${product.id}`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    background: isSelected ? 'rgba(200,20,20,0.14)' : 'transparent',
                    border: isSelected ? '1px solid rgba(200,20,20,0.45)' : '1px solid transparent',
                    boxShadow: isSelected ? '0 0 20px rgba(200,20,20,0.15), inset 0 0 12px rgba(200,20,20,0.05)' : 'none',
                    transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s',
                    position: 'relative',
                    zIndex: 2,
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '10px',
                      background: '#0A0A0A',
                      flexShrink: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: isSelected ? '1px solid rgba(200,20,20,0.4)' : '1px solid #1A1A1A',
                      transition: 'border-color 0.12s',
                    }}
                  >
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={product.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        style={{
                          fontFamily: 'var(--font-syne, system-ui)',
                          fontWeight: 800,
                          fontSize: '20px',
                          color: '#2A2A2A',
                        }}
                      >
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        margin: 0,
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#FFFFFF',
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      <Highlight text={product.name} query={query} />
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                      {product.category && (
                        <span
                          style={{
                            fontSize: '11px',
                            color: isSelected ? 'rgba(200,20,20,0.8)' : '#444444',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            fontWeight: 600,
                            transition: 'color 0.12s',
                          }}
                        >
                          <Highlight text={product.category} query={query} />
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#F0B429',
                          fontFamily: 'var(--font-syne, system-ui)',
                        }}
                      >
                        ${minPrice(product).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Flecha */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isSelected ? '#cc2020' : '#2A2A2A'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    style={{
                      filter: isSelected ? 'drop-shadow(0 0 4px rgba(200,20,20,0.6))' : 'none',
                      transition: 'stroke 0.12s, filter 0.12s',
                    }}
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
