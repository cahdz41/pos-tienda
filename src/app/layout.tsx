import type { Metadata } from 'next'
import './globals.css'
import SwRegister from '@/components/SwRegister'

export const metadata: Metadata = {
  title: 'Chocholand POS',
  description: 'Sistema de punto de venta',
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="h-full">
      <head>
        <meta name="theme-color" content="#F0B429" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Chocholand" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="h-full" suppressHydrationWarning>
        {children}
        <SwRegister />
      </body>
    </html>
  )
}
