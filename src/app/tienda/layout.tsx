import type { Metadata } from 'next'
import { Syne, DM_Sans } from 'next/font/google'
import { StoreCartProvider } from '@/contexts/StoreCartContext'
import { StoreAuthProvider } from '@/contexts/StoreAuthContext'
import StoreNav from '@/components/tienda/StoreNav'
import CartDrawer from '@/components/tienda/CartDrawer'

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700', '800'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

export const metadata: Metadata = {
  title: 'Chocholand — Tienda',
  description: 'Suplementos y nutrición deportiva',
}

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`store-root ${syne.variable} ${dmSans.variable}`}
      style={{
        minHeight: '100vh',
        background: '#0A0A0A',
        color: '#FFFFFF',
        fontFamily: 'var(--font-dm-sans, system-ui), sans-serif',
      }}
    >
      <StoreAuthProvider>
        <StoreCartProvider>
          <StoreNav />
          <CartDrawer />
          {children}
        </StoreCartProvider>
      </StoreAuthProvider>
    </div>
  )
}
