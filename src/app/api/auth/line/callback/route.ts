// src/app/api/auth/line/callback/route.ts
// LINE OAuth callback: exchange code → get profile → match user → set session

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let next = '/dashboard'
  try {
    if (state) {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
      next = parsed.next ?? '/dashboard'
    }
  } catch { /* use default */ }

  if (!code) return NextResponse.redirect(`${appUrl}/login?error=line_no_code`)

  const channelId     = process.env.LINE_LOGIN_CHANNEL_ID
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET
  const redirectUri   = `${appUrl}/api/auth/line/callback`

  if (!channelId || !channelSecret) {
    return NextResponse.redirect(`${appUrl}/login?error=line_not_configured`)
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
        client_id:     channelId,
        client_secret: channelSecret,
      }),
    })

    if (!tokenRes.ok) return NextResponse.redirect(`${appUrl}/login?error=line_token_failed`)
    const tokens = await tokenRes.json()

    // 2. Get LINE profile
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!profileRes.ok) return NextResponse.redirect(`${appUrl}/login?error=line_profile_failed`)
    const profile = await profileRes.json()

    // 3. Try to get email from ID token (if openid scope granted)
    let lineEmail: string | null = null
    if (tokens.id_token) {
      try {
        const [, payload] = tokens.id_token.split('.')
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString())
        lineEmail = decoded.email ?? null
      } catch { /* no email */ }
    }

    const supabase = createAdminClient()

    // 4. Find user by LINE user_id first, then by email
    let user: any = null

    const { data: lineAccount } = await supabase
      .from('user_line_accounts')
      .select('user_id')
      .eq('line_user_id', profile.userId)
      .single()

    if (lineAccount) {
      const { data } = await supabase.from('users').select('*')
        .eq('id', lineAccount.user_id).single()
      user = data
    } else if (lineEmail) {
      const { data } = await supabase.from('users').select('*')
        .eq('email', lineEmail.toLowerCase()).single()
      user = data

      // Link LINE account to this user
      if (user) {
        await supabase.from('user_line_accounts').upsert({
          user_id:           user.id,
          line_user_id:      profile.userId,
          display_name: profile.displayName,
          picture_url:  profile.pictureUrl,
          linked_at:         new Date().toISOString(),
        })
      }
    }

    if (!user) {
      // LINE account not linked to any user
      return NextResponse.redirect(`${appUrl}/login?error=line_not_linked&line_id=${profile.userId}`)
    }

    if (user.status !== 'active') {
      return NextResponse.redirect(`${appUrl}/login?error=account_inactive`)
    }

    // 5. Sign in via Supabase Auth using auth_user_id
    //    We use admin API to generate a magic link token for this user
    if (!user.auth_user_id) {
      return NextResponse.redirect(`${appUrl}/login?error=no_auth_user`)
    }

    // Create a short-lived session by calling the sign-in API from server
    // Using Supabase Admin: generateLink for the user's email
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type:  'magiclink',
      email: user.email,
      options: { redirectTo: `${appUrl}${next}` },
    })

    if (linkErr || !linkData?.properties?.hashed_token) {
      return NextResponse.redirect(`${appUrl}/login?error=session_failed`)
    }

    // Redirect to the magic link — Supabase will set the session cookie
    const magicUrl = new URL(linkData.properties.action_link)
    return NextResponse.redirect(magicUrl.toString())

  } catch (err) {
    console.error('[LINE callback error]', err)
    return NextResponse.redirect(`${appUrl}/login?error=line_unknown`)
  }
}
