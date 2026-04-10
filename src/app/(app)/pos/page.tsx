'use client'

import { useRef, useState, useCallback } from 'react'
import ProductPanel from './ProductPanel'
import CartPanel from './CartPanel'
import type { CartItem, ProductVariant } from '@/types'

export default function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const addToCart = useCallback((variant: ProductVariant) => {
    setCart(prev => {
      const existing = prev.find(i => i.variant.id === variant.id)
      if (existing) {
        return prev.map(i =>
          i.variant.id === variant.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, { variant, quantity: 1, unitPrice: variant.sale_price }]
    })
  }, [])

  const removeOne = useCallback((variantId: number) => {
    setCart(prev =>
      prev
        .map(i => i.variant.id === variantId ? { ...i, quantity: i.quantity - 1 } : i)
        .filter(i => i.quantity > 0)
    )
  }, [])

  const removeAll = useCallback((variantId: number) => {
    setCart(prev => prev.filter(i => i.variant.id !== variantId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  function handlePay() {
    // Fase 5: PaymentModal
    alert('Pagos — Fase 5 próximamente')
  }

  return (
    <div
      className="flex h-full"
      onClick={() => searchRef.current?.focus()}
    >
      <ProductPanel
        cart={cart}
        onAdd={addToCart}
        searchRef={searchRef}
      />
      <CartPanel
        cart={cart}
        onAdd={addToCart}
        onRemoveOne={removeOne}
        onRemoveAll={removeAll}
        onClear={clearCart}
        onPay={handlePay}
      />
    </div>
  )
}
