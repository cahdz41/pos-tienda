'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import ProductPanel from './ProductPanel'
import CartPanel from './CartPanel'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CartItem, ProductVariant, Shift } from '@/types'

export default function PosPage() {
  const { user, loading: authLoading } = useAuth()
  const [cart, setCart] = useState<CartItem[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  // Turno activo — undefined = cargando, null = sin turno, Shift = turno abierto
  const [activeShift, setActiveShift] = useState<Shift | null | undefined>(undefined)

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

  const addToCart = useCallback((variant: ProductVariant) => {
    setCart(prev => {
      const existing = prev.find(i => i.variant.id === variant.id)
      if (existing) {
        return prev.map(i =>
          i.variant.id === variant.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { variant, quantity: 1, unitPrice: variant.sale_price }]
    })
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

  function handlePay() {
    // Fase 5: PaymentModal
    alert('Pagos — Fase 5 próximamente')
  }

  return (
    <div className="flex h-full relative" onClick={() => searchRef.current?.focus()}>
      <ProductPanel cart={cart} onAdd={addToCart} searchRef={searchRef} />
      <CartPanel
        cart={cart}
        onAdd={addToCart}
        onRemoveOne={removeOne}
        onRemoveAll={removeAll}
        onClear={clearCart}
        onPay={handlePay}
      />

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
