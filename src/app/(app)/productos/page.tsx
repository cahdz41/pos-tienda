'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ProductVariant, Supplier, Combo, ComboItem } from '@/types'

type Tab = 'productos' | 'combos' | 'proveedores' | 'departamentos'

interface Department {
  id: string
  name: string
  active: boolean
  created_at: string
  updated_at: string
}

const fmt = (n: number) => `$${Number(n).toFixed(2)}`

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })
}

/* ─────────────────────────────────────────────
   MODAL GENÉRICO DE CONFIRMACIÓN
───────────────────────────────────────────── */
function ConfirmModal({ title, message, onClose, onConfirm, loading }: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
  loading: boolean
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, loading])

  return (
    <div className="modal-overlay">
      <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ color: 'var(--danger)' }}>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn--ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn--danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   TAB: PROVEEDORES
───────────────────────────────────────────── */
interface SupplierFormData {
  name: string
  phone: string
  email: string
  notes: string
}

function SupplierFormModal({ supplier, onClose, onSaved }: {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState<SupplierFormData>({
    name: supplier?.name ?? '',
    phone: supplier?.phone ?? '',
    email: supplier?.email ?? '',
    notes: supplier?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: keyof SupplierFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    setSaving(true); setError(null)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (supplier) {
        const { error: e } = await supabase.from('suppliers').update(payload).eq('id', supplier.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('suppliers').insert(payload)
        if (e) throw e
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setSaving(false)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, saving])

  return (
    <div className="modal-overlay">
      <div className="modal modal--sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field-label">Nombre *</label>
            <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Nombre del proveedor" autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Teléfono</label>
            <input className="field-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="55 1234 5678" />
          </div>
          <div className="field">
            <label className="field-label">Correo</label>
            <input className="field-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="correo@proveedor.com" />
          </div>
          <div className="field field--full">
            <label className="field-label">Notas</label>
            <textarea className="field-input field-textarea" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Observaciones opcionales…" rows={3} />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProveedoresTab() {
  const supabase = createClient()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').eq('active', true).order('name')
    setSuppliers((data as Supplier[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.phone ?? '').includes(search) ||
    (s.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    // Verificar si tiene productos asociados
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('supplier_id', deleting.id)
    if (count && count > 0) {
      await supabase.from('suppliers').update({ active: false }).eq('id', deleting.id)
    } else {
      await supabase.from('suppliers').delete().eq('id', deleting.id)
    }
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="search-wrap">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor…" />
        </div>
        <button className="btn btn--primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo proveedor
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando proveedores…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No hay proveedores{search ? ' con ese filtro' : ' registrados'}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Correo</th>
                <th>Notas</th>
                <th>Registrado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td className="td-name">{s.name}</td>
                  <td className="td-muted">{s.phone ?? '—'}</td>
                  <td className="td-muted">{s.email ?? '—'}</td>
                  <td className="td-muted" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.notes ?? '—'}</td>
                  <td className="td-muted">{fmtDate(s.created_at)}</td>
                  <td className="td-actions">
                    <button className="action-btn" title="Editar" onClick={() => { setEditing(s); setModalOpen(true) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="action-btn action-btn--danger" title="Eliminar" onClick={() => setDeleting(s)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <SupplierFormModal
          supplier={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Eliminar proveedor"
          message={`¿Eliminar a "${deleting.name}"? Si tiene productos asociados se desactivará en lugar de borrarse.`}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   TAB: PRODUCTOS
───────────────────────────────────────────── */
interface ProductFormData {
  barcode: string
  name: string
  sale_type: 'unidad' | 'paquete'
  cost_price: string
  sale_price: string
  wholesale_price: string
  category: string
  supplier_id: string
  qty_add: string
  min_stock: string
  expiration_month_year: string // MM/AAAA → se guarda como YYYY-MM-01
}

function ProductFormModal({ variant, suppliers, departments, onClose, onSaved }: {
  variant: ProductVariant | null
  suppliers: Supplier[]
  departments: Department[]
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [form, setForm] = useState<ProductFormData>({
    barcode: variant?.barcode ?? '',
    name: variant?.product?.name ?? '',
    sale_type: (variant?.product?.sale_type as 'unidad' | 'paquete') ?? 'unidad',
    cost_price: variant ? String(variant.cost_price) : '',
    sale_price: variant ? String(variant.sale_price) : '',
    wholesale_price: variant ? String(variant.wholesale_price) : '',
    category: variant?.product?.category ?? '',
    supplier_id: variant?.product?.supplier_id ?? '',
    qty_add: '',
    min_stock: variant ? String(variant.min_stock) : '0',
    expiration_month_year: variant?.expiration_date
      ? `${variant.expiration_date.slice(5, 7)}/${variant.expiration_date.slice(0, 4)}`
      : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [barcodeExists, setBarcodeExists] = useState(false)
  const [barcodeChecking, setBarcodeChecking] = useState(false)

  // ESC para cerrar (solo si no está guardando)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, saving])

  // Verificar barcode duplicado en tiempo real
  useEffect(() => {
    const barcode = form.barcode.trim()
    if (!barcode || (variant && variant.barcode === barcode)) {
      setBarcodeExists(false)
      return
    }
    setBarcodeChecking(true)
    const timer = setTimeout(async () => {
      const { count } = await supabase
        .from('product_variants')
        .select('id', { count: 'exact', head: true })
        .eq('barcode', barcode)
      setBarcodeExists((count ?? 0) > 0)
      setBarcodeChecking(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [form.barcode, variant, supabase])

  const set = (k: keyof ProductFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.barcode.trim()) { setError('El código de barras es requerido'); return }
    if (!form.name.trim()) { setError('El nombre es requerido'); return }
    if (barcodeExists) { setError('Ese código de barras ya está registrado'); return }
    setSaving(true); setError(null)
    try {
      // 1. Upsert product
      const productPayload = {
        name: form.name.trim(),
        category: form.category || null,
        sale_type: form.sale_type,
        supplier_id: form.supplier_id || null,
      }
      let productId = variant?.product_id ?? ''
      if (variant?.product_id) {
        const { error: e } = await supabase.from('products').update(productPayload).eq('id', variant.product_id)
        if (e) throw e
      } else {
        const { data: existing } = await supabase.from('products').select('id').eq('name', form.name.trim()).maybeSingle()
        if (existing) {
          productId = existing.id
          const { error: e } = await supabase.from('products').update(productPayload).eq('id', productId)
          if (e) throw e
        } else {
          const { data: newProd, error: e } = await supabase.from('products').insert(productPayload).select('id').single()
          if (e) throw e
          if (!newProd) throw new Error('No se pudo crear el producto')
          productId = newProd.id
        }
      }

      // 2. Upsert variant
      const currentStock = variant?.stock ?? 0
      const addQty = parseFloat(form.qty_add) || 0
      // Convertir MM/AAAA → YYYY-MM-01
      let expiration_date: string | null = null
      const expRaw = form.expiration_month_year.trim()
      if (expRaw) {
        const [mm, yyyy] = expRaw.split('/')
        if (mm && yyyy && yyyy.length === 4) expiration_date = `${yyyy}-${mm.padStart(2, '0')}-01`
      }

      const variantPayload = {
        product_id: productId,
        barcode: form.barcode.trim(),
        cost_price: parseFloat(form.cost_price) || 0,
        sale_price: parseFloat(form.sale_price) || 0,
        wholesale_price: parseFloat(form.wholesale_price) || 0,
        stock: currentStock + addQty,
        min_stock: parseInt(form.min_stock) || 0,
        expiration_date,
      }
      if (variant) {
        const { error: e } = await supabase.from('product_variants').update(variantPayload).eq('id', variant.id)
        if (e) throw e
      } else {
        const { error: e } = await supabase.from('product_variants').insert(variantPayload)
        if (e) throw e
      }
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar. Verifica los datos e intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{variant ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button className="modal-close" onClick={onClose} disabled={saving}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">Código de barras *</label>
            <input
              className={`field-input ${barcodeExists ? 'field-input--error' : ''}`}
              value={form.barcode}
              onChange={e => set('barcode', e.target.value)}
              placeholder="0000000000000"
              autoFocus={!variant}
            />
            {barcodeChecking && <span className="field-hint">Verificando…</span>}
            {!barcodeChecking && barcodeExists && (
              <span className="field-hint field-hint--error">⚠ Ese código ya está registrado</span>
            )}
          </div>
          <div className="field">
            <label className="field-label">Tipo de venta</label>
            <select className="field-input" value={form.sale_type} onChange={e => set('sale_type', e.target.value as 'unidad' | 'paquete')}>
              <option value="unidad">Unidad</option>
              <option value="paquete">Paquete</option>
            </select>
          </div>
          <div className="field field--full">
            <label className="field-label">Nombre del producto *</label>
            <input className="field-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Marca - Producto (- Sabor)" />
          </div>
          <div className="field">
            <label className="field-label">Costo</label>
            <div className="price-input-wrap">
              <span className="price-prefix">$</span>
              <input className="field-input price-input" type="number" min="0" step="0.01" value={form.cost_price} onChange={e => set('cost_price', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Precio de venta</label>
            <div className="price-input-wrap">
              <span className="price-prefix">$</span>
              <input className="field-input price-input" type="number" min="0" step="0.01" value={form.sale_price} onChange={e => set('sale_price', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Precio de mayoreo</label>
            <div className="price-input-wrap">
              <span className="price-prefix">$</span>
              <input className="field-input price-input" type="number" min="0" step="0.01" value={form.wholesale_price} onChange={e => set('wholesale_price', e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Departamento</label>
            <select className="field-input" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">— Sin departamento —</option>
              {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Proveedor <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
            <select className="field-input" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
              <option value="">— Sin proveedor —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Cantidad a agregar</label>
            <input className="field-input" type="number" min="0" step="1" value={form.qty_add} onChange={e => set('qty_add', e.target.value)} placeholder="0" />
            {variant && <span className="field-hint">Stock actual: {variant.stock}</span>}
          </div>
          <div className="field">
            <label className="field-label">Existencia mínima</label>
            <input className="field-input" type="number" min="0" step="1" value={form.min_stock} onChange={e => set('min_stock', e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label className="field-label">Fecha de caducidad <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span></label>
            <input
              className="field-input"
              value={form.expiration_month_year}
              onChange={e => {
                let v = e.target.value.replace(/[^\d/]/g, '')
                // Auto-insertar / después de 2 dígitos
                if (v.length === 2 && !v.includes('/')) v = v + '/'
                if (v.length <= 7) set('expiration_month_year', v)
              }}
              placeholder="MM/AAAA"
              maxLength={7}
            />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProductosTab({ suppliers, departments }: { suppliers: Supplier[]; departments: Department[] }) {
  const supabase = createClient()
  const [variants, setVariants] = useState<ProductVariant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ProductVariant | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const [deleting, setDeleting] = useState<ProductVariant | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const PAGE = 1000
    let page = 0
    const all: ProductVariant[] = []
    while (true) {
      const { data } = await supabase
        .from('product_variants')
        .select('*, product:products(id, name, brand, category, sale_type, supplier_id, supplier:suppliers(id, name))')
        .eq('active', true)
        .range(page * PAGE, (page + 1) * PAGE - 1)
        .order('created_at', { ascending: false })
      if (!data || data.length === 0) break
      all.push(...(data as ProductVariant[]))
      if (data.length < PAGE) break
      page++
    }
    setVariants(all)
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = variants.filter(v => {
    const q = search.toLowerCase()
    return (
      v.barcode.toLowerCase().includes(q) ||
      (v.product?.name ?? '').toLowerCase().includes(q) ||
      (v.product?.category ?? '').toLowerCase().includes(q) ||
      (v.product?.supplier as unknown as Supplier | undefined)?.name?.toLowerCase().includes(q)
    )
  })

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    const { count } = await supabase.from('sale_items').select('id', { count: 'exact', head: true }).eq('variant_id', deleting.id)
    if (count && count > 0) {
      await supabase.from('product_variants').update({ active: false }).eq('id', deleting.id)
    } else {
      await supabase.from('product_variants').delete().eq('id', deleting.id)
    }
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  const stockBadge = (v: ProductVariant) => {
    if (v.stock <= 0) return { label: 'Sin stock', color: 'var(--danger)' }
    if (v.stock <= v.min_stock) return { label: `${v.stock}`, color: 'var(--warning)' }
    return { label: `${v.stock}`, color: 'var(--success)' }
  }

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="search-wrap">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, código, departamento…" />
        </div>
        <button className="btn btn--primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo producto
        </button>
      </div>

      <div className="table-meta">
        {loading ? 'Cargando…' : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`}
      </div>

      {loading ? (
        <div className="loading-state">Cargando productos…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No hay productos{search ? ' con ese filtro' : ' registrados'}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>P. Venta</th>
                <th>Costo</th>
                <th>Mayoreo</th>
                <th>Stock</th>
                <th>Depto.</th>
                <th>Proveedor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const badge = stockBadge(v)
                return (
                  <tr key={v.id}>
                    <td className="td-mono">{v.barcode}</td>
                    <td className="td-name">{v.product?.name ?? '—'}</td>
                    <td>
                      <span className="badge badge--type">
                        {v.product?.sale_type === 'paquete' ? 'Paquete' : 'Unidad'}
                      </span>
                    </td>
                    <td className="td-price">{fmt(v.sale_price)}</td>
                    <td className="td-muted">{fmt(v.cost_price)}</td>
                    <td className="td-muted">{fmt(v.wholesale_price)}</td>
                    <td>
                      <span className="badge" style={{ background: `${badge.color}22`, color: badge.color, borderColor: `${badge.color}44` }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="td-muted">{v.product?.category ?? '—'}</td>
                    <td className="td-muted">{(v.product?.supplier as unknown as Supplier | undefined)?.name ?? '—'}</td>
                    <td className="td-actions">
                      <button className="action-btn" title="Editar" onClick={() => { setEditing(v); setModalOpen(true) }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="action-btn action-btn--danger" title="Eliminar" onClick={() => setDeleting(v)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProductFormModal
          variant={editing}
          suppliers={suppliers}
          departments={departments}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            setModalOpen(false)
            setToast(editing ? 'Producto actualizado correctamente' : 'Producto registrado con éxito')
            load()
          }}
        />
      )}

      {toast && (
        <div className="toast toast--success">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          {toast}
        </div>
      )}
      {deleting && (
        <ConfirmModal
          title="Eliminar producto"
          message={`¿Eliminar "${deleting.product?.name ?? deleting.barcode}"? Si tiene ventas registradas se desactivará en lugar de borrarse.`}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   TAB: COMBOS
───────────────────────────────────────────── */
interface ComboComponent {
  variantId: string
  quantity: number
  label: string  // "Nombre producto"
}

function ComboFormModal({ combo, onClose, onSaved }: {
  combo: (Combo & { items: (ComboItem & { variant: ProductVariant })[] }) | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = createClient()
  const [name, setName] = useState(combo?.name ?? '')
  const [salePrice, setSalePrice] = useState(combo ? String(combo.sale_price) : '')
  const [components, setComponents] = useState<ComboComponent[]>(
    combo?.items?.map(i => ({
      variantId: i.variant_id,
      quantity: i.quantity,
      label: i.variant?.product?.name ?? i.variant?.barcode ?? i.variant_id,
    })) ?? []
  )
  const [varSearch, setVarSearch] = useState('')
  const [varResults, setVarResults] = useState<ProductVariant[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = varSearch.trim()
    if (q.length < 2) { setVarResults([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('product_variants')
        .select('*, product:products(id, name, category)')
        .eq('active', true)
        .or(`barcode.ilike.%${q}%,products.name.ilike.%${q}%`)
        .limit(10)
      setVarResults((data as ProductVariant[]) ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [varSearch, supabase])

  // ESC para cerrar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, saving])

  const addComponent = (v: ProductVariant) => {
    if (components.find(c => c.variantId === v.id)) return
    setComponents(prev => [...prev, {
      variantId: v.id,
      quantity: 1,
      label: v.product?.name ?? v.barcode,
    }])
    setVarSearch('')
    setVarResults([])
  }

  const removeComponent = (variantId: string) =>
    setComponents(prev => prev.filter(c => c.variantId !== variantId))

  const updateQty = (variantId: string, qty: number) =>
    setComponents(prev => prev.map(c => c.variantId === variantId ? { ...c, quantity: Math.max(1, qty) } : c))

  const handleSave = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    if (components.length < 2) { setError('Un combo debe tener al menos 2 productos'); return }
    setSaving(true); setError(null)
    try {
      let comboId = combo?.id ?? ''
      if (combo) {
        await supabase.from('combos').update({ name: name.trim(), sale_price: parseFloat(salePrice) || 0 }).eq('id', combo.id)
        await supabase.from('combo_items').delete().eq('combo_id', combo.id)
      } else {
        const { data, error: e } = await supabase.from('combos').insert({ name: name.trim(), sale_price: parseFloat(salePrice) || 0 }).select('id').single()
        if (e) throw e
        comboId = data.id
      }
      const items = components.map(c => ({ combo_id: comboId, variant_id: c.variantId, quantity: c.quantity }))
      const { error: e2 } = await supabase.from('combo_items').insert(items)
      if (e2) throw e2
      onSaved()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal modal--lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{combo ? 'Editar combo' : 'Nuevo combo'}</h2>
          <button className="modal-close" onClick={onClose} disabled={saving}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="form-grid">
          <div className="field field--wide">
            <label className="field-label">Nombre del combo *</label>
            <input className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Combo Proteína + Creatina" autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Precio de venta</label>
            <div className="price-input-wrap">
              <span className="price-prefix">$</span>
              <input className="field-input price-input" type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* Buscador de productos */}
        <div className="combo-section">
          <label className="field-label">Agregar productos al combo</label>
          <div className="search-wrap" style={{ position: 'relative' }}>
            <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="search-input"
              value={varSearch}
              onChange={e => setVarSearch(e.target.value)}
              placeholder="Buscar producto por nombre o código…"
            />
            {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 12 }}>Buscando…</span>}
          </div>
          {varResults.length > 0 && (
            <div className="var-results">
              {varResults.map(v => (
                <button key={v.id} className="var-result-item" onClick={() => addComponent(v)}>
                  <span className="var-result-name">{v.product?.name ?? v.barcode}</span>
                  <span className="var-result-meta">{v.barcode} · {fmt(v.sale_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lista de componentes */}
        {components.length > 0 && (
          <div className="combo-components">
            <label className="field-label" style={{ marginBottom: 8 }}>Componentes ({components.length})</label>
            {components.map(c => (
              <div key={c.variantId} className="component-row">
                <span className="component-name">{c.label}</span>
                <div className="component-qty">
                  <button className="qty-btn" onClick={() => updateQty(c.variantId, c.quantity - 1)}>−</button>
                  <span className="qty-val">{c.quantity}</span>
                  <button className="qty-btn" onClick={() => updateQty(c.variantId, c.quantity + 1)}>+</button>
                </div>
                <button className="action-btn action-btn--danger" onClick={() => removeComponent(c.variantId)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
        {components.length < 2 && (
          <p className="field-hint" style={{ marginTop: 8 }}>Se requieren mínimo 2 productos para formar un combo.</p>
        )}

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving || components.length < 2}>
            {saving ? 'Guardando…' : 'Guardar combo'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CombosTab() {
  const supabase = createClient()
  type ComboWithItems = Combo & { items: (ComboItem & { variant: ProductVariant })[] }
  const [combos, setCombos] = useState<ComboWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ComboWithItems | null>(null)
  const [deleting, setDeleting] = useState<ComboWithItems | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('combos')
      .select('*, items:combo_items(id, combo_id, variant_id, quantity, variant:product_variants(id, barcode, sale_price, product:products(id, name)))')
      .eq('active', true)
      .order('name')
    setCombos((data as ComboWithItems[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const filtered = combos.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    await supabase.from('combos').delete().eq('id', deleting.id)
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  return (
    <div className="tab-content">
      <div className="tab-toolbar">
        <div className="search-wrap">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar combo…" />
        </div>
        <button className="btn btn--primary" onClick={() => { setEditing(null); setModalOpen(true) }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuevo combo
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Cargando combos…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No hay combos{search ? ' con ese filtro' : ' registrados'}</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Productos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td className="td-name">{c.name}</td>
                  <td className="td-price">{fmt(c.sale_price)}</td>
                  <td>
                    <div className="combo-chips">
                      {(c.items ?? []).map(item => (
                        <span key={item.id} className="combo-chip">
                          {item.quantity}× {(item.variant as unknown as ProductVariant)?.product?.name ?? item.variant_id}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="td-actions">
                    <button className="action-btn" title="Editar" onClick={() => { setEditing(c); setModalOpen(true) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="action-btn action-btn--danger" title="Eliminar" onClick={() => setDeleting(c)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ComboFormModal
          combo={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load() }}
        />
      )}
      {deleting && (
        <ConfirmModal
          title="Eliminar combo"
          message={`¿Eliminar el combo "${deleting.name}"? Se eliminará permanentemente.`}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   TAB: DEPARTAMENTOS
───────────────────────────────────────────── */
function DepartamentosTab({ onDepartmentsChange }: { onDepartmentsChange: () => void }) {
  const supabase = createClient()
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('departments').select('*').eq('active', true).order('name')
    setDepartments((data as Department[]) ?? [])
    setLoading(false)
    onDepartmentsChange()
  }, [supabase, onDepartmentsChange])

  useEffect(() => { load() }, [load])

  const filtered = departments.filter(d => d.name.toLowerCase().includes(search.toLowerCase()))

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true); setError(null)
    const { error: e } = await supabase.from('departments').insert({ name })
    if (e) { setError(e.message.includes('unique') ? 'Ya existe un departamento con ese nombre' : e.message); setSaving(false); return }
    setNewName('')
    setSaving(false)
    load()
  }

  const handleUpdate = async (id: string) => {
    const name = editingName.trim()
    if (!name) return
    const { error: e } = await supabase.from('departments').update({ name }).eq('id', id)
    if (e) { setError(e.message.includes('unique') ? 'Ya existe un departamento con ese nombre' : e.message); return }
    setEditingId(null)
    load()
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    // Verificar si hay productos usando este departamento
    const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category', deleting.name)
    if (count && count > 0) {
      await supabase.from('departments').update({ active: false }).eq('id', deleting.id)
    } else {
      await supabase.from('departments').delete().eq('id', deleting.id)
    }
    setDeleting(null)
    setDeleteLoading(false)
    load()
  }

  return (
    <div className="tab-content">
      {/* Crear nuevo departamento */}
      <div className="dept-create-row">
        <div className="search-wrap" style={{ flex: 1, maxWidth: 360 }}>
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          <input
            className="search-input"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Nombre del nuevo departamento…"
          />
        </div>
        <button className="btn btn--primary" onClick={handleCreate} disabled={saving || !newName.trim()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {saving ? 'Creando…' : 'Crear departamento'}
        </button>
      </div>
      {error && <p className="form-error" style={{ marginBottom: 12 }}>{error}</p>}

      {/* Buscador */}
      <div className="tab-toolbar" style={{ marginBottom: 12 }}>
        <div className="search-wrap">
          <svg className="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input className="search-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar departamentos…" />
        </div>
        <span className="table-meta" style={{ marginBottom: 0 }}>{departments.length} departamento{departments.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="loading-state">Cargando departamentos…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No hay departamentos{search ? ' con ese filtro' : '. Crea el primero arriba.'}</div>
      ) : (
        <div className="dept-list">
          {filtered.map(d => (
            <div key={d.id} className="dept-row">
              {editingId === d.id ? (
                <>
                  <input
                    className="field-input dept-edit-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdate(d.id); if (e.key === 'Escape') setEditingId(null) }}
                    autoFocus
                  />
                  <button className="btn btn--primary" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => handleUpdate(d.id)}>Guardar</button>
                  <button className="btn btn--ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setEditingId(null)}>Cancelar</button>
                </>
              ) : (
                <>
                  <span className="dept-name">{d.name}</span>
                  <div className="td-actions">
                    <button className="action-btn" title="Renombrar" onClick={() => { setEditingId(d.id); setEditingName(d.name) }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="action-btn action-btn--danger" title="Eliminar" onClick={() => setDeleting(d)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {deleting && (
        <ConfirmModal
          title="Eliminar departamento"
          message={`¿Eliminar "${deleting.name}"? Si hay productos en este departamento se desactivará en lugar de borrarse.`}
          onClose={() => setDeleting(null)}
          onConfirm={handleDelete}
          loading={deleteLoading}
        />
      )}

      <style>{`
        .dept-create-row { display: flex; gap: 10px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
        .dept-list { display: flex; flex-direction: column; gap: 6px; }
        .dept-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          background: var(--bg-hover); border: 1px solid var(--border); border-radius: 8px;
          transition: border-color 0.15s;
        }
        .dept-row:hover { border-color: rgba(240,180,41,0.25); }
        .dept-name { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .dept-edit-input { flex: 1; }
      `}</style>
    </div>
  )
}

/* ─────────────────────────────────────────────
   PÁGINA PRINCIPAL
───────────────────────────────────────────── */
export default function ProductosPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<Tab>('productos')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [departments, setDepartments] = useState<Department[]>([])

  const loadSuppliers = useCallback(() => {
    supabase.from('suppliers').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setSuppliers((data as Supplier[]) ?? []))
  }, [supabase])

  const loadDepartments = useCallback(() => {
    supabase.from('departments').select('*').eq('active', true).order('name')
      .then(({ data }) => setDepartments((data as Department[]) ?? []))
  }, [supabase])

  useEffect(() => { loadSuppliers(); loadDepartments() }, [loadSuppliers, loadDepartments])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'productos', label: 'Productos' },
    { id: 'combos', label: 'Combos' },
    { id: 'proveedores', label: 'Proveedores' },
    { id: 'departamentos', label: 'Departamentos' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">Gestiona tu catálogo, combos, proveedores y departamentos</p>
        </div>
      </div>

      <div className="tabs-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'tab-btn--active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'productos' && <ProductosTab suppliers={suppliers} departments={departments} />}
      {activeTab === 'combos' && <CombosTab />}
      {activeTab === 'proveedores' && <ProveedoresTab />}
      {activeTab === 'departamentos' && <DepartamentosTab onDepartmentsChange={loadDepartments} />}

      <style>{`
        .page { display: flex; flex-direction: column; height: 100%; }

        .page-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          padding: 24px 28px 0; gap: 16px; flex-shrink: 0;
        }
        .page-title { font-family: var(--font-syne,sans-serif); font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0; }
        .page-subtitle { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }

        .tabs-bar {
          display: flex; gap: 4px; padding: 16px 28px 0; border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .tab-btn {
          padding: 8px 18px; border-radius: 8px 8px 0 0; border: 1px solid transparent;
          background: transparent; color: var(--text-secondary); font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; position: relative; bottom: -1px;
        }
        .tab-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
        .tab-btn--active {
          color: var(--accent); background: var(--bg-surface);
          border-color: var(--border) var(--border) var(--bg-surface);
          font-weight: 600;
        }

        .tab-content { flex: 1; overflow: auto; padding: 20px 28px 28px; }

        .tab-toolbar {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .table-meta { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }

        .search-wrap {
          position: relative; display: flex; align-items: center; flex: 1; min-width: 220px;
        }
        .search-icon { position: absolute; left: 11px; color: var(--text-muted); flex-shrink: 0; }
        .search-input {
          width: 100%; padding: 8px 12px 8px 34px; background: var(--bg-input);
          border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary);
          font-size: 13px; outline: none; transition: border-color 0.15s;
        }
        .search-input:focus { border-color: var(--accent); }

        .btn {
          display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
          border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer;
          border: none; transition: all 0.15s; white-space: nowrap; flex-shrink: 0;
        }
        .btn--primary { background: var(--accent); color: #000; }
        .btn--primary:hover { filter: brightness(1.1); }
        .btn--ghost { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
        .btn--ghost:hover { background: var(--bg-hover); color: var(--text-primary); }
        .btn--danger { background: var(--danger); color: #fff; }
        .btn--danger:hover { filter: brightness(1.1); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid var(--border); }
        .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .data-table th {
          padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600;
          color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase;
          background: var(--bg-hover); border-bottom: 1px solid var(--border); white-space: nowrap;
        }
        .data-table td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .data-table tr:last-child td { border-bottom: none; }
        .data-table tr:hover td { background: var(--bg-hover); }

        .td-name { color: var(--text-primary); font-weight: 500; }
        .td-mono { font-family: var(--font-mono, monospace); font-size: 12px; color: var(--text-secondary); }
        .td-price { font-family: var(--font-mono, monospace); color: var(--accent); font-weight: 600; }
        .td-muted { color: var(--text-muted); }
        .td-actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; }

        .action-btn {
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          background: var(--bg-hover); border: 1px solid var(--border); border-radius: 6px;
          color: var(--text-secondary); cursor: pointer; transition: all 0.15s;
        }
        .action-btn:hover { background: var(--bg-surface); color: var(--text-primary); }
        .action-btn--danger:hover { background: var(--danger-dim); border-color: rgba(239,68,68,0.4); color: var(--danger); }

        .badge {
          display: inline-flex; align-items: center; padding: 2px 8px;
          border-radius: 4px; font-size: 11px; font-weight: 600; border: 1px solid transparent;
        }
        .badge--type { background: rgba(240,180,41,0.12); color: var(--accent); border-color: rgba(240,180,41,0.25); }

        .combo-chips { display: flex; flex-wrap: wrap; gap: 4px; }
        .combo-chip {
          padding: 2px 8px; background: var(--bg-hover); border: 1px solid var(--border);
          border-radius: 4px; font-size: 11px; color: var(--text-secondary); white-space: nowrap;
        }

        .loading-state, .empty-state {
          padding: 60px 0; text-align: center; color: var(--text-muted); font-size: 14px;
        }

        /* Modals */
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px;
        }
        .modal {
          background: var(--bg-surface); border: 1px solid var(--border); border-radius: 14px;
          width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto;
          padding: 24px; display: flex; flex-direction: column; gap: 20px;
        }
        .modal--sm { max-width: 420px; }
        .modal--lg { max-width: 760px; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; }
        .modal-header h2 { font-size: 17px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .modal-close {
          width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
          background: transparent; border: 1px solid var(--border); border-radius: 6px;
          color: var(--text-muted); cursor: pointer; transition: all 0.15s;
        }
        .modal-close:hover { background: var(--danger-dim); color: var(--danger); }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }

        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .field { display: flex; flex-direction: column; gap: 5px; }
        .field--full { grid-column: 1 / -1; }
        .field--wide { grid-column: 1 / -1; }
        .field-label { font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase; }
        .field-hint { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
        .field-input {
          padding: 8px 10px; background: var(--bg-input); border: 1px solid var(--border);
          border-radius: 7px; color: var(--text-primary); font-size: 13px; outline: none;
          transition: border-color 0.15s; width: 100%; box-sizing: border-box;
        }
        .field-input:focus { border-color: var(--accent); }
        .field-textarea { resize: vertical; font-family: inherit; }
        select.field-input { cursor: pointer; }

        .price-input-wrap { position: relative; }
        .price-prefix {
          position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
          color: var(--text-muted); font-size: 13px; pointer-events: none;
        }
        .price-input { padding-left: 22px !important; }

        .form-error { color: var(--danger); font-size: 12px; margin: 0; }
        .field-input--error { border-color: var(--danger) !important; }
        .field-hint--error { color: var(--danger) !important; font-weight: 500; }

        /* Toast */
        .toast {
          position: fixed; bottom: 28px; right: 28px; z-index: 500;
          display: flex; align-items: center; gap: 10px;
          padding: 12px 18px; border-radius: 10px;
          font-size: 13px; font-weight: 500;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          animation: toast-in 0.25s ease;
        }
        .toast--success { background: var(--success, #10B981); color: #fff; }
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Combo builder */
        .combo-section { display: flex; flex-direction: column; gap: 8px; }
        .var-results {
          border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
          background: var(--bg-input); max-height: 200px; overflow-y: auto;
        }
        .var-result-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 12px; width: 100%; background: transparent; border: none;
          border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s;
          text-align: left;
        }
        .var-result-item:last-child { border-bottom: none; }
        .var-result-item:hover { background: var(--bg-hover); }
        .var-result-name { font-size: 13px; color: var(--text-primary); }
        .var-result-meta { font-size: 11px; color: var(--text-muted); }

        .combo-components { display: flex; flex-direction: column; gap: 6px; }
        .component-row {
          display: flex; align-items: center; gap: 10px; padding: 8px 12px;
          background: var(--bg-hover); border: 1px solid var(--border); border-radius: 8px;
        }
        .component-name { flex: 1; font-size: 13px; color: var(--text-primary); }
        .component-qty { display: flex; align-items: center; gap: 8px; }
        .qty-btn {
          width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
          background: var(--bg-surface); border: 1px solid var(--border); border-radius: 4px;
          color: var(--text-primary); cursor: pointer; font-size: 14px; font-weight: 600;
          transition: all 0.1s;
        }
        .qty-btn:hover { border-color: var(--accent); color: var(--accent); }
        .qty-val { min-width: 24px; text-align: center; font-size: 13px; font-weight: 600; color: var(--text-primary); }
      `}</style>
    </div>
  )
}
