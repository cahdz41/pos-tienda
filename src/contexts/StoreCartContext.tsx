'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export interface StoreCartItem {
  variantId: string
  productId: string
  productName: string
  flavor: string | null
  price: number
  quantity: number
  imageUrl: string | null
  // Ofertas del mes
  offerId?: number
  // Paquetes
  packageId?: number
  packageName?: string
  originalPrice?: number   // precio normal del producto (para mostrar tachado)
}

interface StoreCartContextType {
  items: StoreCartItem[]
  itemCount: number
  total: number
  isOpen: boolean
  openCart: () => void
  closeCart: () => void
  addItem: (item: Omit<StoreCartItem, 'quantity'>) => void
  addPackageItems: (items: Omit<StoreCartItem, 'quantity'>[], packageId: number, packageName: string, packagePrice: number) => void
  removeItem: (variantId: string) => void
  updateQuantity: (variantId: string, quantity: number) => void
  clearCart: () => void
}

const StoreCartContext = createContext<StoreCartContextType | null>(null)

const CART_KEY = 'store_cart'

export function StoreCartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<StoreCartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_KEY)
      if (saved) setItems(JSON.parse(saved))
    } catch { /* ignore */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(CART_KEY, JSON.stringify(items))
  }, [items, hydrated])

  const addItem = useCallback((newItem: Omit<StoreCartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.variantId === newItem.variantId && !i.packageId)
      if (existing && !newItem.packageId) {
        return prev.map(i =>
          i.variantId === newItem.variantId && !i.packageId ? { ...i, quantity: i.quantity + 1 } : i
        )
      }
      return [...prev, { ...newItem, quantity: 1 }]
    })
    setIsOpen(true)
  }, [])

  const addPackageItems = useCallback((
    packageItems: Omit<StoreCartItem, 'quantity'>[],
    packageId: number,
    packageName: string,
    packagePrice: number,
  ) => {
    setItems(prev => {
      // Eliminar items previos del mismo paquete si existen
      const cleaned = prev.filter(i => i.packageId !== packageId)

      // Calcular precios proporcionales
      const totalNormal = packageItems.reduce((sum, it) => sum + (it.originalPrice ?? it.price), 0)
      let remaining = packagePrice

      const pricedItems = packageItems.map((it, idx) => {
        const normalPrice = it.originalPrice ?? it.price
        let proportionalPrice: number
        if (idx === packageItems.length - 1) {
          // Último item absorbe el redondeo
          proportionalPrice = Math.max(0, remaining)
        } else {
          proportionalPrice = totalNormal > 0
            ? Math.round((normalPrice / totalNormal) * packagePrice * 100) / 100
            : 0
          remaining -= proportionalPrice
        }
        return {
          ...it,
          quantity: 1,
          price: proportionalPrice,
          packageId,
          packageName,
        }
      })

      return [...cleaned, ...pricedItems]
    })
    setIsOpen(true)
  }, [])

  const removeItem = useCallback((variantId: string) => {
    setItems(prev => {
      const target = prev.find(i => i.variantId === variantId)
      // Si es parte de un paquete, eliminar todo el paquete
      if (target?.packageId) {
        return prev.filter(i => i.packageId !== target.packageId)
      }
      return prev.filter(i => i.variantId !== variantId)
    })
  }, [])

  const updateQuantity = useCallback((variantId: string, quantity: number) => {
    setItems(prev => {
      const target = prev.find(i => i.variantId === variantId)
      // No permitir cambiar cantidad individual de items en paquete
      if (target?.packageId) {
        return prev
      }
      if (quantity <= 0) {
        return prev.filter(i => i.variantId !== variantId)
      }
      return prev.map(i => i.variantId === variantId ? { ...i, quantity } : i)
    })
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0)

  return (
    <StoreCartContext.Provider value={{
      items, itemCount, total, isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem, addPackageItems, removeItem, updateQuantity, clearCart,
    }}>
      {children}
    </StoreCartContext.Provider>
  )
}

export function useStoreCart() {
  const ctx = useContext(StoreCartContext)
  if (!ctx) throw new Error('useStoreCart must be used within StoreCartProvider')
  return ctx
}
