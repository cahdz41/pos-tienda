'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOffline } from '@/contexts/OfflineContext'
import { syncEngine } from '@/lib/sync'
import { db } from '@/lib/db'
import type { ProductVariant } from '@/types'

/* ─── Excel import logic ─── */
interface ExcelRow {
  barcode: string; full_name: string; cost_price: number; sale_price: number
  wholesale_price: number; stock: number; min_stock: number; max_stock: number
  category: string; brand: string; parent_name: string; flavor: string | null
}

function parseProductName(fullName: string) {
  const parts = fullName.split(' - ')
  if (parts.length >= 3) return { brand: parts[0].trim(), parent_name: parts.slice(0, parts.length - 1).join(' - ').trim(), flavor: parts[parts.length - 1].trim() }
  if (parts.length === 2) return { brand: parts[0].trim(), parent_name: fullName.trim(), flavor: null }
  return { brand: '', parent_name: fullName.trim(), flavor: null }
}

function parsePrice(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseFloat(v.replace(/[$,]/g, '')) || 0
  return 0
}

const fmt = (n: number) => `$${n.toFixed(2)}`

/* ─── Expiration helpers ─── */
type ExpStatus = 'expired' | 'soon' | 'ok' | 'none'

function getExpStatus(dateStr: string | null): ExpStatus {
  if (!dateStr) return 'none'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr + 'T00:00:00')
  const days = Math.ceil((exp.getTime() - today.getTime()) / 86400000)
  if (days < 0) return 'expired'
  if (days <= 30) return 'soon'
  return 'ok'
}

function fmtExpDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${d}/${months[parseInt(m) - 1]}/${y}`
}

function daysUntilExp(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const exp = new Date(dateStr + 'T00:00:00')
  return Math.ceil((exp.getTime() - today.getTime()) / 86400000)
}

/* ─── Adjustment modal ─── */
interface AdjustModalProps {
  variant: ProductVariant
  userId: string
  onClose: () => void
  onDone: (variantId: string, newStock: number, prices: { cost_price: number; sale_price: number; wholesale_price: number }) => void
}

function AdjustModal({ variant, userId, onClose, onDone }: AdjustModalProps) {
  const supabase = createClient()
  const [type, setType] = useState<'add' | 'remove' | 'correction'>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [costPrice, setCostPrice] = useState(String(variant.cost_price ?? ''))
  const [salePrice, setSalePrice] = useState(String(variant.sale_price ?? ''))
  const [wholesalePrice, setWholesalePrice] = useState(String(variant.wholesale_price ?? ''))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const productLabel = `${variant.product?.name ?? '—'}${variant.flavor ? ` - ${variant.flavor}` : ''}`
  const currentStock = Number(variant.stock)

  function computeNewStock(): number {
    const n = parseFloat(qty) || 0
    if (type === 'add') return currentStock + n
    if (type === 'remove') return currentStock - n
    return n
  }

  async function handleSave() {
    const n = parseFloat(qty)
    if (isNaN(n) || qty.trim() === '') { setErr('Ingresa una cantidad válida'); return }
    if (n < 0) { setErr('Usa un número positivo'); return }

    const newStock = computeNewStock()
    if (newStock < 0) { setErr('El stock resultante no puede ser negativo'); return }

    const newCost = parseFloat(costPrice) || 0
    const newSale = parseFloat(salePrice) || 0
    const newWholesale = parseFloat(wholesalePrice) || 0

    const qtyChange = type === 'correction' ? newStock - currentStock : type === 'add' ? n : -n

    setSaving(true); setErr(null)
    console.log('[AdjustModal] Iniciando guardado…', { variantId: variant.id, type, newStock })

    const withTimeout = <T,>(label: string, p: PromiseLike<T>): Promise<T> => {
      console.log(`[AdjustModal] → ${label}`)
      return Promise.race([
        Promise.resolve(p),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            reject(new Error(`Tiempo de espera agotado (${label}). Verifica tu conexión e intenta de nuevo.`))
          }, 30000)
        ),
      ])
    }

    try {
      const { error: adjError } = await withTimeout('inventory_adjustments.insert',
        supabase.from('inventory_adjustments').insert({
          variant_id: variant.id,
          cashier_id: userId,
          type,
          quantity_before: currentStock,
          quantity_change: qtyChange,
          quantity_after: newStock,
          reason: reason.trim() || null,
        })
      )
      if (adjError) throw new Error(`inventory_adjustments: ${adjError.message}`)

      const { error: updError } = await withTimeout('product_variants.update',
        supabase
          .from('product_variants')
          .update({ stock: newStock, cost_price: newCost, sale_price: newSale, wholesale_price: newWholesale })
          .eq('id', variant.id)
      )
      if (updError) throw new Error(`product_variants: ${updError.message}`)

      console.log('[AdjustModal] Supabase OK — actualizando caché local')
      // Dexie es solo caché local: no bloqueamos el flujo si falla
      db.product_variants.update(variant.id, {
        stock: newStock,
        cost_price: newCost,
        sale_price: newSale,
        wholesale_price: newWholesale,
      }).catch(e => console.warn('[AdjustModal] Dexie cache update falló (no crítico):', e))

      console.log('[AdjustModal] ✓ Guardado exitoso')
      onDone(variant.id, newStock, { cost_price: newCost, sale_price: newSale, wholesale_price: newWholesale })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido al guardar'
      console.error('[AdjustModal] ERROR:', msg, e)
      setErr(msg)
      setSaving(false)
    }
  }

  const newStock = qty.trim() ? computeNewStock() : null

  return (
    <div className="modal-overlay">
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Ajustar stock y precios</div>
            <div className="modal-subtitle">{productLabel}</div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Stock actual */}
          <div className="stock-display">
            <span className="stock-label">Stock actual</span>
            <span className={`stock-val ${currentStock <= 0 ? 'stock-val--out' : currentStock <= (variant.min_stock ?? 3) ? 'stock-val--low' : 'stock-val--ok'}`}>
              {currentStock} uds
            </span>
          </div>

          {/* Tipo */}
          <div className="field-group">
            <label className="field-label">Tipo de ajuste</label>
            <div className="type-btns">
              {([['add', 'Entrada'], ['remove', 'Salida'], ['correction', 'Corrección']] as const).map(([val, label]) => (
                <button
                  key={val}
                  className={`type-btn type-btn--${val} ${type === val ? 'type-btn--active' : ''}`}
                  onClick={() => setType(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Cantidad */}
          <div className="field-group">
            <label className="field-label">
              {type === 'correction' ? 'Nuevo stock (absoluto)' : 'Cantidad'}
            </label>
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="1"
              value={qty}
              onChange={e => { setQty(e.target.value); setErr(null) }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              className="field-input"
              placeholder={type === 'correction' ? 'Ej: 25' : 'Ej: 10'}
            />
          </div>

          {/* Preview resultado */}
          {newStock !== null && (
            <div className={`result-preview ${newStock < 0 ? 'result-preview--error' : ''}`}>
              <span>Stock resultante:</span>
              <strong>{newStock < 0 ? 'Error: negativo' : `${newStock} uds`}</strong>
            </div>
          )}

          {/* Precios */}
          <div className="field-group">
            <label className="field-label">Precios</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div>
                <label className="field-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Costo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  onChange={e => setCostPrice(e.target.value)}
                  className="field-input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="field-label" style={{ fontSize: '11px', marginBottom: '4px' }}>P. Venta</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salePrice}
                  onChange={e => setSalePrice(e.target.value)}
                  className="field-input"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="field-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Mayoreo</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={wholesalePrice}
                  onChange={e => setWholesalePrice(e.target.value)}
                  className="field-input"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Razón */}
          <div className="field-group">
            <label className="field-label">Motivo <span className="optional">(opcional)</span></label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="field-input"
              placeholder="Ej: Conteo físico, merma, devolución..."
              onKeyDown={e => e.key === 'Enter' && handleSave()}
            />
          </div>

          {err && <div className="modal-error">{err}</div>}
        </div>

        <div className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-confirm" onClick={handleSave} disabled={saving || !qty.trim()}>
            {saving ? 'Guardando…' : 'Confirmar ajuste'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Inline price cell ─── */
interface PriceCellProps {
  value: number
  canEdit: boolean
  onSave: (val: number) => Promise<void>
}

function PriceCell({ value, canEdit, onSave }: PriceCellProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    if (!canEdit) return
    setInputVal(value.toFixed(2))
    setEditing(true)
    setTimeout(() => { inputRef.current?.select() }, 30)
  }

  async function commit() {
    const n = parseFloat(inputVal)
    if (isNaN(n) || n < 0) { setEditing(false); return }
    if (Math.abs(n - value) < 0.001) { setEditing(false); return }
    setSaving(true)
    await onSave(n)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        step="0.01"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="price-input"
      />
    )
  }

  return (
    <span
      className={`price-cell ${canEdit ? 'price-cell--editable' : ''} ${saving ? 'price-cell--saving' : ''}`}
      onClick={startEdit}
      title={canEdit ? 'Clic para editar' : undefined}
    >
      {saving ? '…' : fmt(value)}
      {canEdit && <span className="edit-icon">✎</span>}
    </span>
  )
}

/* ─── Inline date cell ─── */
interface DateCellProps {
  value: string | null
  canEdit: boolean
  onSave: (val: string | null) => Promise<void>
}

function DateCell({ value, canEdit, onSave }: DateCellProps) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    if (!canEdit) return
    setInputVal(value ?? '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 30)
  }

  async function commit() {
    const newVal = inputVal || null
    setEditing(false)
    if (newVal === value) return
    setSaving(true)
    await onSave(newVal)
    setSaving(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        className="date-input"
      />
    )
  }

  if (saving) return <span className="date-cell">…</span>

  const status = getExpStatus(value)
  const COLOR: Record<ExpStatus, string> = {
    expired: 'var(--danger)',
    soon: 'var(--warning)',
    ok: 'var(--success)',
    none: 'var(--text-muted)',
  }
  const label = !value ? '—'
    : status === 'expired' ? `VENCIDO (${fmtExpDate(value)})`
    : status === 'soon' ? `${fmtExpDate(value)} (${daysUntilExp(value)}d)`
    : fmtExpDate(value)

  return (
    <span
      className={`date-cell${canEdit ? ' date-cell--editable' : ''}`}
      style={{ color: COLOR[status] }}
      onClick={startEdit}
      title={canEdit ? 'Clic para editar' : undefined}
    >
      {label}
      {canEdit && <span className="edit-icon">✎</span>}
    </span>
  )
}

/* ─── Main page ─── */
export default function InventarioPage() {
  const supabase = createClient()
  const { profile } = useAuth()
  const { isOnline } = useOffline()
  const isOwner = profile?.role === 'owner'

  // ── Inventory state ──
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [soloConExistencias, setSoloConExistencias] = useState(false)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [adjusting, setAdjusting] = useState<ProductVariant | null>(null)
  const [vencimientoFilter, setVencimientoFilter] = useState(false)

  // ── Import state ──
  const [importRows, setImportRows] = useState<ExcelRow[]>([])
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [showImportPreview, setShowImportPreview] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadInventory = useCallback(async () => {
    setLoadingList(true)
    try {
      if (navigator.onLine) {
        const needs = await syncEngine.shouldResync()
        if (needs) await syncEngine.syncCatalog().catch(e => console.error('[Inventario sync]', e))
      }
      const all = await syncEngine.getProducts()
      setVariants(all)
    } catch (e) {
      console.error('[loadInventory]', e)
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => { loadInventory() }, [loadInventory])

  const filtered = variants.filter(v => {
    if (soloConExistencias && v.stock <= 0) return false
    if (vencimientoFilter) {
      const s = getExpStatus(v.expiration_date ?? null)
      if (s !== 'expired' && s !== 'soon') return false
    }
    if (activeSearch.trim()) {
      const q = activeSearch.toLowerCase()
      const name = v.product?.name?.toLowerCase() ?? ''
      const flavor = v.flavor?.toLowerCase() ?? ''
      const barcode = v.barcode?.toLowerCase() ?? ''
      if (!name.includes(q) && !flavor.includes(q) && !barcode.includes(q)) return false
    }
    return true
  })

  const expiredCount = variants.filter(v => getExpStatus(v.expiration_date ?? null) === 'expired').length
  const soonCount = variants.filter(v => getExpStatus(v.expiration_date ?? null) === 'soon').length

  // ── Update stock in local state after adjustment ──
  function handleAdjustDone(variantId: string, newStock: number, prices: { cost_price: number; sale_price: number; wholesale_price: number }) {
    setVariants(prev => prev.map(v => v.id === variantId ? { ...v, stock: newStock, ...prices } : v))
    setAdjusting(null)
  }

  // ── Inline price update ──
  async function updatePrice(variantId: string, field: 'sale_price' | 'cost_price' | 'wholesale_price', val: number) {
    await supabase.from('product_variants').update({ [field]: val }).eq('id', variantId)
    setVariants(prev => prev.map(v => v.id === variantId ? { ...v, [field]: val } : v))
  }

  // ── Inline expiration date update ──
  async function updateExpDate(variantId: string, val: string | null) {
    await supabase.from('product_variants').update({ expiration_date: val }).eq('id', variantId)
    setVariants(prev => prev.map(v => v.id === variantId ? { ...v, expiration_date: val } : v))
  }

  // ── Excel read ──
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary', cellText: true, cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      // raw: false + defval: '' para que XLSX formatee las celdas como texto
      // y preserve ceros iniciales en códigos de barras
      const raw = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' }) as Record<string, unknown>[]
      const parsed: ExcelRow[] = raw.map(r => {
        const fullName = String(r['Producto'] || '')
        const { brand, parent_name, flavor } = parseProductName(fullName)
        // UPC-A = 12 dígitos. Excel elimina el 0 inicial al guardar como número,
        // así que siempre rellenamos hasta 12 con padStart.
        const rawBarcode = String(r['Código'] || '').trim().replace(/[,.\s]/g, '').replace(/\.0+$/, '')
        const barcode = rawBarcode ? rawBarcode.padStart(12, '0') : ''
        return {
          barcode,
          full_name: fullName,
          cost_price: parsePrice(r['P. Costo']),
          sale_price: parsePrice(r['P. Venta']),
          wholesale_price: parsePrice(r['P. Mayoreo']),
          stock: parsePrice(r['Existencia']),
          min_stock: parsePrice(r['Inv. Mínimo']),
          max_stock: parsePrice(r['Inv. Máximo']),
          category: String(r['Departamento'] || ''),
          brand, parent_name, flavor,
        }
      }).filter(r => r.barcode && r.full_name)
      setImportRows(parsed)
      setShowImportPreview(true)
      setImportStatus(null)
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    if (importRows.length === 0) return
    setImporting(true)
    setImportStatus(null)
    try {
      const productMap = new Map<string, { name: string; brand: string; category: string }>()
      for (const row of importRows) {
        if (!productMap.has(row.parent_name))
          productMap.set(row.parent_name, { name: row.parent_name, brand: row.brand, category: row.category })
      }
      const { error: prodError } = await supabase
        .from('products')
        .upsert(Array.from(productMap.values()), { onConflict: 'name' })
      if (prodError) throw prodError

      const { data: allProducts, error: fetchError } = await supabase.from('products').select('id, name')
      if (fetchError) throw fetchError

      const nameToId = new Map((allProducts as { id: string; name: string }[]).map(p => [p.name, p.id]))
      const variantsToUpsert = importRows.map(row => ({
        product_id: nameToId.get(row.parent_name),
        barcode: row.barcode,
        flavor: row.flavor,
        cost_price: row.cost_price,
        sale_price: row.sale_price,
        wholesale_price: row.wholesale_price,
        stock: row.stock,
        min_stock: row.min_stock,
        max_stock: row.max_stock,
      }))
      const { error: varError } = await supabase.from('product_variants').upsert(variantsToUpsert, { onConflict: 'barcode' })
      if (varError) throw varError

      setImportStatus({ type: 'success', msg: `✓ Importación completa: ${productMap.size} productos, ${importRows.length} variantes.` })
      setShowImportPreview(false)
      setImportRows([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadInventory()
    } catch (err: unknown) {
      setImportStatus({ type: 'error', msg: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

  const totalStock = variants.reduce((a, v) => a + Number(v.stock), 0)
  const sinStock = variants.filter(v => v.stock <= 0).length

  return (
    <div className="inv-page">
      {/* Adjustment modal */}
      {adjusting && profile && (
        <AdjustModal
          variant={adjusting}
          userId={profile.id}
          onClose={() => setAdjusting(null)}
          onDone={handleAdjustDone}
        />
      )}

      {/* Header */}
      <div className="inv-header">
        <div>
          <h1 className="inv-title">Inventario</h1>
          <p className="inv-subtitle">
            {variants.length} variantes · {totalStock.toFixed(0)} uds en stock · {sinStock} sin existencias
            {expiredCount > 0 && <span className="exp-badge exp-badge--red"> · {expiredCount} vencido{expiredCount !== 1 ? 's' : ''}</span>}
            {soonCount > 0 && <span className="exp-badge exp-badge--yellow"> · {soonCount} por vencer</span>}
          </p>
        </div>
        <div className="header-actions">
          {!isOnline && (
            <span className="offline-badge">Solo lectura</span>
          )}
          {isOwner && isOnline && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                style={{ display: 'none' }}
                id="excel-upload"
              />
              <label htmlFor="excel-upload" className="btn-import">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Actualizar desde Excel
              </label>
            </>
          )}
        </div>
      </div>

      {/* Import status */}
      {importStatus && (
        <div className={`import-status import-status--${importStatus.type}`}>
          {importStatus.msg}
        </div>
      )}

      {/* Import preview */}
      {showImportPreview && importRows.length > 0 && (
        <div className="import-preview">
          <div className="preview-header">
            <span className="preview-title">Vista previa — {importRows.length} registros encontrados</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-cancel-import" onClick={() => { setShowImportPreview(false); setImportRows([]) }}>
                Cancelar
              </button>
              <button className="btn-confirm-import" onClick={handleImport} disabled={importing}>
                {importing ? 'Importando…' : `Importar ${importRows.length} registros`}
              </button>
            </div>
          </div>
          <div className="preview-table-wrap">
            <table className="preview-table">
              <thead>
                <tr>
                  <th>Código</th><th>Producto</th><th>Sabor</th><th>Categoría</th>
                  <th>P.Venta</th><th>P.Costo</th><th>Stock</th>
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="mono">{r.barcode}</td>
                    <td>{r.parent_name}</td>
                    <td className="muted">{r.flavor ?? '—'}</td>
                    <td className="muted">{r.category}</td>
                    <td className="mono">{fmt(r.sale_price)}</td>
                    <td className="mono">{fmt(r.cost_price)}</td>
                    <td className={`mono ${r.stock <= 0 ? 'no-stock' : ''}`}>{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importRows.length > 20 && (
              <p className="preview-more">… y {importRows.length - 20} registros más</p>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="inv-toolbar">
        <div className="search-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setActiveSearch(e.target.value) }}
            onKeyDown={e => {
              if (e.key !== 'Enter' || !search.trim()) return
              const match = variants.find(
                v => v.barcode?.toLowerCase() === search.trim().toLowerCase()
              )
              if (match) setSearch('')
            }}
            placeholder="Buscar producto, sabor o código…"
            className="inv-search"
          />
        </div>
        <button
          className={`filter-stock-btn ${soloConExistencias ? 'filter-stock-btn--active' : ''}`}
          onClick={() => setSoloConExistencias(s => !s)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          {soloConExistencias ? 'Con existencias ✓' : 'Solo con existencias'}
        </button>
        <button
          className={`filter-stock-btn ${vencimientoFilter ? 'filter-stock-btn--exp' : ''}`}
          onClick={() => setVencimientoFilter(s => !s)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {vencimientoFilter ? 'Caducados/Por vencer ✓' : 'Caducados/Por vencer'}
        </button>
        <span className="results-count">{filtered.length} resultados</span>
        {isOwner && isOnline && (
          <span className="edit-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Clic en precio para editar
          </span>
        )}
      </div>

      {/* Table */}
      <div className="inv-table-wrap">
        {loadingList ? (
          <div className="inv-loading">Cargando inventario…</div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Sabor</th>
                <th>Categoría</th>
                <th>P. Venta</th>
                <th>P. Costo</th>
                <th>P. Mayoreo</th>
                <th>Stock</th>
                <th>Mín.</th>
                <th>Caducidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} className={v.stock <= 0 ? 'row--no-stock' : ''}>
                  <td className="mono muted">{v.barcode}</td>
                  <td className="product-name">{v.product?.name ?? '—'}</td>
                  <td className="muted">{v.flavor ?? '—'}</td>
                  <td className="muted">{v.product?.category ?? '—'}</td>
                  <td className="mono">
                    <PriceCell
                      value={v.sale_price}
                      canEdit={isOwner && isOnline}
                      onSave={val => updatePrice(v.id, 'sale_price', val)}
                    />
                  </td>
                  <td className="mono">
                    <PriceCell
                      value={v.cost_price}
                      canEdit={isOwner && isOnline}
                      onSave={val => updatePrice(v.id, 'cost_price', val)}
                    />
                  </td>
                  <td className="mono">
                    <PriceCell
                      value={v.wholesale_price}
                      canEdit={isOwner && isOnline}
                      onSave={val => updatePrice(v.id, 'wholesale_price', val)}
                    />
                  </td>
                  <td>
                    <span className={`stock-badge ${v.stock <= 0 ? 'stock-badge--out' : v.stock <= (v.min_stock ?? 3) ? 'stock-badge--low' : 'stock-badge--ok'}`}>
                      {v.stock}
                    </span>
                  </td>
                  <td className="mono muted">{v.min_stock ?? 0}</td>
                  <td>
                    <DateCell
                      value={v.expiration_date ?? null}
                      canEdit={isOwner && isOnline}
                      onSave={val => updateExpDate(v.id, val)}
                    />
                  </td>
                  <td>
                    <button
                      className="btn-adjust"
                      onClick={() => setAdjusting(v)}
                      title="Ajustar stock"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19"/>
                        <line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Ajustar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .inv-page {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        /* Header */
        .inv-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .inv-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .inv-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0;
        }

        .header-actions { display: flex; gap: 10px; align-items: center; }

        .offline-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 20px;
          background: rgba(239,68,68,0.12);
          color: var(--danger, #EF4444);
          border: 1px solid rgba(239,68,68,0.3);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .btn-import {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 16px;
          background: var(--accent);
          color: #0D0D12;
          border-radius: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-import:hover { background: #F5C233; transform: translateY(-1px); }

        /* Import status */
        .import-status {
          margin: 12px 24px 0;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          flex-shrink: 0;
        }
        .import-status--success { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: var(--success, #22C55E); }
        .import-status--error { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); color: var(--danger, #EF4444); }

        /* Import preview */
        .import-preview {
          margin: 12px 24px 0;
          background: var(--bg-card);
          border: 1px solid var(--accent);
          border-radius: 10px;
          overflow: hidden;
          flex-shrink: 0;
        }

        .preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: rgba(240,180,41,0.06);
        }

        .preview-title { font-size: 13px; font-weight: 600; color: var(--accent); }

        .btn-cancel-import {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 12px;
          color: var(--text-muted);
          cursor: pointer;
        }

        .btn-confirm-import {
          padding: 6px 14px;
          background: var(--accent);
          border: none;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
        }
        .btn-confirm-import:disabled { opacity: 0.6; cursor: not-allowed; }

        .preview-table-wrap { max-height: 220px; overflow-y: auto; }

        /* Toolbar */
        .inv-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }

        .search-wrap {
          flex: 1;
          max-width: 380px;
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px 12px;
          color: var(--text-muted);
          transition: border-color 0.15s;
        }
        .search-wrap:focus-within { border-color: var(--accent); }

        .inv-search {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          font-size: 13px;
          color: var(--text-primary);
        }
        .inv-search::placeholder { color: var(--text-muted); }

        .filter-stock-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .filter-stock-btn:hover { border-color: var(--accent); color: var(--accent); }
        .filter-stock-btn--active { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.4); color: var(--success, #22C55E); }

        .results-count { font-size: 12px; color: var(--text-muted); margin-left: auto; }

        .edit-hint {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-muted);
          white-space: nowrap;
        }

        /* Table */
        .inv-table-wrap {
          flex: 1;
          overflow-y: auto;
          padding: 0 24px 24px;
        }

        .inv-loading { padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; }

        .inv-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }

        .inv-table thead th {
          position: sticky;
          top: 0;
          background: var(--bg-base);
          padding: 10px 10px 8px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid var(--border);
          white-space: nowrap;
        }

        .inv-table tbody tr {
          border-bottom: 1px solid rgba(255,255,255,0.04);
          transition: background 0.1s;
        }

        .inv-table tbody tr:hover { background: var(--bg-card); }
        .inv-table tbody tr.row--no-stock { opacity: 0.5; }

        .inv-table td {
          padding: 7px 10px;
          color: var(--text-secondary);
          vertical-align: middle;
        }

        .product-name { color: var(--text-primary); font-weight: 500; }
        .mono { font-family: var(--font-jetbrains, monospace); }
        .muted { color: var(--text-muted); }

        /* Price cell */
        .price-cell {
          color: var(--accent);
          font-weight: 600;
          cursor: default;
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 4px;
          padding: 2px 4px;
          transition: background 0.12s;
        }
        .price-cell--editable { cursor: pointer; }
        .price-cell--editable:hover { background: rgba(240,180,41,0.1); }
        .price-cell--saving { opacity: 0.5; }
        .edit-icon { font-size: 10px; color: var(--text-muted); opacity: 0; transition: opacity 0.15s; }
        .price-cell--editable:hover .edit-icon { opacity: 1; }

        .price-input {
          width: 90px;
          background: var(--bg-input);
          border: 1px solid var(--accent);
          border-radius: 5px;
          padding: 3px 6px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 12px;
          color: var(--accent);
          outline: none;
        }

        /* Expiration badges in subtitle */
        .exp-badge { font-weight: 600; }
        .exp-badge--red    { color: var(--danger); }
        .exp-badge--yellow { color: var(--warning); }

        /* Filter button variant for expiration */
        .filter-stock-btn--exp {
          border-color: var(--warning);
          color: var(--warning);
        }

        /* Date cell */
        .date-cell {
          font-size: 11px;
          white-space: nowrap;
          cursor: default;
          font-family: var(--font-jetbrains, monospace);
        }
        .date-cell--editable {
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .date-cell--editable:hover { opacity: 0.8; }

        .date-input {
          background: var(--bg-input);
          border: 1px solid var(--accent);
          border-radius: 5px;
          padding: 3px 6px;
          font-size: 11px;
          color: var(--text-primary);
          outline: none;
          font-family: var(--font-jetbrains, monospace);
        }

        .stock-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-family: var(--font-jetbrains, monospace);
          font-size: 12px;
          font-weight: 600;
        }
        .stock-badge--ok { background: rgba(34,197,94,0.1); color: var(--success, #22C55E); }
        .stock-badge--low { background: rgba(245,158,11,0.1); color: #F59E0B; }
        .stock-badge--out { background: rgba(239,68,68,0.1); color: var(--danger, #EF4444); }

        /* Adjust button */
        .btn-adjust {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .btn-adjust:hover:not(:disabled) {
          border-color: var(--accent);
          color: var(--accent);
          background: var(--accent-glow);
        }

        .btn-adjust:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        /* Preview table */
        .preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .preview-table th {
          padding: 8px 10px;
          text-align: left;
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          border-bottom: 1px solid var(--border);
        }
        .preview-table td {
          padding: 6px 10px;
          color: var(--text-secondary);
          border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .preview-more { padding: 8px 12px; font-size: 11px; color: var(--text-muted); }
        .no-stock { color: var(--danger, #EF4444); }

        /* ── Adjustment Modal ── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 300;
          padding: 20px;
        }

        .modal-box {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
          overflow: hidden;
        }

        .modal-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          padding: 20px 20px 0;
        }

        .modal-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .modal-subtitle {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 3px;
        }

        .modal-close {
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          transition: all 0.15s;
        }
        .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }

        .modal-body {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .stock-display {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 14px;
        }

        .stock-label { font-size: 12px; color: var(--text-muted); }

        .stock-val {
          font-family: var(--font-jetbrains, monospace);
          font-size: 16px;
          font-weight: 700;
        }
        .stock-val--ok { color: var(--success, #22C55E); }
        .stock-val--low { color: #F59E0B; }
        .stock-val--out { color: var(--danger, #EF4444); }

        .field-group { display: flex; flex-direction: column; gap: 6px; }

        .field-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .optional { font-weight: 400; color: var(--text-muted); text-transform: none; }

        .field-input {
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--accent); }
        .field-input::placeholder { color: var(--text-muted); }

        .type-btns {
          display: flex;
          gap: 8px;
        }

        .type-btn {
          flex: 1;
          padding: 8px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .type-btn--active.type-btn--add { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.4); color: var(--success, #22C55E); }
        .type-btn--active.type-btn--remove { background: rgba(239,68,68,0.12); border-color: rgba(239,68,68,0.4); color: var(--danger, #EF4444); }
        .type-btn--active.type-btn--correction { background: rgba(240,180,41,0.12); border-color: rgba(240,180,41,0.4); color: var(--accent); }

        .result-preview {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(34,197,94,0.08);
          border: 1px solid rgba(34,197,94,0.2);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--text-secondary);
        }
        .result-preview strong { font-family: var(--font-jetbrains, monospace); color: var(--success, #22C55E); }
        .result-preview--error { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }
        .result-preview--error strong { color: var(--danger, #EF4444); }

        .modal-error {
          background: rgba(239,68,68,0.1);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 12px;
          color: var(--danger, #EF4444);
        }

        .modal-footer {
          display: flex;
          gap: 10px;
          padding: 0 20px 20px;
        }

        .btn-cancel {
          flex: 1;
          padding: 10px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-cancel:hover { background: var(--bg-hover); }

        .btn-confirm {
          flex: 2;
          padding: 10px;
          background: var(--accent);
          border: none;
          border-radius: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-confirm:hover:not(:disabled) { background: #F5C233; }
        .btn-confirm:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
