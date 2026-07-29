'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import type { Offer, Package } from '@/types'
import TabOfertas from './TabOfertas'
import TabPaquetes from './TabPaquetes'
import TabGenerador from './TabGenerador'

type Tab = 'ofertas' | 'paquetes' | 'generador'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'ofertas',    label: 'Ofertas del Mes',   icon: '🔥' },
  { id: 'paquetes',   label: 'Paquetes en Oferta', icon: '🎁' },
  { id: 'generador',  label: 'Generador',          icon: '🎨' },
]

export default function ConfigTiendaPage() {
  const { profile } = useAuth()
  const router = useRouter()

  const [tab,      setTab]      = useState<Tab>('ofertas')
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    if (profile && profile.role !== 'owner') router.replace('/pos')
  }, [profile, router])

  useEffect(() => {
    async function load() {
      try {
        const [r1, r2] = await Promise.all([
          fetch('/api/ofertas', { cache: 'no-store' }).then(r => r.json()),
          fetch('/api/paquetes', { cache: 'no-store' }).then(r => r.json()),
        ])
        setOffers(Array.isArray(r1) ? r1 : [])
        setPackages(Array.isArray(r2) ? r2 : [])
      } catch {
        setError('Error cargando datos. Recarga la página.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, height: '100%' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid var(--accent)',
          borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: '#FF6B6B', fontSize: 13 }}>{error}</p>
      </div>
    )
  }

  const ofertasActivas  = offers.length
  const paquetesActivos = packages.filter(p => p.activo).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>
          Configuración Tienda
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 20px' }}>
          {ofertasActivas} oferta{ofertasActivas !== 1 ? 's' : ''} · {paquetesActivos} paquete{paquetesActivos !== 1 ? 's' : ''} activo{paquetesActivos !== 1 ? 's' : ''}
        </p>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)',
                marginBottom: -1,
                transition: 'color 0.15s' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 24px' }}>
        {tab === 'ofertas' && (
          <TabOfertas offers={offers} onOffersChange={setOffers} />
        )}
        {tab === 'paquetes' && (
          <TabPaquetes packages={packages} onPackagesChange={setPackages} />
        )}
        {tab === 'generador' && (
          <TabGenerador />
        )}
      </div>
    </div>
  )
}
