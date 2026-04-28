'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { Customer, ProductVariant, SpecialOrder } from '@/types'
import { OrderTicketPreview, printOrderTicket, type OrderTicketData } from './OrderTicket'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface Props {
  order: SpecialOrder | 'new' | null
  onClose: () => void
  onSaved: (order: SpecialOrder, isNew: boolean) => void
}

export default function OrderModal({ order, onClose, onSaved }: Props) {
  const isNew = order === 'new'
  const editingOrder = typeof order === 'object' && order !== null ? order : null

  // ── Cliente ────────────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // ── Producto ───────────────────────────────────────────────────────────────
  const [useCustomProduct, setUseCustomProduct] = useState(false)
  const [productQuery, setProductQuery] = useState('')
  const [productResults, setProductResults] = useState<ProductVariant[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ProductVariant | null>(null)
  const [customProductName, setCustomProductName] = useState('')

  // ── Otros campos ───────────────────────────────────────────────────────────
  const [salePrice, setSalePrice] = useState('')
  const [estimatedDate, setEstimatedDate] = useState('')
  const [deposit, setDeposit] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ticketData, setTicketData] = useState<OrderTicketData | null>(null)
  const [savedResult, setSavedResult] = useState<SpecialOrder | null>(null)
  const [orderType, setOrderType] = useState<'order' | 'delivery'>('order')

  // Cargar datos en modo edición
  useEffect(() => {
    if (editingOrder) {
      loadCustomer(editingOrder.customer_id)
      if (editingOrder.product_id) {
        loadProduct(editingOrder.product_id)
        setUseCustomProduct(false)
      } else {
        setUseCustomProduct(true)
        setCustomProductName(editingOrder.product_name || '')
        setSelectedProduct(null)
      }
      setSalePrice(String(editingOrder.sale_price))
      setEstimatedDate(editingOrder.estimated_delivery_date ? toLocalDateStr(new Date(editingOrder.estimated_delivery_date)) : '')
      setDeposit(String(editingOrder.deposit))
      setNotes(editingOrder.notes || '')
      setOrderType(editingOrder.type === 'delivery' ? 'delivery' : 'order')
    } else {
      resetForm()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrder?.id])

  function resetForm() {
    setCustomerQuery('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setUseCustomProduct(false)
    setProductQuery('')
    setProductResults([])
    setSelectedProduct(null)
    setCustomProductName('')
    setSalePrice('')
    setEstimatedDate('')
    setDeposit('')
    setNotes('')
    setError(null)
    setTicketData(null)
    setSavedResult(null)
    setOrderType('order')
  }

  async function loadCustomer(customerId: string) {
    const supabase = createClient()
    const { data } = await (supabase as any)
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()
    if (data) {
      const c = data as Customer
      setSelectedCustomer(c)
      setCustomerQuery(c.full_name)
    }
  }

  async function loadProduct(productId: string) {
    const supabase = createClient()
    const { data: prod } = await (supabase as any)
      .from('product_variants')
      .select('id, product_id, barcode, flavor, sale_price, products(id, name, category)')
      .eq('id', productId)
      .single()
    if (prod) {
      const pv: ProductVariant = {
        id: String(prod.id),
        product_id: String(prod.product_id),
        barcode: String(prod.barcode ?? ''),
        flavor: prod.flavor ? String(prod.flavor) : null,
        sale_price: Number(prod.sale_price ?? 0),
        wholesale_price: 0,
        cost_price: 0,
        stock: 0,
        min_stock: 0,
        expiration_date: null,
        image_url: null,
        product: {
          id: String(prod.products?.id ?? prod.product_id),
          name: String(prod.products?.name ?? 'Sin nombre'),
          category: prod.products?.category ?? null,
        },
      }
      setSelectedProduct(pv)
      setProductQuery(`${pv.product.name}${pv.flavor ? ` — ${pv.flavor}` : ''}`)
    }
  }

  async function searchCustomers(q: string) {
    setCustomerQuery(q)
    if (q.trim().length < 2) { setCustomerResults([]); return }
    const supabase = createClient()
    const { data } = await (supabase as any)
      .from('customers')
      .select('*')
      .ilike('full_name', `%${q.trim()}%`)
      .limit(5)
    setCustomerResults((data ?? []) as Customer[])
  }

  function selectCustomer(c: Customer) {
    setSelectedCustomer(c)
    setCustomerQuery(c.full_name)
    setCustomerResults([])
  }

  function clearCustomer() {
    setSelectedCustomer(null)
    setCustomerQuery('')
    setCustomerResults([])
  }

  async function searchProducts(q: string) {
    setProductQuery(q)
    if (q.trim().length < 2) { setProductResults([]); return }
    const supabase = createClient()
    const like = `%${q.trim()}%`

    // Buscar variantes por barcode/flavor
    const { data: v1 } = await (supabase as any)
      .from('product_variants')
      .select('id, product_id, barcode, flavor, sale_price, products(id, name, category)')
      .or(`barcode.ilike.${like},flavor.ilike.${like}`)
      .limit(10)

    // Buscar productos por nombre
    const { data: prods } = await (supabase as any)
      .from('products')
      .select('id, name, category')
      .ilike('name', like)
      .limit(10)

    const seen = new Set<string>()
    const results: any[] = []

    for (const v of (v1 ?? [])) {
      const id = String(v.id)
      if (!seen.has(id)) {
        seen.add(id)
        results.push(v)
      }
    }

    const prodIds = (prods ?? []).map((p: any) => p.id).filter((id: string) => id)
    if (prodIds.length > 0) {
      const { data: v2 } = await (supabase as any)
        .from('product_variants')
        .select('id, product_id, barcode, flavor, sale_price, products(id, name, category)')
        .in('product_id', prodIds)
        .limit(20)
      for (const v of (v2 ?? [])) {
        const id = String(v.id)
        if (!seen.has(id)) {
          seen.add(id)
          results.push(v)
        }
      }
    }

    setProductResults(results.map((v: any) => ({
      id: String(v.id),
      product_id: String(v.product_id),
      barcode: String(v.barcode ?? ''),
      flavor: v.flavor ? String(v.flavor) : null,
      sale_price: Number(v.sale_price ?? 0),
      wholesale_price: 0,
      cost_price: 0,
      stock: 0,
      min_stock: 0,
      expiration_date: null,
      image_url: null,
      product: {
        id: String(v.products?.id ?? v.product_id),
        name: String(v.products?.name ?? 'Sin nombre'),
        category: v.products?.category ?? null,
      },
    })) as ProductVariant[])
  }

  function selectProduct(v: ProductVariant) {
    setSelectedProduct(v)
    setProductQuery(`${v.product.name}${v.flavor ? ` — ${v.flavor}` : ''}`)
    setProductResults([])
    // Sugerir precio si está vacío
    if (!salePrice) setSalePrice(String(v.sale_price))
  }

  function clearProduct() {
    setSelectedProduct(null)
    setProductQuery('')
    setProductResults([])
  }

  const priceNum = parseFloat(salePrice) || 0
  const depositNum = parseFloat(deposit) || 0
  const remaining = Math.max(0, priceNum - depositNum)

  async function handleSave() {
    if (!selectedCustomer) { setError('Selecciona un cliente.'); return }
    if (!useCustomProduct && !selectedProduct) { setError('Selecciona un producto o marca "Producto no registrado".'); return }
    if (useCustomProduct && !customProductName.trim()) { setError('Escribe el nombre del producto.'); return }
    if (priceNum <= 0) { setError('El precio de venta debe ser mayor a 0.'); return }
    if (depositNum < 0) { setError('El anticipo no puede ser negativo.'); return }
    if (depositNum > priceNum) { setError('El anticipo no puede ser mayor al precio de venta.'); return }

    setSaving(true)
    setError(null)
    const supabase = createClient()

    const payload = {
      customer_id: selectedCustomer.id,
      product_id: useCustomProduct ? null : selectedProduct?.id ?? null,
      product_name: useCustomProduct ? customProductName.trim() : null,
      sale_price: priceNum,
      type: orderType,
      estimated_delivery_date: estimatedDate || null,
      deposit: depositNum,
      notes: notes.trim() || null,
    }

    try {
      let result: SpecialOrder
      if (editingOrder) {
        const { data, error: err } = await (supabase as any)
          .from('special_orders')
          .update(payload)
          .eq('id', editingOrder.id)
          .select('*')
          .single()
        if (err) throw new Error(err.message)
        result = data as SpecialOrder
      } else {
        const { data, error: err } = await (supabase as any)
          .from('special_orders')
          .insert(payload)
          .select('*')
          .single()
        if (err) throw new Error(err.message)
        result = data as SpecialOrder
      }

      setSavedResult(result)

      // Si hay anticipo Y es encargo, mostrar opción de imprimir ticket
      if (depositNum > 0 && orderType === 'order') {
        setTicketData({
          customerName: selectedCustomer.full_name,
          productName: useCustomProduct ? customProductName.trim() : `${selectedProduct?.product.name}${selectedProduct?.flavor ? ` — ${selectedProduct.flavor}` : ''}`,
          salePrice: priceNum,
          deposit: depositNum,
          notes: notes.trim() || undefined,
          date: new Date(),
        })
      } else {
        onSaved(result, isNew)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al guardar el encargo.')
    } finally {
      setSaving(false)
    }
  }

  // ── Pantalla de éxito con ticket ──────────────────────────────────────────
  if (ticketData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.85)', overflowY: 'auto' }}>
        <div className="w-full rounded-2xl flex flex-col"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: '460px', margin: 'auto' }}>

          <div className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shrink-0"
              style={{ background: '#0D2B0D', border: '2px solid #4CAF50' }}>✓</div>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Encargo guardado</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Anticipo: <span className="font-mono font-bold" style={{ color: 'var(--accent)' }}>{fmt(ticketData.deposit)}</span>
              </p>
            </div>
          </div>

          <div className="p-4"><OrderTicketPreview data={ticketData} /></div>

          <div className="px-4 pb-4 flex flex-col gap-2">
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              ¿Deseas imprimir el comprobante de anticipo?
            </p>
            <div className="flex gap-2">
              <button onClick={() => {
                printOrderTicket(ticketData)
                if (savedResult) onSaved(savedResult, isNew)
              }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--accent)', color: '#000', border: '1px solid var(--accent)' }}>
                Imprimir ticket
              </button>
              <button onClick={() => {
                if (savedResult) onSaved(savedResult, isNew)
              }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                No imprimir
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
            {isNew ? 'Nuevo registro' : 'Editar registro'}
          </p>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Tipo de registro <span style={{ color: '#FF6B6B' }}>*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType('order')}
                className="py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1"
                style={{
                  background: orderType === 'order' ? 'var(--accent)' : 'var(--bg)',
                  color: orderType === 'order' ? '#000' : 'var(--text-muted)',
                  border: `1px solid ${orderType === 'order' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <span>📋</span> Encargo
              </button>
              <button
                type="button"
                onClick={() => setOrderType('delivery')}
                className="py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1"
                style={{
                  background: orderType === 'delivery' ? 'var(--accent)' : 'var(--bg)',
                  color: orderType === 'delivery' ? '#000' : 'var(--text-muted)',
                  border: `1px solid ${orderType === 'delivery' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <span>🚚</span> Envío a domicilio
              </button>
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Cliente <span style={{ color: '#FF6B6B' }}>*</span>
            </label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{selectedCustomer.full_name}</p>
                  {selectedCustomer.phone && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{selectedCustomer.phone}</p>
                  )}
                </div>
                <button onClick={clearCustomer}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>✕</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={customerQuery}
                  onChange={e => searchCustomers(e.target.value)}
                  placeholder="Buscar cliente por nombre…"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; setTimeout(() => setCustomerResults([]), 150) }}
                />
                {customerResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    {customerResults.map(c => (
                      <button key={c.id} onMouseDown={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 text-sm"
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                        <span className="font-semibold">{c.full_name}</span>
                        {c.phone && <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>{c.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Producto */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Producto <span style={{ color: '#FF6B6B' }}>*</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <div
                  onClick={() => { setUseCustomProduct(v => !v); clearProduct(); setCustomProductName('') }}
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all"
                  style={{
                    background: useCustomProduct ? 'var(--accent)' : 'var(--bg)',
                    border: `2px solid ${useCustomProduct ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  {useCustomProduct && (
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-xs" style={{ color: useCustomProduct ? 'var(--text)' : 'var(--text-muted)' }}>
                  No registrado
                </span>
              </label>
            </div>

            {useCustomProduct ? (
              <input
                type="text"
                value={customProductName}
                onChange={e => setCustomProductName(e.target.value)}
                placeholder="Escribe el nombre del producto…"
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            ) : selectedProduct ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg)', border: '1px solid var(--accent)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    {selectedProduct.product.name}{selectedProduct.flavor ? ` — ${selectedProduct.flavor}` : ''}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Cód: {selectedProduct.barcode} · Precio: {fmt(selectedProduct.sale_price)}
                  </p>
                </div>
                <button onClick={clearProduct}
                  className="w-6 h-6 rounded flex items-center justify-center text-xs"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>✕</button>
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={productQuery}
                  onChange={e => searchProducts(e.target.value)}
                  placeholder="Buscar por nombre, sabor o código…"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; setTimeout(() => setProductResults([]), 150) }}
                />
                {productResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-10"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '220px', overflowY: 'auto' }}>
                    {productResults.map(v => (
                      <button key={v.id} onMouseDown={() => selectProduct(v)}
                        className="w-full text-left px-3 py-2.5 text-sm"
                        style={{ borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                        <span className="font-semibold">{v.product.name}</span>
                        {v.flavor && <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>— {v.flavor}</span>}
                        <span className="text-xs ml-2 font-mono" style={{ color: 'var(--accent)' }}>{fmt(v.sale_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Precio de venta */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Precio de venta pactado <span style={{ color: '#FF6B6B' }}>*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={salePrice}
                onChange={e => setSalePrice(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>

          {/* Fecha estimada */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Fecha estimada de entrega
            </label>
            <input
              type="date"
              value={estimatedDate}
              onChange={e => setEstimatedDate(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Anticipo */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Anticipo
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: 'var(--text-muted)' }}>$</span>
              <input
                type="number" min="0" step="0.01"
                value={deposit}
                onChange={e => setDeposit(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-lg pl-8 pr-4 py-2.5 text-sm outline-none font-mono"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
            {priceNum > 0 && (
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Restante:{' '}
                <strong style={{ color: remaining > 0 ? 'var(--text)' : '#4CAF50' }}>
                  {remaining > 0 ? fmt(remaining) : 'Liquidado ✓'}
                </strong>
              </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-muted)' }}>
              Notas <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalles del encargo…"
              rows={2}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {error && <p className="text-xs" style={{ color: '#FF6B6B' }}>{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#000' }}>
            {saving ? 'Guardando…' : isNew ? 'Guardar encargo' : 'Actualizar encargo'}
          </button>
        </div>
      </div>
    </div>
  )
}
