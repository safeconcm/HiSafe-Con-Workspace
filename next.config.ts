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

  // Vercel: serverless functions timeout (default 10s, max 60s on Pro)
  // API routes that may be slow: PDF gen, bulk import
  // These run as serverless functions on Vercel automatically
}

export default nextConfig
