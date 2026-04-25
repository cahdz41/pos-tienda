'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import ProductPanel from './ProductPanel'
import CartPanel from './CartPanel'
import PaymentModal from './PaymentModal'
import VoidSaleModal from './VoidSaleModal'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CartItem, HeldTicket, ProductVariant, Shift } from '@/types'

const HOLDS_KEY = 'pos_holds'
const CART_KEY  = 'pos_cart'

function formatElapsed(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1)  return 'Hace un momento'
  if (mins < 60) return `Hace ${mins} min`
  return `Hace ${Math.floor(mins / 60)}h`
}

export default function PosPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  // Cart persistente — lazy initializer para no perder el ticket activo al recargar
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(CART_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  const searchRef = useRef<HTMLInputElement>(null)

  // Turno activo
  const [activeShift, setActiveShift] = useState<Shift | null | undefined>(undefined)
  // Modales
  const [showPayment, setShowPayment] = useState(false)
  const [showVoid, setShowVoid]       = useState(false)
  const [showHolds, setShowHolds]     = useState(false)
  // Alerta de stock insuficiente
  const [stockAlertVariant, setStockAlertVariant] = useState<ProductVariant | null>(null)
  // Refresh del panel de productos
  const [refreshKey, setRefreshKey]   = useState(0)

  // ── Venta en espera ──────────────────────────────────────────────────────
  // holdCounter DEBE estar antes del useState para que el lazy initializer lo acceda
  const holdCounter = useRef(0)

  // Lazy initializer: lee localStorage una sola vez en el mount, sin condición de carrera
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = localStorage.getItem(HOLDS_KEY)
      if (!saved) return []
      const parsed: HeldTicket[] = JSON.parse(saved)
      holdCounter.current = parsed.reduce((max, h) => Math.max(max, h.id), 0)
      return parsed
    } catch { return [] }
  })

  // Persistir holds cuando cambian
  useEffect(() => {
    localStorage.setItem(HOLDS_KEY, JSON.stringify(heldTickets))
  }, [heldTickets])

  // Persistir cart activo cuando cambia
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart))
  }, [cart])

  // Modal de nombre al poner en espera
  const [holdNameMode, setHoldNameMode] = useState(false)
  const [holdNameInput, setHoldNameInput] = useState('')

  // Cargar turno activo
  useEffect(() => {
    if (authLoading || !user) return
    const supabase = createClient()
    supabase
      .from('shifts')
      .select('*')
      .eq('status', 'open')
      .maybeSingle()
      .then(({ data }) => setActiveShift(data as Shift | null))
  }, [authLoading, user])

  // ── Carrito ──────────────────────────────────────────────────────────────

  const addToCart = useCallback(async (variant: ProductVariant): Promise<boolean> => {
    // Consultar stock real en Supabase para evitar datos desactualizados
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    const { data } = await supabase
      .from('product_variants')
      .select('stock')
      .eq('id', variant.id)
      .single()
    const freshStock = Number(data?.stock ?? variant.stock)

    let added = false
    setCart(prev => {
      const existing = prev.find(i => i.variant.id === variant.id)
      if (existing) {
        if (existing.quantity + 1 > freshStock) {
          setStockAlertVariant({ ...variant, stock: freshStock })
          return prev
        }
        added = true
        return prev.map(i =>
          i.variant.id === variant.id
            ? { ...i, quantity: i.quantity + 1, variant: { ...i.variant, stock: freshStock } }
            : i
        )
      }
      if (freshStock <= 0) {
        setStockAlertVariant({ ...variant, stock: freshStock })
        return prev
      }
      added = true
      return [...prev, { variant: { ...variant, stock: freshStock }, quantity: 1, unitPrice: variant.sale_price, useWholesale: false }]
    })
    return added
  }, [])

  const removeOne = useCallback((variantId: string) => {
    setCart(prev =>
      prev.map(i => i.variant.id === variantId ? { ...i, quantity: i.quantity - 1 } : i)
        .filter(i => i.quantity > 0)
    )
  }, [])

  const removeAll = useCallback((variantId: string) => {
    setCart(prev => prev.filter(i => i.variant.id !== variantId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  // ── Precio personalizado ─────────────────────────────────────────────────

  const setPriceOverride = useCallback((variantId: string, price: number) => {
    setCart(prev => prev.map(item =>
      item.variant.id === variantId
        ? { ...item, unitPrice: price, useWholesale: false }
        : item
    ))
  }, [])

  // ── Mayoreo (8.4) ────────────────────────────────────────────────────────

  const toggleWholesale = useCallback((variantId: string) => {
    setCart(prev => prev.map(item => {
      if (item.variant.id !== variantId) return item
      const nowWholesale = !item.useWholesale
      return {
        ...item,
        useWholesale: nowWholesale,
        unitPrice: nowWholesale ? item.variant.wholesale_price : item.variant.sale_price,
      }
    }))
  }, [])

  // ── Holds (8.1) ──────────────────────────────────────────────────────────

  function holdCart() {
    if (cart.length === 0) return
    setHoldNameInput('')
    setHoldNameMode(true)
  }

  function confirmHold() {
    if (cart.length === 0) return
    holdCounter.current += 1
    const label = holdNameInput.trim() || `Ticket #${holdCounter.current}`
    setHeldTickets(prev => [...prev, {
      id:      holdCounter.current,
      label,
      cart:    [...cart],
      savedAt: Date.now(),
    }])
    clearCart()
    setHoldNameMode(false)
    setHoldNameInput('')
  }

  function recallTicket(id: number) {
    const ticket = heldTickets.find(h => h.id === id)
    if (!ticket) return

    if (cart.length > 0) {
      // Poner el carrito activo en espera antes de recuperar
      holdCounter.current += 1
      const heldCurrent: HeldTicket = {
        id:      holdCounter.current,
        label:   `Ticket #${holdCounter.current}`,
        cart:    [...cart],
        savedAt: Date.now(),
      }
      setHeldTickets(prev => [...prev.filter(h => h.id !== id), heldCurrent])
    } else {
      setHeldTickets(prev => prev.filter(h => h.id !== id))
    }

    setCart(ticket.cart)
    setShowHolds(false)
  }

  function deleteHeld(id: number) {
    setHeldTickets(prev => prev.filter(h => h.id !== id))
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handlePay() {
    if (activeShift) setShowPayment(true)
  }

  function handleVoided() {
    setRefreshKey(k => k + 1)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full relative"
      onClick={() => { if (!showPayment && !showVoid && !showHolds && !holdNameMode) searchRef.current?.focus() }}>

      <ProductPanel cart={cart} onAdd={addToCart} searchRef={searchRef} refreshKey={refreshKey} />

      <CartPanel
        cart={cart}
        onAdd={addToCart}
        onRemoveOne={removeOne}
        onRemoveAll={removeAll}
        onClear={clearCart}
        onPay={handlePay}
        onToggleWholesale={toggleWholesale}
        onPriceChange={setPriceOverride}
        onHold={holdCart}
        onShowHolds={() => setShowHolds(true)}
        heldCount={heldTickets.length}
        onVoid={() => setShowVoid(true)}
        searchRef={searchRef}
      />

      {/* Modal de pago */}
      {showPayment && activeShift && (
        <PaymentModal
          cart={cart}
          total={cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)}
          activeShift={activeShift}
          onSuccess={() => { clearCart(); setRefreshKey(k => k + 1) }}
          onClose={() => setShowPayment(false)}
        />
      )}

      {/* Modal de anulación */}
      {showVoid && (
        <VoidSaleModal
          onClose={() => setShowVoid(false)}
          onVoided={handleVoided}
        />
      )}

      {/* Modal: nombre del ticket en espera */}
      {holdNameMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setHoldNameMode(false) }}>
          <div className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Nombre del ticket</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Para identificar este ticket en espera
              </p>
            </div>
            <input
              autoFocus
              type="text"
              value={holdNameInput}
              onChange={e => setHoldNameInput(e.target.value)}
              placeholder={`Ticket #${holdCounter.current + 1}`}
              maxLength={40}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter') confirmHold()
                if (e.key === 'Escape') setHoldNameMode(false)
              }}
              className="rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text)' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setHoldNameMode(false)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button
                onClick={confirmHold}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{ background: 'var(--accent)', color: '#000' }}>
                Poner en espera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel de tickets en espera */}
      {showHolds && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowHolds(false) }}
        >
          <div
            className="w-72 h-full flex flex-col"
            style={{ background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Tickets en espera</p>
                {heldTickets.length > 0 && (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {heldTickets.length} ticket{heldTickets.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setShowHolds(false)}
                style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>
                ×
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
              {heldTickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <span style={{ fontSize: '28px' }}>⏸</span>
                  <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                    No hay tickets en espera
                  </p>
                </div>
              ) : (
                heldTickets.map(ht => {
                  const htTotal = ht.cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
                  return (
                    <div key={ht.id} className="rounded-xl p-3"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold" style={{ color: 'var(--text)' }}>{ht.label}</p>
                        <button onClick={() => deleteHeld(ht.id)}
                          className="text-xs w-5 h-5 rounded flex items-center justify-center"
                          style={{ color: '#FF6B6B', background: '#2D1010' }}>
                          ✕
                        </button>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {ht.cart.length} producto{ht.cart.length > 1 ? 's' : ''} —{' '}
                        <span style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>
                          ${htTotal.toLocaleString('es-MX')}
                        </span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                        {formatElapsed(ht.savedAt)}
                      </p>
                      <button
                        onClick={() => recallTicket(ht.id)}
                        className="w-full mt-2 py-1.5 rounded-lg text-xs font-bold"
                        style={{ background: 'var(--accent)', color: '#000' }}
                      >
                        Recuperar
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: stock insuficiente */}
      {stockAlertVariant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={e => { if (e.target === e.currentTarget) setStockAlertVariant(null) }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Stock insuficiente</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {stockAlertVariant.product?.name}
                  {stockAlertVariant.flavor ? ` — ${stockAlertVariant.flavor}` : ''}
                </p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Solo hay <strong style={{ color: '#F0B429' }}>{stockAlertVariant.stock}</strong> unidad{stockAlertVariant.stock === 1 ? '' : 'es'} disponible{stockAlertVariant.stock === 1 ? '' : 's'}.
              ¿Quieres agregar más stock a este producto?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setStockAlertVariant(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                No
              </button>
              <button
                onClick={() => {
                  const barcode = stockAlertVariant.barcode
                  setStockAlertVariant(null)
                  router.push(`/inventario?ajustar=${encodeURIComponent(barcode)}`)
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'var(--accent)', color: '#000' }}>
                Sí, ir a inventario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Guard: sin turno activo */}
      {(authLoading || activeShift === undefined) ? null : activeShift === null && (
        <div className="absolute inset-0 z-40 flex items-center justify-center"
          style={{ background: 'rgba(13,13,18,0.92)', backdropFilter: 'blur(4px)' }}>
          <div className="flex flex-col items-center gap-4 text-center p-6 rounded-2xl max-w-xs"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'var(--bg)' }}>
              ⏰
            </div>
            <div>
              <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Sin turno activo</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Abre un turno antes de realizar ventas
              </p>
            </div>
            <Link href="/turnos"
              className="w-full py-2.5 rounded-xl text-sm font-bold text-center"
              style={{ background: 'var(--accent)', color: '#000' }}>
              Ir a Turnos
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
