'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const NAV_ITEMS = [
  { href: '/pos',           label: 'POS',          icon: '🛒' },
  { href: '/ventas',        label: 'Ventas',        icon: '🧾' },
  { href: '/inventario',    label: 'Inventario',    icon: '📦' },
  { href: '/clientes',      label: 'Clientes',      icon: '👥' },
  { href: '/turnos',        label: 'Turnos',        icon: '⏰' },
  { href: '/reportes',      label: 'Reportes',      icon: '📊' },
  { href: '/tienda',        label: 'Tienda',        icon: '🏪', external: true },
]

const OWNER_ITEMS = [
  { href: '/configuracion', label: 'Configuración', icon: '⚙️' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const initials = profile?.name
    ? profile.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  const items = [
    ...NAV_ITEMS,
    ...(profile?.role === 'owner' ? OWNER_ITEMS : []),
  ]

  return (
    <aside
      className="flex flex-col h-full w-56 shrink-0 py-4"
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Logo */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            C
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Chocholand
          </span>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-2 flex flex-col gap-0.5">
        {items.map(item => (
          <Link
            key={item.href}
            href={item.href}
            target={'external' in item && item.external ? '_blank' : undefined}
            rel={'external' in item && item.external ? 'noopener noreferrer' : undefined}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
            style={{
              color: isActive(item.href) ? '#000' : 'var(--text-muted)',
              background: isActive(item.href) ? 'var(--accent)' : 'transparent',
            }}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Usuario + Cerrar sesión */}
      <div
        className="mx-2 mt-2 rounded-lg p-3"
        style={{ border: '1px solid var(--border)', background: 'var(--surface2)' }}
      >
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p
              className="text-xs font-semibold truncate"
              style={{ color: 'var(--text)' }}
            >
              {profile?.name ?? 'Usuario'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {profile?.role === 'owner' ? 'Administrador' : 'Cajero'}
            </p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="w-full rounded py-1.5 text-xs font-medium transition-all"
          style={{
            background: '#2D1010',
            color: '#FF6B6B',
            border: '1px solid #4D1A1A',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
