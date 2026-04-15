'use client'

import Link from 'next/link'

export default function StoreNav() {
  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'rgba(10, 10, 10, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid #1A1A1A',
      padding: '0 max(24px, calc(50vw - 640px))',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <Link href="/tienda" style={{ textDecoration: 'none' }}>
        <span style={{
          fontFamily: 'var(--font-syne, system-ui)',
          fontWeight: 800,
          fontSize: '18px',
          color: '#F0B429',
          letterSpacing: '0.05em',
        }}>
          CHOCHOLAND
        </span>
      </Link>

      {/* Carrito — se activa en Fase 2 */}
      <div style={{
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid #222222',
        borderRadius: '8px',
        opacity: 0.3,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1"/>
          <circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61H19a2 2 0 001.98-1.61L23 6H6"/>
        </svg>
      </div>
    </nav>
  )
}
