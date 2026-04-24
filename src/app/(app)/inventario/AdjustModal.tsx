'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { ProductVariant } from '@/types'

type AdjustType = 'in' | 'out' | 'correction'

interface Props {
  variant: ProductVariant
  onClose: () => void
  onSaved: (variantId: string, newStock: number, prices?: { sale_price: number; cost_price: number; wholesale_price: number }) => void
}

const TYPES: { key: AdjustType; label: string; symbol: string; color: string; bg: string }[] = [
  { key: 'in',         label: 'Entrada',    symbol: '+', color: '#4CAF50', bg: '#0D2B0D' },
  { key: 'out',        label: 'Salida',     symbol: '−', color: '#FF6B6B', bg: '#2D1010' },
  { key: 'correction', label: 'Corrección', symbol: '=', color: '#F0B429', bg: '#3D2A00' },
]

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold"
          style={{ color: 'var(--text-muted)' }}>$</span>
        <input
          type="number" min="0" step="0.01"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-lg pl-7 pr-3 py-2 text-sm outline-none font-mono"
          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>
    </div>
  )
}

export default function AdjustModal({ variant, onClose, onSaved }: Props) {
  const { user } = useAuth()
  const [type, setType]     = useState<AdjustType>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Precios — solo para Entrada, pre-cargados con los valores actuales
  const [salePrice,      setSalePrice]      = useState(String(variant.sale_price))
  const [costPrice,      setCostPrice]      = useState(String(variant.cost_price))
  const [wholesalePrice, setWholesalePrice] = useState(String(variant.wholesale_price))

  const qty      = Math.max(0, parseInt(amount) || 0)
  const newStock = (() => {
    if (type === 'in')         return variant.stock + qty
    if (type === 'out')        return Math.max(0, variant.stock - qty)
    if (type === 'correction') return qty
    return variant.stock
  })()
  const stockDelta = newStock - variant.stock
  const isValid    = qty > 0   // motivo opcional

  async function handleSave() {
    if (!isValid || !user) return
    setSaving(true)
    setError(null)

    const supabase = createClient()

    try {
      // Campos a actualizar en product_variants
      const updatePayload: Record<string, unknown> = { stock: newStock }

      if (type === 'in') {
        const sp = parseFloat(salePrice)      || 0
        const cp = parseFloat(costPrice)      || 0
        const wp = parseFloat(wholesalePrice) || 0
        if (sp > 0) updatePayload.sale_price      = sp
        if (cp > 0) updatePayload.cost_price      = cp
        if (wp > 0) updatePayload.wholesale_price = wp
      }

      // 1 — Actualizar variant
      const { error: stockErr } = await supabase
        .from('product_variants')
        .update(updatePayload)
        .eq('id', variant.id)

      if (stockErr) throw new Error(`Error actualizando: ${stockErr.message}`)

      // 2 — Registrar en inventory_adjustments (no-fatal)
      const { error: adjErr } = await supabase
        .from('inventory_adjustments')
        .insert({
          variant_id: variant.id,
          type,
          quantity: qty,
          reason: reason.trim() || null,
          user_id: user.id,
        })

      if (adjErr) {
        console.warn('[AdjustModal] No se pudo registrar ajuste:', adjErr.message)
      }

      const prices = type === 'in' ? {
        sale_price:      parseFloat(salePrice)      || variant.sale_price,
        cost_price:      parseFloat(costPrice)      || variant.cost_price,
        wholesale_price: parseFloat(wholesalePrice) || variant.wholesale_price,
      } : undefined

      onSaved(variant.id, newStock, prices)
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar.')
    } finally {
      setSaving(false)
    }
  }

  const productName = `${variant.product?.name ?? ''}${variant.flavor ? ` — ${variant.flavor}` : ''}`

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}
    >
      <div
        className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', margin: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Ajuste de stock</p>
            <p className="text-sm font-bold mt-0.5 leading-tight" style={{ color: 'var(--text)' }}>
              {productName}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Stock actual: <strong style={{ color: 'var(--text)' }}>{variant.stock}</strong>
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ml-3"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
            ✕
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* Tipo */}
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(t => (
              <button key={t.key} onClick={() => setType(t.key)}
                className="py-2.5 rounded-xl text-sm font-semibold flex flex-col items-center gap-0.5 transition-all"
                style={{
                  background: type === t.key ? t.bg : 'var(--bg)',
                  color: type === t.key ? t.color : 'var(--text-muted)',
                  border: `1px solid ${type === t.key ? t.color : 'var(--border)'}`,
                }}>
                <span className="text-lg font-black">{t.symbol}</span>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Cantidad */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              {type === 'correction' ? 'Stock final (absoluto)' : 'Cantidad'}
            </label>
            <input
              type="number" min="0" step="1"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              autoFocus
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none font-mono"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Precios — solo en Entrada */}
          {type === 'in' && (
            <div className="flex flex-col gap-3 p-3 rounded-xl"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                Actualizar precios con esta entrada
              </p>
              <div className="grid grid-cols-3 gap-2">
                <PriceInput label="Costo"    value={costPrice}      onChange={setCostPrice} />
                <PriceInput label="Público"  value={salePrice}      onChange={setSalePrice} />
                <PriceInput label="Mayoreo"  value={wholesalePrice} onChange={setWholesalePrice} />
              </div>
            </div>
          )}

          {/* Motivo (opcional) */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Motivo <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ej: Recepción, merma, conteo físico…"
              className="w-full rounded-lg px-4 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              onKeyDown={e => { if (e.key === 'Enter' && isValid) handleSave() }}
            />
          </div>

          {/* Preview stock resultante */}
          {qty > 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl"
              style={{
                background: stockDelta > 0 ? '#0D2B0D' : stockDelta < 0 ? '#2D1010' : '#1a1a1a',
                border: `1px solid ${stockDelta > 0 ? '#2D4A2D' : stockDelta < 0 ? '#4D1A1A' : 'var(--border)'}`,
              }}>
              <div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Stock resultante</p>
                <p className="text-2xl font-black font-mono mt-0.5"
                  style={{ color: stockDelta > 0 ? '#4CAF50' : stockDelta < 0 ? '#FF6B6B' : '#F0B429' }}>
                  {newStock}
                </p>
              </div>
              {stockDelta !== 0 && (
                <span className="text-sm font-bold"
                  style={{ color: stockDelta > 0 ? '#4CAF50' : '#FF6B6B' }}>
                  {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                </span>
              )}
            </div>
          )}

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {saving ? 'Guardando…' : 'Guardar ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}
