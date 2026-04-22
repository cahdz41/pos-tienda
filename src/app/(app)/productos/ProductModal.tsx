'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Category } from '@/types'
import type { ProductRow, VariantFull } from './page'

interface VariantDraft {
  _key: string
  id?: string
  barcode: string
  flavor: string
  sale_price: string
  wholesale_price: string
  cost_price: string
  stock: string
  min_stock: string
  expiration_date: string
  hasSales: boolean
}

interface ConflictInfo {
  variantKey: string
  barcode: string
  productName: string
}

interface Props {
  product: ProductRow | 'new'
  categories: Category[]
  isOwner: boolean
  highlightBarcode?: string
  onClose: () => void
  onSaved: () => void
}

function makeKey() {
  return Math.random().toString(36).slice(2)
}

function titleCase(s: string): string {
  return s.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function variantTooDraft(v: VariantFull): VariantDraft {
  return {
    _key:            v.id,
    id:              v.id,
    barcode:         v.barcode,
    flavor:          v.flavor ?? '',
    sale_price:      String(v.sale_price),
    wholesale_price: String(v.wholesale_price),
    cost_price:      String(v.cost_price),
    stock:           String(v.stock),
    min_stock:       String(v.min_stock),
    expiration_date: v.expiration_date ?? '',
    hasSales:        false,
  }
}

function emptyDraft(): VariantDraft {
  return {
    _key:            makeKey(),
    barcode:         '',
    flavor:          '',
    sale_price:      '',
    wholesale_price: '',
    cost_price:      '',
    stock:           '0',
    min_stock:       '0',
    expiration_date: '',
    hasSales:        false,
  }
}

function Field({
  label, value, onChange, type = 'text', placeholder = '', prefix, disabled = false, required = false,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; prefix?: string; disabled?: boolean; required?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
        {label}{required && <span style={{ color: '#FF6B6B' }}> *</span>}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold"
            style={{ color: 'var(--text-muted)' }}>{prefix}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-lg py-2 text-sm outline-none"
          style={{
            background: disabled ? 'var(--surface)' : 'var(--bg)',
            border: '1px solid var(--border)',
            color: disabled ? 'var(--text-muted)' : 'var(--text)',
            paddingLeft: prefix ? '1.75rem' : '0.75rem',
            paddingRight: '0.75rem',
          }}
          onFocus={e => { if (!disabled) e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>
    </div>
  )
}

function parseName(raw: string): [string, string, string] {
  const parts = raw.split(' - ')
  if (parts.length >= 3) return [parts[0], parts.slice(1, -1).join(' - '), parts[parts.length - 1]]
  if (parts.length === 2) return [parts[0], parts[1], '']
  return [raw, '', '']
}

export default function ProductModal({ product, categories, isOwner, highlightBarcode, onClose, onSaved }: Props) {
  const isNew = product === 'new'
  const existingProduct = isNew ? null : (product as ProductRow)
  const existingName = existingProduct?.name ?? ''

  // Permitir editar el nombre si: es nuevo, no tiene nombre aún, o es huérfano
  const nameEditable = isNew || !existingName.trim() || !!existingProduct?.isOrphan

  const [parsed0, parsed1, parsed2] = parseName(existingName)
  const [brand, setBrand]             = useState(parsed0)
  const [productSpec, setProductSpec] = useState(parsed1)
  const [flavorPart, setFlavorPart]   = useState(parsed2)

  const name = [brand.trim(), productSpec.trim(), flavorPart.trim()]
    .filter(Boolean)
    .join(' - ')
  const nameComplete = brand.trim() !== '' && productSpec.trim() !== '' && flavorPart.trim() !== ''

  const [categoryName, setCategoryName] = useState(isNew ? '' : ((product as ProductRow).category ?? ''))
  const [newCatName, setNewCatName] = useState('')
  const [showNewCat, setShowNewCat] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)

  const [variants, setVariants] = useState<VariantDraft[]>(() => {
    if (isNew) return [{ ...emptyDraft(), barcode: highlightBarcode ?? '' }]
    const drafts = (product as ProductRow).product_variants.map(variantTooDraft)
    if (highlightBarcode) {
      return [...drafts].sort((a, b) => {
        const aMatch = a.barcode === highlightBarcode
        const bMatch = b.barcode === highlightBarcode
        return aMatch === bMatch ? 0 : aMatch ? -1 : 1
      })
    }
    return drafts
  })
  const [removedIds, setRemovedIds] = useState<string[]>([])
  const [variantFilter, setVariantFilter] = useState(highlightBarcode ?? '')

  // Barcode conflict detection
  const [conflict, setConflict] = useState<ConflictInfo | null>(null)
  const [checkingBarcode, setCheckingBarcode] = useState(false)
  const barcodeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLocked = conflict !== null

  function updateVariant(key: string, field: keyof VariantDraft, value: string) {
    setVariants(prev => prev.map(v => v._key === key ? { ...v, [field]: value } : v))
  }

  function addVariant() {
    setVariants(prev => [...prev, emptyDraft()])
  }

  function removeVariant(v: VariantDraft) {
    if (v.hasSales) return
    if (v.id) setRemovedIds(prev => [...prev, v.id!])
    setVariants(prev => prev.filter(d => d._key !== v._key))
    if (conflict?.variantKey === v._key) setConflict(null)
  }

  async function checkBarcode(variantKey: string, variantId: string | undefined, barcode: string) {
    const trimmed = barcode.trim()
    if (!trimmed) { setConflict(null); return }

    setCheckingBarcode(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    const { data } = await supabase
      .from('product_variants')
      .select('id, products(name)')
      .eq('barcode', trimmed)
      .maybeSingle()
    setCheckingBarcode(false)

    if (data && data.id !== variantId) {
      setConflict({
        variantKey,
        barcode: trimmed,
        productName: data.products?.name ?? 'producto desconocido',
      })
    } else {
      setConflict(prev => prev?.variantKey === variantKey ? null : prev)
    }
  }

  function handleBarcodeChange(variantKey: string, variantId: string | undefined, value: string) {
    updateVariant(variantKey, 'barcode', value)
    if (conflict?.variantKey === variantKey) setConflict(null)
    clearTimeout(barcodeTimers.current[variantKey])
    if (value.trim()) {
      barcodeTimers.current[variantKey] = setTimeout(() => {
        checkBarcode(variantKey, variantId, value)
      }, 600)
    }
  }

  async function createCategory() {
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setCreatingCat(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    const { error: err } = await supabase.from('categories').insert({ name: trimmed })
    setCreatingCat(false)
    if (err) { setError('Error creando categoría: ' + err.message); return }
    setCategoryName(trimmed)
    setNewCatName('')
    setShowNewCat(false)
  }

  async function handleSave() {
    if (!isOwner || isLocked) return
    if (nameEditable && !nameComplete) {
      setError('Completa los tres campos del nombre: Marca, Nombre+gramos y Sabor/variante.')
      return
    }
    const validVariants = variants.filter(v => v.barcode.trim())
    if (validVariants.length === 0) {
      setError('Agrega al menos una variante con código de barras.')
      return
    }

    setSaving(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any

    try {
      let productId: string

      if (isNew) {
        const { data, error: err } = await supabase
          .from('products')
          .insert({ name, category: categoryName || null })
          .select('id')
          .single()
        if (err) throw new Error('Error creando producto: ' + err.message)
        productId = (data as { id: string }).id
      } else if (existingProduct?.isOrphan) {
        // Orphan: INSERT new product then bulk-reassign ALL original variants
        const { data, error: err } = await supabase
          .from('products')
          .insert({ name, category: categoryName || null })
          .select('id')
          .single()
        if (err) throw new Error('Error creando producto: ' + err.message)
        productId = (data as { id: string }).id
        const allOriginalIds = existingProduct.product_variants.map(v => v.id)
        if (allOriginalIds.length > 0) {
          const { error: reErr } = await supabase
            .from('product_variants')
            .update({ product_id: productId })
            .in('id', allOriginalIds)
          if (reErr) throw new Error('Error reasignando variantes: ' + reErr.message)
        }
      } else {
        const existingId = (product as ProductRow).id
        const { error: err } = await supabase
          .from('products')
          .update({ name, category: categoryName || null })
          .eq('id', existingId)
        if (err) throw new Error('Error actualizando producto: ' + err.message)
        productId = existingId
      }

      for (const vid of removedIds) {
        const { error: err } = await supabase
          .from('product_variants')
          .delete()
          .eq('id', vid)
        if (err) throw new Error('Error eliminando variante: ' + err.message)
      }

      for (const v of validVariants) {
        const payload = {
          product_id:      productId,
          barcode:         v.barcode.trim(),
          flavor:          v.flavor.trim() || null,
          sale_price:      parseFloat(v.sale_price)      || 0,
          wholesale_price: parseFloat(v.wholesale_price) || 0,
          cost_price:      parseFloat(v.cost_price)      || 0,
          stock:           parseInt(v.stock)             || 0,
          min_stock:       parseInt(v.min_stock)         || 0,
          expiration_date: v.expiration_date || null,
        }

        if (v.id) {
          const { error: err } = await supabase
            .from('product_variants')
            .update(payload)
            .eq('id', v.id)
          if (err) throw new Error(`Error actualizando variante ${v.barcode}: ` + err.message)
        } else {
          const { error: err } = await supabase
            .from('product_variants')
            .insert(payload)
          if (err) throw new Error(`Error creando variante ${v.barcode}: ` + err.message)
        }
      }

      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar.')
      setSaving(false)
    }
  }

  const canSave = isOwner && (nameEditable ? nameComplete : true) && variants.some(v => v.barcode.trim()) && !isLocked && !checkingBarcode

  const displayedVariants = variantFilter.trim()
    ? variants.filter(v =>
        v.barcode.includes(variantFilter.trim()) ||
        v.flavor.toLowerCase().includes(variantFilter.trim().toLowerCase()))
    : variants

  return (
    // Sin onClick en el backdrop — no se cierra por click accidental
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '90vh', margin: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {isNew ? 'Nuevo producto' : nameEditable ? 'Completar producto' : (isOwner ? 'Editar producto' : 'Detalle de producto')}
          </p>
          <button onClick={onClose}
            style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Banner de conflicto de código — muy visible */}
        {conflict && (
          <div className="px-5 py-4 flex items-start gap-3 shrink-0"
            style={{ background: '#3D0A0A', borderBottom: '2px solid #FF6B6B' }}>
            <span style={{ fontSize: '22px', lineHeight: 1 }}>🚫</span>
            <div>
              <p className="text-sm font-bold" style={{ color: '#FF6B6B' }}>
                Código ya registrado: {conflict.barcode}
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#FF9999' }}>
                Este código pertenece a <strong>{conflict.productName}</strong>.
                Cambia el código de barras para continuar.
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">

          {/* Información general */}
          <section>
            <p className="text-xs font-semibold mb-3 uppercase tracking-wide"
              style={{ color: 'var(--text-muted)' }}>Información general</p>

            {nameEditable ? (
              /* ── Crear / Completar: campos editables ── */
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    Nombre del producto <span style={{ color: '#FF6B6B' }}>*</span>
                    <span className="ml-1 font-normal">— Marca · Nombre+gramos · Sabor/variante</span>
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: 'Marca',            val: brand,       set: setBrand,       ph: 'Ej: ON' },
                      { label: 'Nombre + gramos',  val: productSpec, set: setProductSpec, ph: 'Ej: Whey Gold 5lb' },
                      { label: 'Sabor / variante', val: flavorPart,  set: setFlavorPart,  ph: 'Ej: Chocolate' },
                    ] as const).map(({ label, val, set, ph }) => (
                      <div key={label}>
                        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
                        <input
                          type="text"
                          value={val}
                          onChange={e => set(titleCase(e.target.value))}
                          placeholder={ph}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                          style={{
                            background: 'var(--bg)',
                            border: `1px solid ${val.trim() ? 'var(--border)' : '#4D1A1A'}`,
                            color: 'var(--text)',
                          }}
                          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                          onBlur={e => (e.currentTarget.style.borderColor = val.trim() ? 'var(--border)' : '#4D1A1A')}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 px-3 py-2 rounded-lg flex items-center gap-2"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>Vista previa:</span>
                    {nameComplete ? (
                      <span className="text-xs font-semibold font-mono">
                        <span style={{ color: 'var(--text)' }}>{brand.trim()}</span>
                        <span style={{ color: 'var(--text-muted)' }}> — </span>
                        <span style={{ color: 'var(--text)' }}>{productSpec.trim()}</span>
                        <span style={{ color: 'var(--text-muted)' }}> — </span>
                        <span style={{ color: 'var(--text)' }}>{flavorPart.trim()}</span>
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: '#FF6B6B' }}>
                        Completa los 3 campos para ver el nombre final
                      </span>
                    )}
                  </div>
                </div>

                {/* Categoría — nueva */}
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Categoría</label>
                  {showNewCat ? (
                    <div className="flex gap-2">
                      <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                        placeholder="Nueva categoría…" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') createCategory(); if (e.key === 'Escape') setShowNewCat(false) }}
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text)' }} />
                      <button onClick={createCategory} disabled={creatingCat || !newCatName.trim()}
                        className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
                        style={{ background: 'var(--accent)', color: '#000' }}>
                        {creatingCat ? '…' : 'Crear'}
                      </button>
                      <button onClick={() => setShowNewCat(false)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select value={categoryName} onChange={e => setCategoryName(e.target.value)}
                        className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                        <option value="">Sin categoría</option>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                      <button onClick={() => setShowNewCat(true)}
                        className="px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
                        style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        + Nueva cat.
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── Editar: nombre fijo (ya tiene nombre correcto) ── */
              <div className="px-4 py-3 rounded-xl flex flex-col gap-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nombre del producto (no editable)</p>
                <p className="text-sm font-bold leading-snug" style={{ color: 'var(--text)' }}>
                  {existingName}
                </p>
                {isOwner ? (
                  <div>
                    <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>Categoría</label>
                    <select
                      value={categoryName}
                      onChange={e => setCategoryName(e.target.value)}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                      onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                    >
                      <option value="">Sin categoría</option>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                ) : (
                  categoryName && (
                    <span className="text-xs self-start px-2 py-0.5 rounded-md font-medium"
                      style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      {categoryName}
                    </span>
                  )
                )}
                <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Para modificar el nombre crea un producto nuevo y elimina este.
                </p>
              </div>
            )}
          </section>

          {/* Variantes */}
          <section>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wide flex-1" style={{ color: 'var(--text-muted)' }}>
                Variantes ({variants.length}{variantFilter.trim() && displayedVariants.length !== variants.length ? ` · ${displayedVariants.length} mostradas` : ''})
              </p>
              {variants.length > 4 && (
                <input
                  type="text"
                  value={variantFilter}
                  onChange={e => setVariantFilter(e.target.value)}
                  placeholder="Buscar código o sabor…"
                  className="rounded-lg px-2 py-1 text-xs outline-none font-mono"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', width: '160px' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
              )}
              {isOwner && !isLocked && (
                <button onClick={addVariant}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                  + Agregar variante
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {displayedVariants.map((v, idx) => {
                const isConflictingVariant = conflict?.variantKey === v._key
                return (
                  <div key={v._key}
                    className="rounded-xl p-4 flex flex-col gap-3"
                    style={{
                      background: 'var(--bg)',
                      border: `1px solid ${isConflictingVariant ? '#FF6B6B' : 'var(--border)'}`,
                    }}>

                    {/* Cabecera variante */}
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold" style={{ color: isConflictingVariant ? '#FF6B6B' : 'var(--text-muted)' }}>
                        Variante {idx + 1}
                        {v.hasSales && <span className="ml-2" style={{ color: '#F0B429' }}>(tiene ventas — solo edición)</span>}
                      </p>
                      {isOwner && variants.length > 1 && !isLocked && (
                        <button onClick={() => removeVariant(v)} disabled={v.hasSales}
                          className="text-xs px-2 py-0.5 rounded disabled:opacity-30"
                          style={{ color: '#FF6B6B', background: '#2D1010', border: '1px solid #4D1A1A' }}>
                          Quitar
                        </button>
                      )}
                    </div>

                    {/* Barcode — siempre editable cuando es la variante conflictiva */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-muted)' }}>
                          Código de barras <span style={{ color: '#FF6B6B' }}>*</span>
                          {checkingBarcode && isConflictingVariant && (
                            <span className="ml-1" style={{ color: 'var(--text-muted)' }}>verificando…</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={v.barcode}
                          onChange={e => handleBarcodeChange(v._key, v.id, e.target.value)}
                          placeholder="Ej: 7501055300123"
                          disabled={!isOwner || (isLocked && !isConflictingVariant)}
                          className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
                          style={{
                            background: (!isOwner || (isLocked && !isConflictingVariant)) ? 'var(--surface)' : 'var(--bg)',
                            border: `1px solid ${isConflictingVariant ? '#FF6B6B' : 'var(--border)'}`,
                            color: (!isOwner || (isLocked && !isConflictingVariant)) ? 'var(--text-muted)' : 'var(--text)',
                          }}
                          onFocus={e => { if (isOwner && (!isLocked || isConflictingVariant)) e.currentTarget.style.borderColor = isConflictingVariant ? '#FF6B6B' : 'var(--accent)' }}
                          onBlur={e => (e.currentTarget.style.borderColor = isConflictingVariant ? '#FF6B6B' : 'var(--border)')}
                        />
                      </div>
                      <Field
                        label="Sabor / Presentación" value={v.flavor}
                        onChange={val => updateVariant(v._key, 'flavor', val)}
                        placeholder="Ej: Vainilla, 2lb…" disabled={!isOwner || isLocked}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Precio público"  value={v.sale_price}      onChange={val => updateVariant(v._key, 'sale_price', val)}      type="number" prefix="$" placeholder="0.00" disabled={!isOwner || isLocked} />
                      <Field label="Precio mayoreo"  value={v.wholesale_price} onChange={val => updateVariant(v._key, 'wholesale_price', val)} type="number" prefix="$" placeholder="0.00" disabled={!isOwner || isLocked} />
                      <Field label="Precio costo"    value={v.cost_price}      onChange={val => updateVariant(v._key, 'cost_price', val)}      type="number" prefix="$" placeholder="0.00" disabled={!isOwner || isLocked} />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <Field label="Stock actual"   value={v.stock}           onChange={val => updateVariant(v._key, 'stock', val)}           type="number" placeholder="0"   disabled={!isOwner || isLocked} />
                      <Field label="Stock mínimo"   value={v.min_stock}       onChange={val => updateVariant(v._key, 'min_stock', val)}       type="number" placeholder="0"   disabled={!isOwner || isLocked} />
                      <Field label="Fecha caducidad" value={v.expiration_date} onChange={val => updateVariant(v._key, 'expiration_date', val)} type="date"                     disabled={!isOwner || isLocked} />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {error && (
            <p className="text-xs px-3 py-2 rounded-lg"
              style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: isLocked ? '#3D0A0A' : 'var(--bg)', color: isLocked ? '#FF6B6B' : 'var(--text-muted)', border: `1px solid ${isLocked ? '#FF6B6B' : 'var(--border)'}` }}>
            {isLocked ? 'Salir del formulario' : (isOwner ? 'Cancelar' : 'Cerrar')}
          </button>
          {isOwner && !isLocked && (
            <button onClick={handleSave} disabled={saving || !canSave}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}>
              {saving ? 'Guardando…' : checkingBarcode ? 'Verificando código…' : isNew ? 'Crear producto' : nameEditable ? 'Guardar y completar' : 'Guardar cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
