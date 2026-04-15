'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { User } from '@supabase/supabase-js'
import { getStoreSupabase } from '@/lib/supabase-store'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface StoreCustomer {
  id: string
  full_name: string
  phone: string | null
  email: string
}

interface StoreAuthContextValue {
  user: User | null
  customer: StoreCustomer | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

// ── Contexto ─────────────────────────────────────────────────────────────────

const StoreAuthContext = createContext<StoreAuthContextValue>({
  user: null,
  customer: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

// ── Provider ─────────────────────────────────────────────────────────────────

export function StoreAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]         = useState<User | null>(null)
  const [customer, setCustomer] = useState<StoreCustomer | null>(null)
  const [loading, setLoading]   = useState(true)

  const supabase = getStoreSupabase()

  const loadCustomer = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('store_customers')
      .select('id, full_name, phone, email')
      .eq('id', userId)
      .single()
    setCustomer(data ?? null)
  }, [supabase])

  useEffect(() => {
    // Sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Diferir query async para evitar deadlock en el lock de Supabase
        setTimeout(() => loadCustomer(session.user.id), 0)
      }
      setLoading(false)
    })

    // Cambios de auth — callback DEBE ser síncrono
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        setTimeout(() => loadCustomer(session.user.id), 0)
      } else {
        setCustomer(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [supabase, loadCustomer])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setCustomer(null)
  }

  return (
    <StoreAuthContext.Provider value={{ user, customer, loading, signIn, signOut }}>
      {children}
    </StoreAuthContext.Provider>
  )
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export const useStoreAuth = () => useContext(StoreAuthContext)
