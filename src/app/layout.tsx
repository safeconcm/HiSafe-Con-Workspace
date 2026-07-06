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
    template: '%s | HiSafe-CON WorkSpace',
    default: 'HiSafe-CON WorkSpace',
  },
  description: 'ระบบจัดการการลาและ Timesheet สำหรับ Safecon และ Highcon',
  manifest: '/manifest.json',
  themeColor: '#1e3a8a',
  appleWebApp: { capable: true, title: 'HiSafe-CON', statusBarStyle: 'default' },
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
