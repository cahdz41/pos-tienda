'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

export interface OrderNotification {
  id: string
  orderId: string
  customerName: string
  customerPhone: string
  notes: string | null
  total: number
  receivedAt: Date
}

interface ContextValue {
  notifications: OrderNotification[]
  dismiss: (id: string) => void
}

const Ctx = createContext<ContextValue>({ notifications: [], dismiss: () => {} })

export function NewOrderNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<OrderNotification[]>([])

  const dismiss = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('store-orders-new')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'store_orders' },
        (payload) => {
          const row = payload.new as {
            id: string
            customer_name: string
            customer_phone: string
            notes: string | null
            total: number
          }
          setNotifications(prev => [
            {
              id: crypto.randomUUID(),
              orderId: row.id,
              customerName: row.customer_name,
              customerPhone: row.customer_phone,
              notes: row.notes,
              total: row.total,
              receivedAt: new Date(),
            },
            ...prev,
          ])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return <Ctx.Provider value={{ notifications, dismiss }}>{children}</Ctx.Provider>
}

export function useNewOrderNotifications() {
  return useContext(Ctx)
}
