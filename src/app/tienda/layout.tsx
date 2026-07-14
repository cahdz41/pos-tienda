import type { Metadata } from 'next'
import { Syne, DM_Sans, Barlow_Condensed, Barlow } from 'next/font/google'
import { StoreCartProvider } from '@/contexts/StoreCartContext'
import { StoreAuthProvider } from '@/contexts/StoreAuthContext'
import StoreNav from '@/components/tienda/StoreNav'
import CartDrawer from '@/components/tienda/CartDrawer'
import ChatWidget from '@/components/tienda/ChatWidget'
import Footer from '@/components/tienda/Footer'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-storeonline.duckdns.org'
const OG_IMAGE = `${SITE_URL}/og-tienda.png`

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['400', '600', '700', '800'],
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  variable: '--font-barlow-condensed',
  weight: ['700', '900'],
})

const barlow = Barlow({
  subsets: ['latin'],
  variable: '--font-barlow',
  weight: ['400', '600'],
})

export const metadata: Metadata = {
  title: 'Chocholand — Suplementos y Nutrición Deportiva en México',
  description: 'Compra proteínas, pre-entrenos, creatinas, aminoácidos y más. Envíos en México. Chocholand, tu tienda de suplementos deportivos.',
  alternates: {
    canonical: `${SITE_URL}/tienda`,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/tienda`,
    siteName: 'Chocholand',
    title: 'Chocholand — Suplementos y Nutrición Deportiva en México',
    description: 'Proteínas, pre-entrenos, creatinas y más. La mejor selección de suplementos deportivos con envíos a toda la República Mexicana.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Chocholand Tienda de Suplementos' }],
    locale: 'es_MX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chocholand — Suplementos Deportivos',
    description: 'Proteínas, creatinas, pre-entrenos y más. Envíos en México.',
    images: [OG_IMAGE],
  },
}

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`store-root ${syne.variable} ${dmSans.variable} ${barlowCondensed.variable} ${barlow.variable}`}
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
          <Footer />
          <ChatWidget />
        </StoreCartProvider>
      </StoreAuthProvider>
    </div>
  )
}
