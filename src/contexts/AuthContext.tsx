'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { type User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { type Profile } from '@/types'

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }, [supabase])

  useEffect(() => {
    const initAuth = async () => {
      try {
        let { data: { session } } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('auth-timeout')), 8_000)
          ),
        ])
        // Con autoRefreshToken desactivado, el token puede estar vencido al montar.
        // Lo refrescamos manualmente si expiresAt ya pasó.
        if (session && session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
          const { data: refreshed } = await supabase.auth.refreshSession().catch(() => ({ data: { session: null } }))
          session = refreshed.session
        }
        setUser(session?.user ?? null)
        if (session?.user) await fetchProfile(session.user.id)
      } catch (e: unknown) {
        if (e instanceof Error && e.message === 'auth-timeout') {
          window.location.reload()
          return
        }
        setUser(null)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (_event: any, session: any) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
        } else {
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, fetchProfile])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
