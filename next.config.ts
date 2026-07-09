import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff'        },
          { key: 'X-Frame-Options',         value: 'SAMEORIGIN'     },
          { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Ship the Chromium binary (copied into chromium-bin/ at build time by
  // scripts/postinstall-chromium.mjs) inside the PDF routes' own function
  // bundle, so src/lib/pdf/render.ts can load it straight from local disk
  // instead of fetching it over the network at runtime. See
  // postinstall-chromium.mjs for why: a self-fetch over HTTP ran into
  // Vercel Deployment Protection redirect/cookie issues that the
  // @sparticuz/chromium-min download path couldn't work around.
  outputFileTracingIncludes: {
    '/api/pdf/**': ['./chromium-bin/**'],
  },

  // Vercel: serverless functions timeout (default 10s, max 60s on Pro)
  // API routes that may be slow: PDF gen, bulk import
  // These run as serverless functions on Vercel automatically
}

export default nextConfig
