// src/app/layout.tsx
import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import { Providers }  from '@/components/layout/Providers'
import { PWABanner } from '@/components/layout/PWABanner'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | CONNEX',
    default: 'CONNEX',
  },
  // Also used as the fallback link-preview description by chat apps (LINE,
  // etc.) that don't find an explicit og:description — updated 2026-07-12
  // to match the current CONNEX tagline instead of the pre-rebrand copy.
  description: 'Smart Platform เชื่อมต่อทุกการทำงานในระบบเดียว',
  manifest: '/manifest.json',
  themeColor: '#1e3a8a',
  appleWebApp: { capable: true, title: 'CONNEX', statusBarStyle: 'default' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${sarabun.variable} font-sarabun antialiased`}>
        <Providers><PWABanner />{children}</Providers>
      </body>
    </html>
  )
}
