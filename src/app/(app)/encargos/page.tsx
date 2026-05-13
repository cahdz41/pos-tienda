'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SpecialOrder, SpecialOrderWithCustomer, Customer } from '@/types'
import VoiceSearchButton from '@/components/VoiceSearchButton'
import OrderModal from './OrderModal'
import { printOrderTicket, type OrderTicketData } from './OrderTicket'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function TypeBadge({ type }: { type: SpecialOrder['type'] }) {
    const isOrder = type === 'order'
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs font-bold"
        style={{
          background: isOrder ? '#1A1A3D' : '#1A2B1A',
          color: isOrder ? '#A0A0FF' : '#8BC48B',
          border: `1px solid ${isOrder ? '#2A2A5A' : '#2D4A2D'}`,
        }}
      >
        {isOrder ? '📋 Encargo' : '🚚 Envío'}
      </span>
    )
  }

export default function EncargosPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [orders, setOrders] = useState<SpecialOrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'order' | 'delivery'>('all')

  // Modales
  const [editingOrder, setEditingOrder] = useState<SpecialOrder | 'new' | null>(null)

  useEffect(() => { loadOrders() }, [])

  async function loadOrders() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data, error: err } = await (supabase as any)
      .from('special_orders')
      .select('*, customers(*), product_variants(*, products(*))')
      .order('created_at', { ascending: false })

    if (err) {
      setError('Error cargando encargos. Toca para reintentar.')
      setLoading(false)
      return
    }

    const mapped = ((data ?? []) as any[]).map((row: any) => {
      const customerRaw = row.customers ?? {}
      const customer: Customer = {
        id: String(customerRaw.id),
        full_name: String(customerRaw.full_name ?? 'Sin nombre'),
        phone: customerRaw.phone ? String(customerRaw.phone) : null,
        email: customerRaw.email ? String(customerRaw.email) : null,
        address: customerRaw.address ? String(customerRaw.address) : null,
        credit_limit: Number(customerRaw.credit_limit ?? 0),
        credit_balance: Number(customerRaw.credit_balance ?? 0),
        loyalty_balance: Number(customerRaw.loyalty_balance ?? 0),
        loyalty_spent: Number(customerRaw.loyalty_spent ?? 0),
        notes: customerRaw.notes ? String(customerRaw.notes) : null,
      }
      const order: SpecialOrderWithCustomer = {
        id: String(row.id),
        customer_id: String(row.customer_id),
        product_id: row.product_id ? String(row.product_id) : null,
        product_name: row.product_name
          ? String(row.product_name)
          : row.product_variants?.products?.name
            ? `${String(row.product_variants.products.name)}${row.product_variants.flavor ? ` — ${String(row.product_variants.flavor)}` : ''}`
            : null,
        sale_price: Number(row.sale_price ?? 0),
        estimated_delivery_date: row.estimated_delivery_date ? String(row.estimated_delivery_date) : null,
        deposit: Number(row.deposit ?? 0),
        status: row.status === 'completed' ? 'completed' : 'pending',
        type: row.type === 'delivery' ? 'delivery' : 'order',
        notes: row.notes ? String(row.notes) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        customer,
      }
      return order
    })

    setOrders(mapped)
    setLoading(false)
  }

  function handleSaved(order: SpecialOrder, isNew: boolean) {
    // Recargar para tener el customer actualizado
    loadOrders()
    setEditingOrder(null)
  }

  async function toggleStatus(order: SpecialOrderWithCustomer) {
    const newStatus = order.status === 'pending' ? 'completed' : 'pending'
    const supabase = createClient()
    const { error: err } = await (supabase as any)
      .from('special_orders')
      .update({ status: newStatus })
      .eq('id', order.id)

    if (err) {
      alert('Error al cambiar el estado: ' + err.message)
      return
    }

    setOrders(prev =>
      prev.map(o => o.id === order.id ? { ...o, status: newStatus } : o)
    )
  }

  function handlePrint(order: SpecialOrderWithCustomer) {
    const productName = order.product_name
      ? order.product_name
      : 'Producto no especificado'

    const data: OrderTicketData = {
      customerName: order.customer.full_name,
      productName,
      salePrice: order.sale_price,
      deposit: order.deposit,
      notes: order.notes ?? undefined,
      date: new Date(order.created_at),
    }
    printOrderTicket(data)
  }

  async function handleDelete(order: SpecialOrderWithCustomer) {
    const confirmed = window.confirm(
      `¿Eliminar el registro de "${order.customer.full_name}" por "${order.product_name ?? 'Producto'}"?\n\nEsta acción no se puede deshacer.`
    )
    if (!confirmed) return

    const supabase = createClient()
    const { error: err } = await (supabase as any)
      .from('special_orders')
      .delete()
      .eq('id', order.id)

    if (err) {
      alert('Error al eliminar: ' + err.message)
      return
    }

    setOrders(prev => prev.filter(o => o.id !== order.id))
  }

  const filtered = useMemo(() => {
    let list = orders
    if (statusFilter !== 'all') {
      list = list.filter(o => o.status === statusFilter)
    }
    if (typeFilter !== 'all') {
      list = list.filter(o => o.type === typeFilter)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        o.customer.full_name.toLowerCase().includes(q) ||
        (o.product_name ?? '').toLowerCase().includes(q) ||
        (o.customer.phone ?? '').includes(q)
      )
    }
    return list
  }, [orders, search, statusFilter, typeFilter])

  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    deliveries: orders.filter(o => o.type === 'delivery').length,
    totalDeposits: orders.reduce((s, o) => s + o.deposit, 0),
  }), [orders])

  // ── Estados de carga ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-col gap-3 h-full">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando encargos…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={loadOrders} className="px-6 py-3 rounded-lg text-sm font-semibold"
          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
          {error}
        </button>
      </div>
    )
  }

  // ── Render principal ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Encargos</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} de {orders.length} encargos
            </p>
          </div>
          <button
            onClick={() => setEditingOrder('new')}
            className="px-3 py-2 rounded-lg text-xs font-bold"
            style={{ background: 'var(--accent)', color: '#000' }}>
            + Nuevo encargo
          </button>
        </div>

        {/* Stats */}
        {orders.length > 0 && (
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { label: 'Total', value: String(stats.total), color: 'var(--text)' },
              { label: 'Pendientes', value: String(stats.pending), color: stats.pending > 0 ? '#F0B429' : 'var(--text-muted)' },
              { label: 'Envíos', value: String(stats.deliveries), color: stats.deliveries > 0 ? '#8BC48B' : 'var(--text-muted)' },
              { label: 'Anticipos', value: fmt(stats.totalDeposits), color: stats.totalDeposits > 0 ? '#4CAF50' : 'var(--text-muted)' },
            ].map(s => (
              <div key={s.label} className="rounded-xl py-2.5 px-2 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Búsqueda + filtros */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por cliente o producto…"
              className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <VoiceSearchButton onResult={setSearch} />
          </div>
          <div className="flex gap-2">
            {/* Filtro por tipo */}
            <button
              onClick={() => setTypeFilter(v => v === 'order' ? 'all' : 'order')}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: typeFilter === 'order' ? 'var(--accent)' : 'var(--surface)',
                color: typeFilter === 'order' ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              📋 Encargos
            </button>
            <button
              onClick={() => setTypeFilter(v => v === 'delivery' ? 'all' : 'delivery')}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: typeFilter === 'delivery' ? '#8BC48B' : 'var(--surface)',
                color: typeFilter === 'delivery' ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              🚚 Envíos
            </button>
            <div className="w-px mx-1" style={{ background: 'var(--border)' }} />
            {/* Filtro por status */}
            <button
              onClick={() => setStatusFilter(v => v === 'pending' ? 'all' : 'pending')}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: statusFilter === 'pending' ? '#FF6B6B' : 'var(--surface)',
                color: statusFilter === 'pending' ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              Pendientes
            </button>
            <button
              onClick={() => setStatusFilter(v => v === 'completed' ? 'all' : 'completed')}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: statusFilter === 'completed' ? '#4CAF50' : 'var(--surface)',
                color: statusFilter === 'completed' ? '#000' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>
              Completados
            </button>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {(() => {
                if (orders.length === 0) return 'No hay encargos registrados'
                if (search || statusFilter !== 'all' || typeFilter !== 'all') return 'Sin resultados con los filtros actuales'
                return 'Sin encargos'
              })()}
            </p>
            {orders.length === 0 && (
              <button onClick={() => setEditingOrder('new')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold mt-1"
                style={{ background: 'var(--accent)', color: '#000' }}>
                Crear primer encargo
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Header de tabla */}
            <div className="grid text-xs font-semibold px-4 py-2 sticky top-0"
              style={{
                gridTemplateColumns: 'minmax(140px,1fr) minmax(120px,1.2fr) 100px 90px 90px 90px 100px 110px 100px',
                color: 'var(--text-muted)', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
              }}>
              <span>Cliente</span>
              <span>Producto</span>
              <span>Tipo</span>
              <span className="text-right">Precio</span>
              <span className="text-right">Anticipo</span>
              <span className="text-right">Restante</span>
              <span className="text-center">Entrega</span>
              <span className="text-center">Estado</span>
              <span className="text-right">Acciones</span>
            </div>

            {filtered.map(o => {
              const remaining = Math.max(0, o.sale_price - o.deposit)
              const deliveryStr = o.estimated_delivery_date
                ? new Date(o.estimated_delivery_date + 'T00:00:00').toLocaleDateString('es-MX', {
                    day: '2-digit', month: '2-digit'
                  })
                : '—'

              const isOverdue = o.estimated_delivery_date && o.status === 'pending'
                ? new Date(o.estimated_delivery_date + 'T00:00:00') < new Date(new Date().toDateString())
                : false

              return (
                <div key={o.id}
                  className="grid items-center px-4 py-2.5 text-xs transition-colors"
                  style={{
                    gridTemplateColumns: 'minmax(140px,1fr) minmax(120px,1.2fr) 100px 90px 90px 90px 100px 110px 100px',
                    borderBottom: '1px solid var(--border)',
                    background: isOverdue ? 'rgba(255,107,107,0.06)' : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isOverdue ? 'rgba(255,107,107,0.06)' : 'transparent' }}
                >
                  {/* Cliente */}
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold truncate" style={{ color: 'var(--text)' }}>{o.customer.full_name}</p>
                    {o.customer.phone && (
                      <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{o.customer.phone}</p>
                    )}
                  </div>

                  {/* Producto */}
                  <div className="min-w-0 pr-2">
                    <p className="truncate" style={{ color: 'var(--text)' }}>
                      {o.product_name ?? 'Producto registrado'}
                    </p>
                  </div>

                  {/* Tipo */}
                  <div>
                    <TypeBadge type={o.type} />
                  </div>

                  {/* Precio */}
                  <span className="font-mono font-bold text-right pr-2" style={{ color: 'var(--accent)' }}>
                    {fmt(o.sale_price)}
                  </span>

                  {/* Anticipo */}
                  <span className="font-mono font-bold text-right pr-2" style={{ color: '#4CAF50' }}>
                    {fmt(o.deposit)}
                  </span>

                  {/* Restante */}
                  <span className="font-mono font-bold text-right pr-2" style={{ color: remaining > 0 ? 'var(--text)' : '#4CAF50' }}>
                    {remaining > 0 ? fmt(remaining) : '—'}
                  </span>

                  {/* Entrega */}
                  <span className="text-center" style={{ color: isOverdue ? '#FF6B6B' : 'var(--text-muted)' }}>
                    {deliveryStr}{isOverdue ? ' ⚠' : ''}
                  </span>

                  {/* Estado (badge clickeable) */}
                  <div className="text-center">
                    <button
                      onClick={() => toggleStatus(o)}
                      className="px-2 py-0.5 rounded-full text-xs font-bold transition-opacity hover:opacity-80"
                      style={{
                        background: o.status === 'pending' ? '#4D1010' : '#0D2B0D',
                        color: o.status === 'pending' ? '#FF6B6B' : '#4CAF50',
                        border: `1px solid ${o.status === 'pending' ? '#7A2020' : '#2D4A2D'}`,
                        cursor: 'pointer',
                      }}
                      title={o.status === 'pending' ? 'Click para marcar como completado' : 'Click para marcar como pendiente'}
                    >
                      {o.status === 'pending' ? 'Pendiente' : '✓ Completado'}
                    </button>
                  </div>

                  {/* Acciones */}
                  <div className="flex justify-end gap-1.5">
                    {o.type === 'order' && (
                      <button
                        onClick={() => handlePrint(o)}
                        className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        title="Imprimir ticket"
                      >
                        🖨️
                      </button>
                    )}
                    {(isOwner || o.status === 'pending') && (
                      <button
                        onClick={() => setEditingOrder(o)}
                        className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    )}
                    {(isOwner || o.status === 'pending') && (
                      <button
                        onClick={() => handleDelete(o)}
                        className="px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                        style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Modal */}
      {editingOrder !== null && (
        <OrderModal
          key={editingOrder === 'new' ? 'new' : editingOrder.id}
          order={editingOrder}
          onClose={() => setEditingOrder(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
