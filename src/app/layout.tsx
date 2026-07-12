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

// Required for Next.js to resolve the relative openGraph.images URL below
// into an absolute one — chat-app link-preview crawlers (LINE, etc.) need
// an absolute image URL, a relative path is silently ignored by most of
// them. Safe to hardcode: this is the actual Vercel production domain
// (see Vercel → Overview → Domains), not something that changes.
const siteUrl = 'https://hi-safe-con-workspace.vercel.app'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
  // Explicit Open Graph tags (2026-07-12) — added because chat apps like
  // LINE primarily read og:title/og:description/og:image and only fall
  // back to the plain <meta name="description"> when these are missing.
  // Without these, some crawlers were left with stale/no data plus no
  // preview image at all. NOTE: even with this fix, a link that was
  // already shared before today keeps showing the *old* cached preview in
  // that chat thread — LINE (like most chat apps) caches the preview per
  // exact URL the first time it's scraped and doesn't re-check it. This is
  // expected and outside our control; sharing the link fresh (or adding a
  // harmless "?v=2" once) forces a new scrape with the corrected data.
  openGraph: {
    title: 'CONNEX',
    description: 'Smart Platform เชื่อมต่อทุกการทำงานในระบบเดียว',
    siteName: 'CONNEX',
    url: siteUrl,
    locale: 'th_TH',
    type: 'website',
    images: [{ url: '/logos/connex-logo.png', width: 292, height: 306, alt: 'CONNEX' }],
  },
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
