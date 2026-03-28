'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchFocus } from '@/hooks/useSearchFocus'
import { createClient } from '@/lib/supabase/client'
import type { Customer, LoyaltyTransaction } from '@/types'

const fmt = (n: number) => `$${Number(n).toFixed(2)}`
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ─── Confirm Modal ─── */
function ConfirmModal({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel])
  return (
    <div className="overlay">
      <div className="modal-box modal-box--sm">
        <p className="confirm-msg">{message}</p>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button className="btn-danger" onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Customer Form Modal ─── */
interface CustomerFormProps {
  customer?: Customer
  onSaved: (msg: string) => void
  onClose: () => void
}

function CustomerFormModal({ customer, onSaved, onClose }: CustomerFormProps) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    whatsapp: customer?.whatsapp ?? '',
    phone: customer?.phone ?? '',
    email: customer?.email ?? '',
    address: customer?.address ?? '',
    notes: customer?.notes ?? '',
    enableCredit: (customer?.credit_limit ?? 0) > 0,
    credit_limit: customer?.credit_limit ? String(customer.credit_limit) : '',
  })
  const [waExists, setWaExists] = useState(false)
  const [waChecking, setWaChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])

  // Real-time WhatsApp duplicate check
  useEffect(() => {
    const wa = form.whatsapp.trim()
    if (!wa || (customer?.whatsapp === wa)) { setWaExists(false); return }
    setWaChecking(true)
    const t = setTimeout(async () => {
      const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('whatsapp', wa)
      setWaExists((count ?? 0) > 0)
      setWaChecking(false)
    }, 400)
    return () => clearTimeout(t)
  }, [form.whatsapp, customer?.whatsapp, supabase])

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    if (!form.whatsapp.trim()) { setError('El WhatsApp es requerido'); return }
    if (waExists) { setError('Este WhatsApp ya está registrado'); return }
    setSaving(true)
    setError(null)
    try {
      const data = {
        name: form.name.trim(),
        whatsapp: form.whatsapp.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        credit_limit: form.enableCredit ? parseFloat(form.credit_limit || '0') : 0,
      }
      if (customer) {
        const { error: e } = await supabase.from('customers').update(data).eq('id', customer.id)
        if (e) throw e
        onSaved('Cliente actualizado correctamente')
      } else {
        const { error: e } = await supabase.from('customers').insert({ ...data, credit_balance: 0, loyalty_balance: 0, loyalty_spent: 0 })
        if (e) throw e
        onSaved('Cliente registrado con éxito')
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal-box modal-box--form">
        <div className="modal-hdr">
          <span className="modal-ttl">{customer ? 'Editar cliente' : 'Nuevo cliente'}</span>
          <button className="x-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field-grid">
            <div className="field-col">
              <label className="field-lbl">Nombre *</label>
              <input className="field-inp" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre completo" />
            </div>
            <div className="field-col">
              <label className="field-lbl">WhatsApp *</label>
              <input
                className={`field-inp ${waExists ? 'field-inp--err' : ''}`}
                value={form.whatsapp}
                onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="Ej: 5512345678"
              />
              {waChecking && <span className="field-hint">Verificando…</span>}
              {waExists && <span className="field-hint field-hint--err">Ya registrado</span>}
            </div>
            <div className="field-col">
              <label className="field-lbl">Teléfono</label>
              <input className="field-inp" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="field-col">
              <label className="field-lbl">Email</label>
              <input className="field-inp" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="field-col field-col--full">
              <label className="field-lbl">Dirección</label>
              <input className="field-inp" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Opcional" />
            </div>
            <div className="field-col field-col--full">
              <label className="field-lbl">Notas</label>
              <textarea className="field-inp field-textarea" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Opcional" rows={2} />
            </div>
          </div>

          {/* Credit section */}
          <div className="credit-section">
            <label className="credit-toggle">
              <input type="checkbox" checked={form.enableCredit} onChange={e => setForm(p => ({ ...p, enableCredit: e.target.checked }))} />
              <span>Habilitar crédito</span>
            </label>
            {form.enableCredit && (
              <div className="field-col" style={{ marginTop: 10 }}>
                <label className="field-lbl">Límite de crédito</label>
                <input className="field-inp" type="number" min={0} step={50} value={form.credit_limit} onChange={e => setForm(p => ({ ...p, credit_limit: e.target.value }))} placeholder="0.00" />
              </div>
            )}
          </div>

          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || waExists}>
            {saving ? 'Guardando…' : (customer ? 'Guardar cambios' : 'Registrar cliente')}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Abono Modal ─── */
interface AbonoModalProps { customer: Customer; onSaved: () => void; onClose: () => void }

function AbonoModal({ customer, onSaved, onClose }: AbonoModalProps) {
  const supabase = createClient()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recentPayments, setRecentPayments] = useState<Array<{ id: string; amount: number; created_at: string; payment_method: string }>>([])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])

  useEffect(() => {
    supabase.from('credit_payments').select('id,amount,created_at,payment_method').eq('customer_id', customer.id)
      .order('created_at', { ascending: false }).limit(8)
      .then(({ data }: { data: typeof recentPayments | null }) => setRecentPayments(data ?? []))
  }, [customer.id, supabase])

  const balance = customer.credit_balance
  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Ingresa un monto válido'); return }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('credit_payments').insert({ customer_id: customer.id, amount: amt, payment_method: method, notes: notes.trim() || null })
      if (e) throw e
      const newBalance = Math.max(0, balance - amt)
      const { error: e2 } = await supabase.from('customers').update({ credit_balance: newBalance }).eq('id', customer.id)
      if (e2) throw e2
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="overlay">
      <div className="modal-box modal-box--abono">
        <div className="modal-hdr">
          <div>
            <span className="modal-ttl">Registrar abono</span>
            <span className="modal-sub">{customer.name}</span>
          </div>
          <button className="x-btn" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          <div className="account-status">
            <div className="status-item">
              <span className="status-lbl">Saldo actual</span>
              <span className="status-val status-val--debt">{fmt(balance)}</span>
            </div>
            <div className="status-item">
              <span className="status-lbl">Límite</span>
              <span className="status-val">{fmt(customer.credit_limit)}</span>
            </div>
            <div className="status-item">
              <span className="status-lbl">Disponible</span>
              <span className="status-val">{fmt(Math.max(0, customer.credit_limit - balance))}</span>
            </div>
          </div>
          <div className="quick-row">
            {[0.25, 0.5, 1].map(pct => (
              <button key={pct} className="quick-btn" onClick={() => setAmount((balance * pct).toFixed(2))}>
                {pct === 1 ? 'Todo' : `${pct * 100}%`}
              </button>
            ))}
          </div>
          <div className="field-col">
            <label className="field-lbl">Monto del abono</label>
            <input className="field-inp" type="number" min={0} step={0.01} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          </div>
          <div className="method-row">
            {(['cash', 'card'] as const).map(m => (
              <button key={m} className={`method-btn ${method === m ? 'method-btn--active' : ''}`} onClick={() => setMethod(m)}>
                {m === 'cash' ? 'Efectivo' : 'Tarjeta'}
              </button>
            ))}
          </div>
          <div className="field-col">
            <label className="field-lbl">Notas (opcional)</label>
            <input className="field-inp" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Referencia, folio…" />
          </div>
          {recentPayments.length > 0 && (
            <div className="recent-payments">
              <span className="field-lbl">Últimos abonos</span>
              {recentPayments.map(p => (
                <div key={p.id} className="payment-row">
                  <span className="payment-date">{fmtDate(p.created_at)}</span>
                  <span className="payment-method">{p.payment_method === 'card' ? 'Tarjeta' : 'Efectivo'}</span>
                  <span className="payment-amount">{fmt(Number(p.amount))}</span>
                </div>
              ))}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Registrar abono'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Customer Detail Modal ─── */
type DetailTab = 'compras' | 'monedero' | 'credito'

interface SaleRow { id: string; total: number; created_at: string; payment_method: string }
interface CreditEntry { id: string; date: string; type: 'sale' | 'payment'; amount: number; label: string }

function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const supabase = createClient()
  const [tab, setTab] = useState<DetailTab>('compras')
  const [sales, setSales] = useState<SaleRow[]>([])
  const [loyalty, setLoyalty] = useState<LoyaltyTransaction[]>([])
  const [creditEntries, setCreditEntries] = useState<CreditEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    async function load() {
      try {
        const [salesRes, loyaltyRes, paymentsRes] = await Promise.all([
          supabase.from('sales').select('id,total,created_at,payment_method')
            .eq('customer_id', customer.id).neq('status', 'cancelled')
            .order('created_at', { ascending: false }).limit(50),
          supabase.from('loyalty_transactions').select('*')
            .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(50),
          supabase.from('credit_payments').select('id,amount,created_at,payment_method,notes')
            .eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(50),
        ])
        setSales((salesRes.data as SaleRow[]) ?? [])
        setLoyalty((loyaltyRes.data as LoyaltyTransaction[]) ?? [])
        const creditSales: CreditEntry[] = ((salesRes.data as SaleRow[]) ?? [])
          .filter(s => s.payment_method === 'credit')
          .map(s => ({ id: s.id, date: s.created_at, type: 'sale', amount: Number(s.total), label: 'Venta a crédito' }))
        const creditPays: CreditEntry[] = ((paymentsRes.data as Array<{ id: string; amount: number; created_at: string; payment_method: string; notes: string | null }>) ?? [])
          .map(p => ({ id: p.id, date: p.created_at, type: 'payment', amount: Number(p.amount), label: p.notes || `Abono (${p.payment_method === 'card' ? 'tarjeta' : 'efectivo'})` }))
        setCreditEntries([...creditSales, ...creditPays].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      } catch {
        // silently fail — data will show as empty
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [customer.id, supabase])

  const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', credit: 'Crédito', transfer: 'Transferencia', mixed: 'Mixto', wallet: 'Monedero' }
  const nextRewardIn = 1000 - (customer.loyalty_spent % 1000)
  const hasCredit = customer.credit_limit > 0

  // Credit running balance
  const creditWithBalance = (() => {
    const sorted = [...creditEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    let running = 0
    const result = sorted.map(e => { running += e.type === 'sale' ? e.amount : -e.amount; return { ...e, running: Math.max(0, running) } })
    return result.reverse()
  })()

  return (
    <div className="overlay">
      <div className="modal-box modal-box--detail">
        <div className="modal-hdr">
          <div className="detail-hdr-info">
            <div className="detail-avatar">{customer.name.charAt(0).toUpperCase()}</div>
            <div>
              <span className="modal-ttl">{customer.name}</span>
              {customer.whatsapp && <span className="modal-sub">WhatsApp: {customer.whatsapp}</span>}
              <span className="modal-sub">Cliente desde {fmtDate(customer.created_at)}</span>
            </div>
          </div>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>

        {/* Loyalty summary */}
        <div className="loyalty-summary">
          <div className="loyalty-item">
            <span className="loyalty-lbl">Monedero disponible</span>
            <span className={`loyalty-val ${customer.loyalty_balance > 0 ? 'loyalty-val--active' : ''}`}>{fmt(customer.loyalty_balance)}</span>
          </div>
          <div className="loyalty-item">
            <span className="loyalty-lbl">Total comprado</span>
            <span className="loyalty-val">{fmt(customer.loyalty_spent)}</span>
          </div>
          <div className="loyalty-item">
            <span className="loyalty-lbl">Próxima recompensa</span>
            <span className="loyalty-val loyalty-val--next">faltan {fmt(nextRewardIn)}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="detail-tabs">
          {(['compras', 'monedero', ...(hasCredit ? ['credito'] : [])] as DetailTab[]).map(t => (
            <button key={t} className={`detail-tab ${tab === t ? 'detail-tab--active' : ''}`} onClick={() => setTab(t)}>
              {t === 'compras' ? 'Historial de compras' : t === 'monedero' ? 'Monedero' : 'Estado de cuenta'}
            </button>
          ))}
        </div>

        <div className="detail-content">
          {loading ? (
            <div className="detail-loading">Cargando…</div>
          ) : tab === 'compras' ? (
            sales.length === 0 ? (
              <div className="detail-empty">Sin compras registradas</div>
            ) : (
              sales.map(s => (
                <div key={s.id} className="detail-row">
                  <div className="detail-row-left">
                    <span className="detail-row-date">{fmtDate(s.created_at)}</span>
                    <span className="detail-row-label">{METHOD_LABEL[s.payment_method] ?? s.payment_method}</span>
                  </div>
                  <span className="detail-row-amount">{fmt(s.total)}</span>
                </div>
              ))
            )
          ) : tab === 'monedero' ? (
            loyalty.length === 0 ? (
              <div className="detail-empty">Sin movimientos en el monedero</div>
            ) : (
              loyalty.map(t => (
                <div key={t.id} className="detail-row">
                  <div className="detail-row-left">
                    <span className="detail-row-date">{fmtDate(t.created_at)}</span>
                    <span className={`detail-row-badge ${t.type === 'earned' ? 'detail-row-badge--earned' : 'detail-row-badge--redeemed'}`}>
                      {t.type === 'earned' ? 'Ganado' : 'Usado'}
                    </span>
                  </div>
                  <span className={`detail-row-amount ${t.type === 'earned' ? 'detail-row-amount--pos' : 'detail-row-amount--neg'}`}>
                    {t.type === 'earned' ? '+' : '-'}{fmt(t.amount)}
                  </span>
                </div>
              ))
            )
          ) : (
            creditWithBalance.length === 0 ? (
              <div className="detail-empty">Sin movimientos de crédito</div>
            ) : (
              creditWithBalance.map(e => (
                <div key={e.id} className="detail-row">
                  <div className="detail-row-left">
                    <span className="detail-row-date">{fmtDate(e.date)}</span>
                    <span className="detail-row-label">{e.label}</span>
                  </div>
                  <div className="detail-row-right">
                    <span className={`detail-row-amount ${e.type === 'sale' ? 'detail-row-amount--neg' : 'detail-row-amount--pos'}`}>
                      {e.type === 'sale' ? '+' : '-'}{fmt(e.amount)}
                    </span>
                    <span className="detail-row-running">Saldo: {fmt(e.running)}</span>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */
export default function ClientesPage() {
  const supabase = createClient()
  const searchRef = useRef<HTMLInputElement>(null)
  useSearchFocus(searchRef)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCredit, setFilterCredit] = useState(false)
  const [filterWallet, setFilterWallet] = useState(false)
  const [filterDebt, setFilterDebt] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null)
  const [abonoCustomer, setAbonoCustomer] = useState<Customer | null>(null)
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('customers').select('*').eq('active', true).order('name')
    setCustomers((data as Customer[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || c.name.toLowerCase().includes(q) || (c.whatsapp ?? '').includes(q) || (c.phone ?? '').toLowerCase().includes(q)
    const matchCredit = !filterCredit || c.credit_limit > 0
    const matchWallet = !filterWallet || c.loyalty_balance > 0
    const matchDebt = !filterDebt || c.credit_balance > 0
    return matchSearch && matchCredit && matchWallet && matchDebt
  })

  const totalCustomers = customers.length
  const withDebt = customers.filter(c => c.credit_balance > 0).length
  const totalDebt = customers.reduce((a, c) => a + c.credit_balance, 0)
  const withWallet = customers.filter(c => c.loyalty_balance > 0).length

  const handleSaved = async (msg: string) => {
    await load()
    setShowForm(false)
    setEditing(null)
    setToast(msg)
  }

  const handleAbonoSaved = async () => {
    await load()
    setAbonoCustomer(null)
    setToast('Abono registrado correctamente')
  }

  const handleDelete = async () => {
    if (!deleteCustomer) return
    await supabase.from('customers').update({ active: false }).eq('id', deleteCustomer.id)
    setDeleteCustomer(null)
    await load()
    setToast('Cliente eliminado')
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">{totalCustomers} registrados · {withDebt} con deuda · {withWallet} con monedero</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo cliente
        </button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-val">{totalCustomers}</span>
          <span className="stat-lbl">Total clientes</span>
        </div>
        <div className="stat-card">
          <span className="stat-val">{withDebt}</span>
          <span className="stat-lbl">Con deuda</span>
        </div>
        <div className="stat-card">
          <span className="stat-val stat-val--danger">{fmt(totalDebt)}</span>
          <span className="stat-lbl">Deuda total</span>
        </div>
        <div className="stat-card">
          <span className="stat-val stat-val--accent">{withWallet}</span>
          <span className="stat-lbl">Con monedero activo</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-row">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input ref={searchRef} className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o WhatsApp…" />
        </div>
        <div className="filter-chips">
          <button className={`chip ${filterCredit ? 'chip--active' : ''}`} onClick={() => setFilterCredit(p => !p)}>Con crédito</button>
          <button className={`chip ${filterWallet ? 'chip--active' : ''}`} onClick={() => setFilterWallet(p => !p)}>Con monedero</button>
          <button className={`chip ${filterDebt ? 'chip--active chip--danger' : ''}`} onClick={() => setFilterDebt(p => !p)}>Con deuda</button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div className="table-empty">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="table-empty">Sin clientes{search ? ' para esa búsqueda' : ''}</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>WhatsApp</th>
                <th>Monedero</th>
                <th>Crédito</th>
                <th>Última compra</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="client-cell">
                      <div className="client-avatar">{c.name.charAt(0).toUpperCase()}</div>
                      <span className="client-name">{c.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="td-wa">{c.whatsapp ?? <span className="td-muted">—</span>}</span>
                  </td>
                  <td>
                    {c.loyalty_balance > 0
                      ? <span className="wallet-badge">{fmt(c.loyalty_balance)}</span>
                      : <span className="td-muted">—</span>}
                  </td>
                  <td>
                    {c.credit_limit > 0 ? (
                      <div className="credit-cell">
                        <div className="credit-bar-wrap">
                          <div
                            className="credit-bar"
                            style={{
                              width: `${Math.min(100, (c.credit_balance / c.credit_limit) * 100)}%`,
                              background: c.credit_balance / c.credit_limit > 0.9 ? 'var(--danger)' : c.credit_balance / c.credit_limit > 0.6 ? '#F59E0B' : 'var(--accent)',
                            }}
                          />
                        </div>
                        <span className="credit-text">{fmt(c.credit_balance)} / {fmt(c.credit_limit)}</span>
                      </div>
                    ) : <span className="td-muted">—</span>}
                  </td>
                  <td>
                    <span className="td-muted td-sm">—</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="action-btn" onClick={() => setDetailCustomer(c)} title="Ver detalle">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      </button>
                      {c.credit_balance > 0 && (
                        <button className="action-btn action-btn--accent" onClick={() => setAbonoCustomer(c)} title="Registrar abono">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </button>
                      )}
                      <button className="action-btn" onClick={() => { setEditing(c); setShowForm(true) }} title="Editar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="action-btn action-btn--danger" onClick={() => setDeleteCustomer(c)} title="Eliminar">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {(showForm || editing) && (
        <CustomerFormModal customer={editing ?? undefined} onSaved={handleSaved} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {detailCustomer && <CustomerDetailModal customer={detailCustomer} onClose={() => setDetailCustomer(null)} />}
      {abonoCustomer && <AbonoModal customer={abonoCustomer} onSaved={handleAbonoSaved} onClose={() => setAbonoCustomer(null)} />}
      {deleteCustomer && (
        <ConfirmModal
          message={`¿Eliminar a ${deleteCustomer.name}? Esta acción no se puede deshacer.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteCustomer(null)}
        />
      )}
      {toast && <div className="toast toast--success">{toast}</div>}

      <style>{`
        .page { padding: 28px 32px; display: flex; flex-direction: column; gap: 20px; height: 100%; overflow-y: auto; }

        /* Header */
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; }
        .page-title { font-family: var(--font-syne, sans-serif); font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
        .page-sub { font-size: 12px; color: var(--text-muted); margin: 0; }

        /* Stats */
        .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .stat-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
        .stat-val { font-family: var(--font-jetbrains, monospace); font-size: 20px; font-weight: 700; color: var(--text-primary); }
        .stat-val--danger { color: var(--danger, #EF4444); }
        .stat-val--accent { color: var(--accent); }
        .stat-lbl { font-size: 11px; color: var(--text-muted); }

        /* Filters */
        .filters-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
        .search-wrap { position: relative; flex: 1; min-width: 200px; }
        .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
        .search-input { width: 100%; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px 9px 34px; font-size: 13px; color: var(--text-primary); outline: none; transition: border-color 0.15s; }
        .search-input:focus { border-color: var(--accent); }
        .search-input::placeholder { color: var(--text-muted); }
        .filter-chips { display: flex; gap: 6px; }
        .chip { padding: 7px 12px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 20px; font-size: 12px; font-weight: 500; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
        .chip:hover { border-color: var(--accent); color: var(--accent); }
        .chip--active { background: var(--accent-glow); border-color: rgba(240,180,41,0.4); color: var(--accent); font-weight: 600; }
        .chip--danger.chip--active { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: var(--danger); }

        /* Table */
        .table-wrap { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .table { width: 100%; border-collapse: collapse; }
        .table thead th { padding: 11px 16px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid var(--border); text-align: left; background: var(--bg-card); }
        .table tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
        .table tbody tr:last-child { border-bottom: none; }
        .table tbody tr:hover { background: var(--bg-hover); }
        .table td { padding: 12px 16px; font-size: 13px; vertical-align: middle; }
        .table-empty { padding: 48px; text-align: center; font-size: 13px; color: var(--text-muted); }

        /* Client cell */
        .client-cell { display: flex; align-items: center; gap: 10px; }
        .client-avatar { width: 30px; height: 30px; border-radius: 8px; background: var(--accent-glow); border: 1px solid rgba(240,180,41,0.2); color: var(--accent); font-family: var(--font-syne, sans-serif); font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .client-name { font-weight: 600; color: var(--text-primary); }
        .td-wa { font-size: 12px; color: var(--text-secondary); font-family: var(--font-jetbrains, monospace); }
        .td-muted { color: var(--text-muted); font-size: 12px; }
        .td-sm { font-size: 11px; }

        /* Wallet badge */
        .wallet-badge { display: inline-block; padding: 3px 8px; background: var(--accent-glow); border: 1px solid rgba(240,180,41,0.3); border-radius: 6px; font-family: var(--font-jetbrains, monospace); font-size: 12px; font-weight: 600; color: var(--accent); }

        /* Credit cell */
        .credit-cell { display: flex; flex-direction: column; gap: 4px; min-width: 120px; }
        .credit-bar-wrap { width: 100%; height: 4px; background: var(--bg-hover); border-radius: 2px; overflow: hidden; }
        .credit-bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
        .credit-text { font-size: 11px; color: var(--text-muted); font-family: var(--font-jetbrains, monospace); }

        /* Row actions */
        .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
        .action-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid transparent; border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
        .action-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border); }
        .action-btn--accent:hover { background: var(--accent-glow); color: var(--accent); border-color: rgba(240,180,41,0.3); }
        .action-btn--danger:hover { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.3); }

        /* Buttons */
        .btn-primary { display: flex; align-items: center; gap: 6px; padding: 9px 16px; background: var(--accent); border: none; border-radius: 8px; font-family: var(--font-syne, sans-serif); font-size: 13px; font-weight: 700; color: #0D0D12; cursor: pointer; transition: all 0.15s; }
        .btn-primary:hover:not(:disabled) { background: #F5C233; }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-secondary { padding: 9px 16px; background: transparent; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
        .btn-secondary:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
        .btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-danger { padding: 9px 16px; background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--danger); cursor: pointer; transition: all 0.15s; }
        .btn-danger:hover { background: rgba(239,68,68,0.2); }

        /* Overlays & modals */
        .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .modal-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 24px 64px rgba(0,0,0,0.5); display: flex; flex-direction: column; overflow: hidden; }
        .modal-box--sm { width: 360px; max-width: 95vw; }
        .modal-box--form { width: 520px; max-width: 95vw; max-height: 90vh; }
        .modal-box--abono { width: 420px; max-width: 95vw; max-height: 90vh; }
        .modal-box--detail { width: 560px; max-width: 95vw; max-height: 90vh; }
        .modal-hdr { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .modal-ttl { display: block; font-family: var(--font-syne, sans-serif); font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .modal-sub { display: block; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .modal-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .modal-actions { display: flex; gap: 10px; padding: 16px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
        .modal-actions .btn-secondary { flex: 1; }
        .modal-actions .btn-primary, .modal-actions .btn-danger { flex: 2; justify-content: center; }
        .x-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 12px; transition: all 0.15s; flex-shrink: 0; }
        .x-btn:hover:not(:disabled) { background: var(--danger-dim); color: var(--danger); border-color: rgba(239,68,68,0.3); }
        .x-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .confirm-msg { font-size: 14px; color: var(--text-secondary); line-height: 1.5; padding: 20px; margin: 0; }

        /* Form fields */
        .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .field-col { display: flex; flex-direction: column; gap: 5px; }
        .field-col--full { grid-column: 1 / -1; }
        .field-lbl { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
        .field-inp { background: var(--bg-input, var(--bg-surface)); border: 1px solid var(--border); border-radius: 7px; padding: 9px 11px; font-size: 13px; color: var(--text-primary); outline: none; transition: border-color 0.15s; resize: none; }
        .field-inp:focus { border-color: var(--accent); }
        .field-inp::placeholder { color: var(--text-muted); }
        .field-inp--err { border-color: var(--danger) !important; }
        .field-hint { font-size: 11px; color: var(--text-muted); }
        .field-hint--err { color: var(--danger); font-weight: 500; }
        .field-textarea { resize: vertical; }
        .form-error { font-size: 12px; color: var(--danger); background: var(--danger-dim); border: 1px solid rgba(239,68,68,0.3); border-radius: 7px; padding: 8px 12px; }

        /* Credit section */
        .credit-section { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
        .credit-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .credit-toggle input { accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; }

        /* Abono */
        .account-status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
        .status-item { display: flex; flex-direction: column; gap: 3px; }
        .status-lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .status-val { font-family: var(--font-jetbrains, monospace); font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .status-val--debt { color: var(--danger, #EF4444); }
        .quick-row { display: flex; gap: 8px; }
        .quick-btn { flex: 1; padding: 7px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
        .quick-btn:hover { border-color: var(--accent); color: var(--accent); }
        .method-row { display: flex; gap: 8px; }
        .method-btn { flex: 1; padding: 8px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 7px; font-size: 12px; font-weight: 600; color: var(--text-secondary); cursor: pointer; transition: all 0.15s; }
        .method-btn--active { background: var(--accent-glow); border-color: rgba(240,180,41,0.4); color: var(--accent); }
        .recent-payments { display: flex; flex-direction: column; gap: 6px; }
        .payment-row { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); }
        .payment-row:last-child { border-bottom: none; }
        .payment-date { color: var(--text-muted); flex: 1; }
        .payment-method { color: var(--text-secondary); font-size: 11px; }
        .payment-amount { font-family: var(--font-jetbrains, monospace); font-weight: 600; color: var(--text-primary); }

        /* Detail modal */
        .detail-hdr-info { display: flex; align-items: center; gap: 12px; }
        .detail-avatar { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-glow); border: 1px solid rgba(240,180,41,0.25); color: var(--accent); font-family: var(--font-syne, sans-serif); font-weight: 800; font-size: 16px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .loyalty-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-bottom: 1px solid var(--border); background: var(--bg-surface); }
        .loyalty-item { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); }
        .loyalty-item:last-child { border-right: none; }
        .loyalty-lbl { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .loyalty-val { font-family: var(--font-jetbrains, monospace); font-size: 16px; font-weight: 700; color: var(--text-secondary); }
        .loyalty-val--active { color: var(--accent); }
        .loyalty-val--next { font-size: 13px; color: var(--text-muted); }
        .detail-tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .detail-tab { padding: 10px 16px; background: transparent; border: none; font-size: 12px; font-weight: 600; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .detail-tab:hover { color: var(--text-primary); }
        .detail-tab--active { color: var(--accent); border-bottom-color: var(--accent); }
        .detail-content { flex: 1; overflow-y: auto; padding: 8px 0; }
        .detail-loading, .detail-empty { padding: 32px; text-align: center; font-size: 13px; color: var(--text-muted); }
        .detail-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; border-bottom: 1px solid var(--border); gap: 12px; }
        .detail-row:last-child { border-bottom: none; }
        .detail-row-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
        .detail-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .detail-row-date { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
        .detail-row-label { font-size: 12px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .detail-row-amount { font-family: var(--font-jetbrains, monospace); font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }
        .detail-row-amount--pos { color: var(--success, #22C55E); }
        .detail-row-amount--neg { color: var(--danger, #EF4444); }
        .detail-row-running { font-size: 10px; color: var(--text-muted); font-family: var(--font-jetbrains, monospace); }
        .detail-row-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px; }
        .detail-row-badge--earned { background: rgba(34,197,94,0.1); color: var(--success, #22C55E); border: 1px solid rgba(34,197,94,0.3); }
        .detail-row-badge--redeemed { background: rgba(239,68,68,0.08); color: var(--danger); border: 1px solid rgba(239,68,68,0.25); }

        /* Toast */
        .toast { position: fixed; bottom: 28px; right: 28px; z-index: 500; display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500; box-shadow: 0 8px 24px rgba(0,0,0,0.4); animation: toast-in 0.25s ease; }
        .toast--success { background: var(--success, #10B981); color: #fff; }
        @keyframes toast-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
