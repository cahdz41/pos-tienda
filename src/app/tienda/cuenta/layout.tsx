'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStoreAuth } from '@/contexts/StoreAuthContext'

export default function CuentaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useStoreAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/tienda/auth/login')
    }
  }, [user, loading, router])

  // Mientras carga, mostrar pantalla neutral para evitar flash
  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          border: '2px solid #F0B429', borderTopColor: 'transparent',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
