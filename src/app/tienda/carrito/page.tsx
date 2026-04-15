'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useStoreCart } from '@/contexts/StoreCartContext'
import type { StoreCartItem } from '@/contexts/StoreCartContext'
import { openWhatsApp } from '@/lib/whatsapp'

const WA_NUMBER = process.env.NEXT_PUBLIC_STORE_WHATSAPP ?? ''

function buildWhatsAppMessage(
  name: string,
  phone: string,
  notes: string,
  items: StoreCartItem[],
  total: number,
): string {
  const lines: string[] = [
    'Hola! Quiero confirmar mi pedido:',
    '',
    `Nombre: ${name}`,
    `Tel: ${phone}`,
    '',
    'Artículos:',
    ...items.map(i =>
      `• ${i.quantity}x ${i.productName}${i.flavor ? ` (${i.flavor})` : ''} — $${(i.price * i.quantity).toFixed(2)}`
    ),
    '',
    `Total: $${total.toFixed(2)} MXN`,
  ]
  if (notes.trim()) {
    lines.push('', `Notas: ${notes.trim()}`)
  }
  return lines.join('\n')
}

export default function CarritoPage() {
  const { items, total, clearCart } = useStoreCart()
  const [mounted, setMounted] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  if (items.length === 0) {
    return (
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#2A2A2A" strokeWidth="1.5" style={{ marginBottom: '20px' }}>
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61H19a2 2 0 001.98-1.61L23 6H6"/>
        </svg>
        <h1 style={{
          fontFamily: 'var(--font-syne, system-ui)', fontWeight: 800,
          fontSize: '28px', color: '#FFFFFF', margin: '0 0 16px', letterSpacing: '-0.5px',
        }}>
          Tu carrito está vacío
        </h1>
        <Link href="/tienda" style={{ fontSize: '14px', color: '#F0B429', textDecoration: 'none' }}>
          ← Volver al catálogo
        </Link>
      </main>
    )
  }

  function openModal() { setShowModal(true); setError(null) }
  function closeModal() {
    if (loading) return
    setShowModal(false)
    setName(''); setPhone(''); setNotes(''); setError(null)
  }

  async function handleConfirm() {
    if (!name.trim() || !phone.trim()) {
      setError('Por favor completa tu nombre y WhatsApp.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/store/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name.trim(),
          customer_phone: phone.trim(),
          notes: notes.trim() || null,
          items,
          total,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar el pedido')

      clearCart()
      setShowModal(false)
      const message = buildWhatsAppMessage(name.trim(), phone.trim(), notes, items, total)
      openWhatsApp(WA_NUMBER, message)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    background: '#0A0A0A',
    border: '1px solid #2A2A2A',
    borderRadius: '12px',
    color: '#FFFFFF',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  }

  return (
    <>
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '40px' }}>
        <Link href="/tienda" style={{ fontSize: '13px', color: '#444444', textDecoration: 'none' }}>
          ← Catálogo
        </Link>
      </div>

      <h1 style={{
        fontFamily: 'var(--font-syne, system-ui)', fontWeight: 800,
        fontSize: 'clamp(28px, 4vw, 48px)', color: '#FFFFFF',
        margin: '0 0 40px', letterSpacing: '-1px', lineHeight: 1.05,
      }}>
        Tu Pedido
      </h1>

      {/* ── Resumen de artículos ── */}
      <div style={{ maxWidth: '560px' }}>
        <p style={{
          fontSize: '11px', color: '#555555',
          textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px',
        }}>
          Artículos ({items.reduce((s, i) => s + i.quantity, 0)})
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {items.map(item => (
            <div key={item.variantId} style={{
              display: 'flex', gap: '16px', padding: '16px',
              background: '#111111', border: '1px solid #1A1A1A',
              borderRadius: '12px', alignItems: 'center',
            }}>
              <div style={{
                width: '56px', height: '56px', background: '#1A1A1A',
                borderRadius: '8px', flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.productName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{
                    fontFamily: 'var(--font-syne, system-ui)',
                    fontWeight: 800, fontSize: '22px', color: '#2A2A2A',
                  }}>
                    {item.productName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: 0, fontSize: '14px', color: '#FFFFFF', fontWeight: 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.productName}
                </p>
                {item.flavor && (
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#555555' }}>{item.flavor}</p>
                )}
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666666' }}>
                  {item.quantity} × ${item.price.toFixed(2)}
                </p>
              </div>
              <span style={{
                fontFamily: 'var(--font-syne, system-ui)',
                fontWeight: 700, fontSize: '16px', color: '#F0B429', flexShrink: 0,
              }}>
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Total + botón principal */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: '20px', padding: '20px 24px',
          background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: '12px',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '11px', color: '#555555', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
              <span style={{ fontFamily: 'var(--font-syne, system-ui)', fontWeight: 800, fontSize: '30px', color: '#F0B429' }}>
                ${total.toFixed(2)}
              </span>
              <span style={{ fontSize: '13px', color: '#444444' }}>MXN</span>
            </div>
          </div>
          <button onClick={openModal} style={{
            padding: '14px 28px',
            background: '#F0B429', border: 'none', borderRadius: '12px',
            color: '#000000', fontSize: '15px', fontWeight: 800,
            fontFamily: 'var(--font-syne, system-ui)',
            cursor: 'pointer', letterSpacing: '0.02em',
            transition: 'opacity 0.2s',
          }}>
            Hacer pedido →
          </button>
        </div>
      </div>
    </main>

    {/* ── Modal de checkout ── */}
    {showModal && (
      <div
        onClick={e => { if (e.target === e.currentTarget) closeModal() }}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{
          width: '100%', maxWidth: '440px',
          background: '#111111',
          border: '1px solid #222222',
          borderRadius: '24px',
          padding: '36px 32px',
          position: 'relative',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
        }}>

          {/* Cerrar */}
          <button onClick={closeModal} disabled={loading} style={{
            position: 'absolute', top: '20px', right: '20px',
            width: '32px', height: '32px', borderRadius: '50%',
            background: '#1A1A1A', border: '1px solid #2A2A2A',
            color: '#666666', fontSize: '16px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1,
          }}>
            ×
          </button>

          {/* Ícono WhatsApp */}
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px',
            background: '#0D1F10', border: '1px solid #1A3A1E',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '20px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>

          {/* Títulos */}
          <h2 style={{
            fontFamily: 'var(--font-syne, system-ui)', fontWeight: 800,
            fontSize: '24px', color: '#FFFFFF', margin: '0 0 14px',
            letterSpacing: '-0.5px', lineHeight: 1.1,
          }}>
            Confirma tu pedido
          </h2>

          {/* Callout */}
          <div style={{
            marginBottom: '24px', padding: '14px 16px',
            background: 'rgba(37,211,102,0.07)',
            border: '1px solid rgba(37,211,102,0.18)',
            borderRadius: '12px',
            display: 'flex', gap: '12px', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '18px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>💬</span>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: '14px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
                Sin pagos en línea, sin complicaciones
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#25D366', lineHeight: 1.5 }}>
                Te enviamos las formas de pago disponibles directo a tu WhatsApp.
              </p>
            </div>
          </div>

          {/* Resumen compacto */}
          <div style={{
            padding: '12px 16px', borderRadius: '10px',
            background: '#0A0A0A', border: '1px solid #1A1A1A',
            marginBottom: '24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '13px', color: '#555555' }}>
              {items.reduce((s, i) => s + i.quantity, 0)} artículo{items.reduce((s, i) => s + i.quantity, 0) !== 1 ? 's' : ''}
            </span>
            <span style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 800, fontSize: '18px', color: '#F0B429',
            }}>
              ${total.toFixed(2)} MXN
            </span>
          </div>

          {/* Campos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{
                display: 'block', fontSize: '11px', color: '#555555',
                marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                Nombre completo *
              </label>
              <input
                type="text" value={name}
                onChange={e => setName(e.target.value)}
                placeholder="¿Cómo te llamamos?"
                autoFocus
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#F0B429')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2A2A2A')}
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: '11px', color: '#555555',
                marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                WhatsApp *
              </label>
              <input
                type="tel" value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Tu número de WhatsApp"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = '#F0B429')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2A2A2A')}
              />
            </div>

            <div>
              <label style={{
                display: 'block', fontSize: '11px', color: '#555555',
                marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                Indicaciones <span style={{ color: '#333333', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Dirección, horario preferido, alguna indicación especial…"
                rows={3}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => (e.currentTarget.style.borderColor = '#F0B429')}
                onBlur={e => (e.currentTarget.style.borderColor = '#2A2A2A')}
              />
            </div>
          </div>

          {error && (
            <p style={{
              margin: '16px 0 0', fontSize: '13px', color: '#FF6666',
              padding: '12px 14px',
              background: 'rgba(255,102,102,0.07)',
              border: '1px solid rgba(255,102,102,0.15)',
              borderRadius: '10px',
            }}>
              {error}
            </p>
          )}

          {/* CTA */}
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              marginTop: '24px', width: '100%', padding: '17px',
              background: loading ? '#1A1A1A' : '#25D366',
              border: 'none', borderRadius: '14px',
              color: loading ? '#444444' : '#FFFFFF',
              fontSize: '16px', fontWeight: 700,
              fontFamily: 'var(--font-syne, system-ui)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              transition: 'opacity 0.2s',
              boxSizing: 'border-box',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? (
              <>
                <div style={{
                  width: '16px', height: '16px', border: '2px solid #666',
                  borderTopColor: '#fff', borderRadius: '50',
                  animation: 'spin 0.8s linear infinite',
                }} />
                Procesando…
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Confirmar por WhatsApp
              </>
            )}
          </button>

          <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#333333', textAlign: 'center', lineHeight: 1.5 }}>
            Al confirmar, recibirás un mensaje con las opciones de pago disponibles
          </p>
        </div>
      </div>
    )}
    </>
  )
}
