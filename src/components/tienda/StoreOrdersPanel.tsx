'use client'

import { useState, useEffect, useCallback } from 'react'
import type { StoreOrder, StoreOrderStatus } from '@/types'
import { openWhatsApp } from '@/lib/whatsapp'

// ── Configuración de estados ─────────────────────────────────────────────────

const STATUS_LABELS: Record<StoreOrderStatus, string> = {
  pending:   'Pendiente',
  confirmed: 'Confirmado',
  ready:     'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}

const STATUS_COLORS: Record<StoreOrderStatus, { bg: string; color: string; border: string }> = {
  pending:   { bg: '#2B1F00', color: '#F0B429', border: '#4D3800' },
  confirmed: { bg: '#001B3D', color: '#4A9EFF', border: '#003070' },
  ready:     { bg: '#0D2B0D', color: '#4CAF50', border: '#1A4D1A' },
  delivered: { bg: '#0A1F0A', color: '#2E7D32', border: '#144A14' },
  cancelled: { bg: '#2D1010', color: '#FF6B6B', border: '#4D1A1A' },
}

const FILTERS: { key: string; label: string }[] = [
  { key: 'all',       label: 'Todos' },
  { key: 'pending',   label: 'Pendientes' },
  { key: 'confirmed', label: 'Confirmados' },
  { key: 'ready',     label: 'Listos' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

function itemsSummary(items: StoreOrder['store_order_items']) {
  return items
    .map(i => `${i.quantity}x ${i.product_name}${i.flavor ? ` (${i.flavor})` : ''}`)
    .join(', ')
}

function contactCustomer(phone: string, name: string, summary: string) {
  openWhatsApp(phone, `Hola ${name}, te contactamos por tu pedido:\n${summary}`)
}

// ── Componente ───────────────────────────────────────────────────────────────

export function StoreOrdersPanel() {
  const [orders, setOrders]       = useState<StoreOrder[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState('all')
  const [updating, setUpdating]   = useState<string | null>(null) // orderId en proceso

  const loadOrders = useCallback(async (status = filter) => {
    setLoading(true)
    setError(null)
    try {
      const url = status === 'all' ? '/api/store/orders' : `/api/store/orders?status=${status}`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setOrders(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar pedidos')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { loadOrders(filter) }, [filter]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleStatusChange(orderId: string, newStatus: StoreOrderStatus) {
    setUpdating(orderId)
    // Actualización optimista
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
    try {
      const res = await fetch(`/api/store/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      // Si el filtro activo ya no incluye este status, refrescar la lista
      if (filter !== 'all' && filter !== newStatus) {
        setOrders(prev => prev.filter(o => o.id !== orderId))
      }
    } catch {
      // Revertir si falla
      loadOrders(filter)
    } finally {
      setUpdating(null)
    }
  }

  const st = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="flex flex-col gap-4">

      {/* Filtros + botón recargar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
              style={{
                background: filter === f.key ? 'var(--accent)' : 'var(--bg)',
                color:      filter === f.key ? '#000' : 'var(--text-muted)',
                border:     `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => loadOrders(filter)}
          disabled={loading}
          className="px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-40"
          style={st}>
          {loading ? '…' : '↻ Recargar'}
        </button>
      </div>

      {/* Error no fatal */}
      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error} — <button onClick={() => loadOrders(filter)} className="underline">Reintentar</button>
        </p>
      )}

      {/* Loading */}
      {loading && !error && (
        <div className="flex items-center gap-2 py-2">
          <div className="w-4 h-4 rounded-full border-2 animate-spin"
            style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando pedidos…</span>
        </div>
      )}

      {/* Vacío */}
      {!loading && !error && orders.length === 0 && (
        <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
          No hay pedidos{filter !== 'all' ? ` con estado "${STATUS_LABELS[filter as StoreOrderStatus]}"` : ''}.
        </p>
      )}

      {/* Lista de órdenes */}
      {!loading && orders.map(order => {
        const sc = STATUS_COLORS[order.status]
        const summary = itemsSummary(order.store_order_items)
        const isUpdating = updating === order.id

        return (
          <div key={order.id}
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', opacity: isUpdating ? 0.6 : 1 }}>

            {/* Fila superior: fecha + total */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                #{order.id.slice(0, 8).toUpperCase()} · {formatDate(order.created_at)}
              </span>
              <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                ${order.total.toFixed(2)}
              </span>
            </div>

            {/* Cliente + WhatsApp */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{order.customer_name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{order.customer_phone}</p>
              </div>
              <button
                onClick={() => contactCustomer(order.customer_phone, order.customer_name, summary)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: '#0D2B0D', color: '#4CAF50', border: '1px solid #1A4D1A', cursor: 'pointer' }}>
                <span>📱</span> WhatsApp
              </button>
            </div>

            {/* Artículos */}
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {summary || '—'}
            </p>

            {/* Notas */}
            {order.notes && (
              <p className="text-xs px-2 py-1.5 rounded-lg italic"
                style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                "{order.notes}"
              </p>
            )}

            {/* Estado */}
            <div className="flex items-center justify-between gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
                style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                {STATUS_LABELS[order.status]}
              </span>
              <select
                value={order.status}
                disabled={isUpdating}
                onChange={e => handleStatusChange(order.id, e.target.value as StoreOrderStatus)}
                className="rounded-lg px-2 py-1.5 text-xs font-semibold outline-none cursor-pointer"
                style={st}>
                {(Object.keys(STATUS_LABELS) as StoreOrderStatus[]).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

          </div>
        )
      })}
    </div>
  )
}
