// src/app/api/auth/line/route.ts
// GET /api/auth/line?next=/dashboard
// Redirects to LINE Login OAuth URL

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const next     = searchParams.get('next') ?? '/dashboard'
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const channelId    = process.env.LINE_LOGIN_CHANNEL_ID
  const redirectUri  = `${appUrl}/api/auth/line/callback`
  const state        = Buffer.from(JSON.stringify({ next, ts: Date.now() })).toString('base64url')

  if (!channelId) {
    // LINE Login not configured — redirect back with error
    return NextResponse.redirect(`${appUrl}/login?error=line_not_configured`)
  }

  const lineAuthUrl = new URL('https://access.line.me/oauth2/v2.1/authorize')
  lineAuthUrl.searchParams.set('response_type', 'code')
  lineAuthUrl.searchParams.set('client_id',     channelId)
  lineAuthUrl.searchParams.set('redirect_uri',  redirectUri)
  lineAuthUrl.searchParams.set('state',         state)
  lineAuthUrl.searchParams.set('scope',         'profile openid email')
  lineAuthUrl.searchParams.set('nonce',         crypto.randomUUID())

  return NextResponse.redirect(lineAuthUrl.toString())
}
