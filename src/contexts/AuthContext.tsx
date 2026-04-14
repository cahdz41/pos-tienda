'use client'
// REGLA: onAuthStateChange maneja TODO.
// Si la sesión existe en localStorage, dispara INITIAL_SESSION automáticamente.
// Funciona al regresar de standby sin código adicional.
// NO getSession() manual. NO timers. NO polling.

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

// Carga el profile con timeout — nunca deja colgado el spinner
async function fetchProfile(userId: string): Promise<Profile | null> {
  const supabase = createClient()

  const queryPromise = supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  const timeoutPromise = new Promise<{ data: null; error: Error }>(resolve =>
    setTimeout(() => resolve({ data: null, error: new Error('timeout') }), 15000)
  )

  const { data, error } = await Promise.race([queryPromise, timeoutPromise])
  if (error) {
    console.error('[AuthContext] Profile error:', error.message ?? error)
    return null
  }
  if (!data) return null

  // Mapeo flexible — funciona con cualquier nombre de columna para el nombre
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = data as any
  return {
    id:   String(raw.id),
    name: String(raw.name ?? raw.full_name ?? raw.nombre ?? raw.display_name ?? ''),
    role: (raw.role as 'owner' | 'cashier') ?? 'cashier',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)

        // IMPORTANTE: no hacer await aquí directamente.
        // Supabase sostiene su lock interno (_initialize) mientras notifica
        // suscriptores. Cualquier query de BD llama getSession() que espera
        // ese mismo lock → deadlock. setTimeout(0) rompe el ciclo ejecutando
        // el fetch en una nueva task, después de que el lock se libera.
        setTimeout(async () => {
          try {
            if (currentUser) {
              const p = await fetchProfile(currentUser.id)
              setProfile(p)
            } else {
              setProfile(null)
            }
          } catch (e) {
            console.error('[AuthContext] Error inesperado:', e)
          } finally {
            setLoading(false)
          }
        }, 0)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
