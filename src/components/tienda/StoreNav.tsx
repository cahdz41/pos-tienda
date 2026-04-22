'use client'

import Link from 'next/link'
import { useStoreCart } from '@/contexts/StoreCartContext'
import { useStoreAuth } from '@/contexts/StoreAuthContext'

const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'

export default function StoreNav() {
  const { itemCount, openCart } = useStoreCart()
  const { user, customer } = useStoreAuth()

  return (
    <>
      <style>{`
        @keyframes neonFlicker {
          0%, 94%, 100% {
            text-shadow: 0 0 10px rgba(200,20,20,0.8), 0 0 30px rgba(200,20,20,0.4);
            opacity: 1;
          }
          95% { opacity: 0.7; text-shadow: 0 0 4px rgba(200,20,20,0.3); }
          96% { opacity: 1; text-shadow: 0 0 20px rgba(200,20,20,1), 0 0 50px rgba(200,20,20,0.6); }
          97% { opacity: 0.85; }
          98% { opacity: 1; }
        }
        @keyframes navSlide {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(5, 0, 5, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(200, 20, 20, 0.5)',
        padding: '0 max(24px, calc(50vw - 680px))',
        height: '64px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        animation: 'navSlide 0.45s ease-out',
      }}>

        {/* Logo + nombre */}
        <Link href="/tienda" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '50%',
            overflow: 'hidden', flexShrink: 0,
            border: '2px solid rgba(200, 20, 20, 0.8)',
            boxShadow: '0 0 14px rgba(200,20,20,0.5), inset 0 0 10px rgba(200,20,20,0.1)',
          }}>
            <img src={LOGO_URL} alt="Chocholand" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <span style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800, fontSize: '18px',
            color: '#FFFFFF', letterSpacing: '0.08em',
            animation: 'neonFlicker 7s ease-in-out infinite',
            textShadow: '0 0 10px rgba(200,20,20,0.8), 0 0 30px rgba(200,20,20,0.4)',
          }}>
            CHOCHOLAND
          </span>
        </Link>

        {/* Zona derecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>

          {/* Link de cuenta */}
          {user ? (
            <Link href="/tienda/cuenta/pedidos" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid rgba(200, 20, 20, 0.4)',
              borderRadius: '8px',
              color: '#cc2020', fontSize: '13px', fontWeight: 700,
              textDecoration: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = 'rgba(200,20,20,0.9)'
              el.style.boxShadow = '0 0 10px rgba(200,20,20,0.3)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = 'rgba(200,20,20,0.4)'
              el.style.boxShadow = 'none'
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {customer?.full_name?.split(' ')[0] ?? 'Mi cuenta'}
              </span>
            </Link>
          ) : (
            <Link href="/tienda/auth/login" style={{
              padding: '6px 12px',
              background: 'transparent',
              border: '1px solid rgba(200, 20, 20, 0.4)',
              borderRadius: '8px',
              color: '#cc2020', fontSize: '13px', fontWeight: 700,
              textDecoration: 'none',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = 'rgba(200,20,20,0.9)'
              el.style.boxShadow = '0 0 10px rgba(200,20,20,0.3)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = 'rgba(200,20,20,0.4)'
              el.style.boxShadow = 'none'
            }}>
              Mi cuenta
            </Link>
          )}

          {/* Carrito con badge */}
          <button
            onClick={openCart}
            style={{
              position: 'relative',
              width: '40px', height: '40px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: '1px solid rgba(200, 20, 20, 0.7)',
              borderRadius: '8px', color: '#cc2020', cursor: 'pointer',
              boxShadow: '0 0 8px rgba(200,20,20,0.2)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = 'rgba(200,20,20,1)'
              el.style.boxShadow = '0 0 18px rgba(200,20,20,0.5)'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = 'rgba(200,20,20,0.7)'
              el.style.boxShadow = '0 0 8px rgba(200,20,20,0.2)'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61H19a2 2 0 001.98-1.61L23 6H6"/>
            </svg>

            {itemCount > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                minWidth: '18px', height: '18px',
                background: '#cc2020', borderRadius: '9px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', fontWeight: 700, color: '#FFFFFF',
                padding: '0 4px',
                boxShadow: '0 0 8px rgba(200,20,20,0.7)',
              }}>
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>

        </div>
      </nav>
    </>
  )
}
