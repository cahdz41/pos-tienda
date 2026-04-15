'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useStoreAuth } from '@/contexts/StoreAuthContext'
import { getStoreSupabase } from '@/lib/supabase-store'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface OrderItem {
  id: string
  product_name: string
  flavor: string | null
  quantity: number
  unit_price: number
  subtotal: number
}

interface MyOrder {
  id: string
  status: string
  total: number
  notes: string | null
  created_at: string
  store_order_items: OrderItem[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending:   'Pendiente',
  confirmed: 'Confirmado',
  ready:     'Listo para entregar',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  pending:   { bg: '#2B1F00', color: '#F0B429', border: '#4D3800' },
  confirmed: { bg: '#001B3D', color: '#4A9EFF', border: '#003070' },
  ready:     { bg: '#0D2B0D', color: '#4CAF50', border: '#1A4D1A' },
  delivered: { bg: '#0A1F0A', color: '#2E7D32', border: '#144A14' },
  cancelled: { bg: '#2D1010', color: '#FF6B6B', border: '#4D1A1A' },
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente ───────────────────────────────────────────────────────────────

export default function MisPedidosPage() {
  const { customer, signOut } = useStoreAuth()
  const [orders, setOrders]   = useState<MyOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    const supabase = getStoreSupabase()
    const { data, error: queryError } = await supabase
      .from('store_orders')
      .select(`id, status, total, notes, created_at,
        store_order_items (id, product_name, flavor, quantity, unit_price, subtotal)`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (queryError) {
      setError(queryError.message)
    } else {
      setOrders((data as MyOrder[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  return (
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '40px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <Link href="/tienda" style={{ fontSize: '13px', color: '#444444', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>
            ← Catálogo
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-syne, system-ui)', fontWeight: 800,
            fontSize: 'clamp(24px, 4vw, 36px)', color: '#FFFFFF',
            margin: '0 0 6px', letterSpacing: '-0.5px',
          }}>
            Mis pedidos
          </h1>
          {customer && (
            <p style={{ margin: 0, fontSize: '13px', color: '#555555' }}>
              Hola, <strong style={{ color: '#AAAAAA' }}>{customer.full_name}</strong>
            </p>
          )}
        </div>
        <button
          onClick={signOut}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid #2A2A2A',
            borderRadius: '10px',
            color: '#555555', fontSize: '12px', cursor: 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = '#FF6666'
            e.currentTarget.style.borderColor = '#FF6666'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = '#555555'
            e.currentTarget.style.borderColor = '#2A2A2A'
          }}
        >
          Cerrar sesión
        </button>
      </div>

      {/* Estados */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#444444', fontSize: '14px' }}>
          <div style={{
            width: '16px', height: '16px', borderRadius: '50%',
            border: '2px solid #F0B429', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite', flexShrink: 0,
          }} />
          Cargando pedidos…
        </div>
      )}

      {!loading && error && (
        <p style={{
          fontSize: '13px', color: '#FF6666',
          padding: '14px 16px',
          background: 'rgba(255,102,102,0.07)',
          border: '1px solid rgba(255,102,102,0.15)',
          borderRadius: '12px',
        }}>
          {error} —{' '}
          <button onClick={loadOrders} style={{ background: 'none', border: 'none', color: '#FF6666', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>
            Reintentar
          </button>
        </p>
      )}

      {!loading && !error && orders.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <p style={{ fontSize: '32px', margin: '0 0 12px' }}>📦</p>
          <p style={{ color: '#444444', fontSize: '14px', margin: '0 0 20px' }}>
            Aún no tienes pedidos registrados
          </p>
          <Link href="/tienda" style={{
            display: 'inline-block', padding: '12px 24px',
            background: '#F0B429', borderRadius: '12px',
            color: '#000000', fontWeight: 700, fontSize: '14px',
            textDecoration: 'none',
            fontFamily: 'var(--font-syne, system-ui)',
          }}>
            Explorar catálogo →
          </Link>
        </div>
      )}

      {/* Lista de pedidos */}
      {!loading && !error && orders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {orders.map(order => {
            const sc = STATUS_COLORS[order.status] ?? STATUS_COLORS.pending
            return (
              <div key={order.id} style={{
                background: '#111111',
                border: '1px solid #1A1A1A',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '14px',
              }}>
                {/* Fila superior */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#444444', fontFamily: 'monospace' }}>
                    #{order.id.slice(0, 8).toUpperCase()} · {formatDate(order.created_at)}
                  </span>
                  <span style={{
                    padding: '4px 10px', borderRadius: '8px',
                    fontSize: '11px', fontWeight: 700,
                    background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                  }}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </div>

                {/* Artículos */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {order.store_order_items.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <span style={{ fontSize: '13px', color: '#BBBBBB' }}>
                        {item.quantity}× {item.product_name}
                        {item.flavor && <span style={{ color: '#555555' }}> ({item.flavor})</span>}
                      </span>
                      <span style={{ fontSize: '13px', color: '#666666', flexShrink: 0 }}>
                        ${item.subtotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Notas */}
                {order.notes && (
                  <p style={{
                    margin: 0, fontSize: '12px', color: '#555555',
                    padding: '10px 12px',
                    background: '#0A0A0A', border: '1px solid #1A1A1A',
                    borderRadius: '8px', fontStyle: 'italic',
                  }}>
                    "{order.notes}"
                  </p>
                )}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #1A1A1A', paddingTop: '14px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: '0 0 2px', fontSize: '10px', color: '#444444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</p>
                    <span style={{
                      fontFamily: 'var(--font-syne, system-ui)',
                      fontWeight: 800, fontSize: '20px', color: '#F0B429',
                    }}>
                      ${order.total.toFixed(2)} MXN
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
