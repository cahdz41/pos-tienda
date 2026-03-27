'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useOffline } from '@/contexts/OfflineContext'

const NAV_ITEMS = [
  {
    href: '/pos',
    label: 'Punto de Venta',
    offlineEnabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
        <path d="M7 8h.01M11 8h.01M15 8h.01M7 12h.01M11 12h.01M15 12h.01"/>
      </svg>
    ),
  },
  {
    href: '/inventario',
    label: 'Inventario',
    offlineEnabled: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.29 7 12 12 20.71 7"/>
        <line x1="12" y1="22" x2="12" y2="12"/>
      </svg>
    ),
  },
  {
    href: '/productos',
    label: 'Productos',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>
    ),
  },
  {
    href: '/clientes',
    label: 'Clientes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
  },
  {
    href: '/ventas',
    label: 'Ventas',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
  },
  {
    href: '/turnos',
    label: 'Turnos / Caja',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        <path d="M6 12h.01M10 12h.01"/>
      </svg>
    ),
  },
  {
    href: '/reportes',
    label: 'Reportes',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
        <line x1="2" y1="20" x2="22" y2="20"/>
      </svg>
    ),
  },
  {
    href: '/configuracion',
    label: 'Configuración',
    ownerOnly: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const { isOnline } = useOffline()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="brand-icon">
          <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
            <path d="M8 8V6a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="14" cy="16" r="2.5" fill="currentColor"/>
            <path d="M14 18.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </div>
        <div>
          <span className="brand-name">POS</span>
          <span className="brand-sub">Chocholand</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <span className="nav-section-label">Módulos</span>
        {NAV_ITEMS.filter(item => !item.ownerOnly || (mounted && profile?.role === 'owner')).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const disabled = !isOnline && !item.offlineEnabled
          if (disabled) {
            return (
              <div key={item.href} className="nav-item nav-item--disabled" title="Requiere conexión">
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
                <span style={{ fontSize: 11 }}>🔒</span>
              </div>
            )
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`nav-item ${active ? 'nav-item--active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {active && <span className="nav-dot" />}
            </Link>
          )
        })}
      </nav>

      {/* User / Footer */}
      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">
            {profile?.name?.charAt(0).toUpperCase() ?? '?'}
          </div>
          <div className="user-details">
            <span className="user-name">{profile?.name ?? '—'}</span>
            <span className={`user-role user-role--${profile?.role}`}>
              {profile?.role === 'owner' ? 'Propietario' : 'Cajero'}
            </span>
          </div>
        </div>
        <button className="signout-btn" onClick={signOut} title="Cerrar sesión">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      <style>{`
        .sidebar {
          width: 220px;
          min-width: 220px;
          height: 100vh;
          background: var(--bg-surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          overflow: hidden;
        }

        /* Brand */
        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 20px 16px 16px;
          border-bottom: 1px solid var(--border);
        }

        .brand-icon {
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.25);
          border-radius: 10px;
          color: var(--accent);
          flex-shrink: 0;
        }

        .brand-name {
          display: block;
          font-family: var(--font-syne, sans-serif);
          font-size: 16px;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: 0.08em;
          line-height: 1;
        }

        .brand-sub {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 2px;
        }

        /* Nav */
        .sidebar-nav {
          flex: 1;
          padding: 16px 10px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow-y: auto;
        }

        .nav-section-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0 8px;
          margin-bottom: 6px;
          margin-top: 4px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 10px;
          border-radius: 8px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.15s;
          position: relative;
        }

        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }

        .nav-item--active {
          background: var(--accent-glow);
          color: var(--accent);
          font-weight: 600;
        }

        .nav-item--active:hover {
          background: var(--accent-glow);
        }

        .nav-item--disabled {
          opacity: 0.38;
          cursor: not-allowed;
          pointer-events: none;
        }

        .nav-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .nav-label {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .nav-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }

        /* Footer */
        .sidebar-footer {
          padding: 12px 10px;
          border-top: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.25);
          color: var(--accent);
          font-family: var(--font-syne, sans-serif);
          font-weight: 700;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .user-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .user-name {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          font-size: 10px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .user-role--owner { color: var(--accent); }
        .user-role--cashier { color: var(--text-muted); }

        .signout-btn {
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 7px;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .signout-btn:hover {
          background: var(--danger-dim);
          border-color: rgba(239,68,68,0.4);
          color: var(--danger);
        }
      `}</style>
    </aside>
  )
}
