'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Customer } from '@/types'
import CustomerModal from './CustomerModal'
import AbonoModal from './AbonoModal'
import HistorialModal from './HistorialModal'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Avatar({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
      style={{ background: 'var(--accent)', color: '#000' }}>
      {letter}
    </div>
  )
}

function CreditBar({ balance, limit }: { balance: number; limit: number }) {
  if (limit <= 0) return null
  const pct   = Math.min(100, (balance / limit) * 100)
  const color = pct >= 80 ? '#FF6B6B' : pct >= 50 ? '#F0B429' : '#4CAF50'
  return (
    <div className="h-1 rounded-full overflow-hidden mt-1" style={{ background: 'var(--border)' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function ClientesPage() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'

  const [customers,  setCustomers]  = useState<Customer[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [search,     setSearch]     = useState('')
  const [filterDebt, setFilterDebt] = useState(false)

  // Modales
  const [editingCustomer,  setEditingCustomer]  = useState<Customer | 'new' | null>(null)
  const [abonoCustomer,    setAbonoCustomer]    = useState<Customer | null>(null)
  const [historialCustomer, setHistorialCustomer] = useState<Customer | null>(null)

  useEffect(() => { loadCustomers() }, [])

  async function loadCustomers() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: err } = await (supabase as any)
      .from('customers')
      .select('*')
      .order('full_name')

    if (err) { setError('Error cargando clientes. Toca para reintentar.'); setLoading(false); return }
    setCustomers((data ?? []) as Customer[])
    setLoading(false)
  }

  function handleSaved(customer: Customer, isNew: boolean) {
    if (isNew) {
      setCustomers(prev =>
        [...prev, customer].sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'))
      )
    } else {
      setCustomers(prev => prev.map(c => c.id === customer.id ? customer : c))
    }
    setEditingCustomer(null)
  }

  function handlePaid(customerId: string, newBalance: number) {
    setCustomers(prev =>
      prev.map(c => String(c.id) === customerId ? { ...c, credit_balance: newBalance } : c)
    )
    // Actualizar el customer en el modal de abono si sigue abierto
    setAbonoCustomer(prev =>
      prev && String(prev.id) === customerId ? { ...prev, credit_balance: newBalance } : prev
    )
  }

  const filtered = useMemo(() => {
    let list = customers
    if (filterDebt) list = list.filter(c => c.credit_balance > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c =>
        c.full_name.toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, search, filterDebt])

  const stats = useMemo(() => ({
    total:     customers.length,
    withDebt:  customers.filter(c => c.credit_balance > 0).length,
    totalDebt: customers.reduce((s, c) => s + c.credit_balance, 0),
  }), [customers])

  // ── Estados de carga ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center flex-col gap-3 h-full">
        <div className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Cargando clientes…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <button onClick={loadCustomers} className="px-6 py-3 rounded-lg text-sm font-semibold"
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

        {/* Título + botón nuevo */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Clientes</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {filtered.length} de {customers.length} clientes
            </p>
          </div>
          {isOwner && (
            <button
              onClick={() => setEditingCustomer('new')}
              className="px-3 py-2 rounded-lg text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#000' }}>
              + Nuevo cliente
            </button>
          )}
        </div>

        {/* Stats */}
        {customers.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Total clientes', value: String(stats.total), color: 'var(--text)' },
              { label: 'Con deuda', value: String(stats.withDebt), color: stats.withDebt > 0 ? '#F0B429' : 'var(--text-muted)' },
              { label: 'Pendiente', value: fmt(stats.totalDebt), color: stats.totalDebt > 0 ? '#FF6B6B' : 'var(--text-muted)' },
            ].map(s => (
              <div key={s.label} className="rounded-xl py-2.5 px-3 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <p className="text-base font-bold font-mono" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Búsqueda + filtro */}
        <div className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o correo…"
            className="flex-1 rounded-lg px-4 py-2 text-sm outline-none"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <button
            onClick={() => setFilterDebt(v => !v)}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: filterDebt ? 'var(--accent)' : 'var(--surface)',
              color: filterDebt ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)',
            }}>
            Con deuda
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-auto px-5 pb-5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {customers.length === 0
                ? 'No hay clientes registrados'
                : search ? `Sin resultados para "${search}"` : 'Sin clientes con deuda'}
            </p>
            {customers.length === 0 && isOwner && (
              <button onClick={() => setEditingCustomer('new')}
                className="text-xs px-3 py-1.5 rounded-lg font-semibold mt-1"
                style={{ background: 'var(--accent)', color: '#000' }}>
                Crear primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map(c => {
              const available = Math.max(0, c.credit_limit - c.credit_balance)
              return (
                <div key={c.id} className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

                  <Avatar name={c.full_name} />

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                      {c.full_name}
                    </p>
                    {c.phone && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.phone}</p>
                    )}

                    {/* Monedero */}
                    {c.loyalty_balance > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: '#F0B429' }}>
                        Monedero: {fmt(c.loyalty_balance)}
                      </p>
                    )}

                    {/* Crédito */}
                    {c.credit_limit > 0 && (
                      <div className="mt-1">
                        <div className="flex justify-between text-xs">
                          <span style={{ color: c.credit_balance > 0 ? '#FF6B6B' : 'var(--text-muted)' }}>
                            Deuda: {fmt(c.credit_balance)}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            Disp: {fmt(available)}
                          </span>
                        </div>
                        <CreditBar balance={c.credit_balance} limit={c.credit_limit} />
                      </div>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => setHistorialCustomer(c)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      Historial
                    </button>
                    {c.credit_balance > 0 && (
                      <button
                        onClick={() => setAbonoCustomer(c)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: '#0D2B0D', color: '#4CAF50', border: '1px solid #2D4A2D' }}>
                        Abonar
                      </button>
                    )}
                    {isOwner && (
                      <button
                        onClick={() => setEditingCustomer(c)}
                        className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modales */}
      {editingCustomer !== null && (
        <CustomerModal
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSaved={handleSaved}
        />
      )}
      {abonoCustomer && (
        <AbonoModal
          customer={abonoCustomer}
          onClose={() => setAbonoCustomer(null)}
          onPaid={handlePaid}
        />
      )}
      {historialCustomer && (
        <HistorialModal
          customer={historialCustomer}
          onClose={() => setHistorialCustomer(null)}
        />
      )}
    </div>
  )
}
