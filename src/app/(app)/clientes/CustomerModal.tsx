'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Customer } from '@/types'

interface Props {
  customer: Customer | 'new'
  onClose: () => void
  onSaved: (customer: Customer, isNew: boolean) => void
}

const EMPTY: Omit<Customer, 'id' | 'loyalty_balance' | 'loyalty_spent'> = {
  full_name: '', phone: null, email: null,
  address: null, credit_limit: 0, credit_balance: 0, notes: null,
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

export default function CustomerModal({ customer, onClose, onSaved }: Props) {
  const isNew = customer === 'new'
  const base  = isNew ? EMPTY : customer

  const [fullName,     setFullName]     = useState(base.full_name)
  const [phone,        setPhone]        = useState(base.phone ?? '')
  const [email,        setEmail]        = useState(base.email ?? '')
  const [address,      setAddress]      = useState(base.address ?? '')
  const [creditLimit,  setCreditLimit]  = useState(String(base.credit_limit))
  const [notes,        setNotes]        = useState(base.notes ?? '')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const canSave = fullName.trim().length > 0

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      full_name:    fullName.trim(),
      phone:        phone.trim()   || null,
      email:        email.trim()   || null,
      address:      address.trim() || null,
      credit_limit: parseFloat(creditLimit) || 0,
      notes:        notes.trim()   || null,
    }

    if (isNew) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any)
        .from('customers')
        .insert({ ...payload, credit_balance: 0, loyalty_balance: 0, loyalty_spent: 0 })
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved(data as Customer, true)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await (supabase as any)
        .from('customers')
        .update(payload)
        .eq('id', (customer as Customer).id)
        .select()
        .single()
      if (err) { setError(err.message); setSaving(false); return }
      onSaved(data as Customer, false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {isNew ? 'Nuevo cliente' : 'Editar cliente'}
          </p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
          <Field label="Nombre *" value={fullName} onChange={setFullName} placeholder="Nombre completo" />
          <Field label="Teléfono" value={phone} onChange={setPhone} type="tel" placeholder="(55) 1234-5678" />
          <Field label="Correo" value={email} onChange={setEmail} type="email" placeholder="correo@ejemplo.com" />
          <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle, número, colonia…" />

          {/* Límite de crédito */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Límite de crédito
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={creditLimit}
                onChange={e => setCreditLimit(e.target.value)}
                className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Notas
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observaciones…"
              rows={2}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}
        </div>

        <div className="flex gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !canSave}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {saving ? 'Guardando…' : isNew ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  )
}
