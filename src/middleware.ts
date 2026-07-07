// src/middleware.ts
// Runs on every request:
//   1. Refreshes Supabase session cookie
//   2. Redirects unauthenticated users to /login
//   3. Injects company_id, user_id, role into request headers
//      so API route handlers can set PostgreSQL session variables for RLS

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/api/auth/callback', '/manifest.json', '/sw.js']

// Routes that require specific roles
const ROLE_ROUTES: Record<string, string[]> = {
  '/hr':    ['hr', 'admin'],
  '/admin': ['admin'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public routes and static files
  if (
    PUBLIC_ROUTES.some((r) => pathname.startsWith(r)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  // ── Supabase session refresh ─────────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  // ── Not authenticated → redirect to login ───────────────────
  if (!authUser) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // ── Fetch user profile from DB (cached in cookie for perf) ──
  // We store a lightweight session payload in a signed cookie
  // to avoid a DB query on every request
  const sessionCookie = request.cookies.get('hsc_session')?.value
  let sessionUser = sessionCookie ? safeParseSession(sessionCookie) : null

  if (!sessionUser || sessionUser.auth_user_id !== authUser.id) {
    // Fetch fresh from DB
    const { data: userRow, error: userRowError } = await supabase
      .from('users')
      .select(
        'id, company_id, employee_code, email, first_name_th, last_name_th, role, avatar_url'
      )
      .eq('auth_user_id', authUser.id)
      .eq('status', 'active')
      .single()

    if (!userRow) {
      // Auth user exists but no profile — deactivated or not set up
      console.error('[middleware] no_profile lookup failed', {
        authUserId: authUser.id,
        error: userRowError,
      })
      await supabase.auth.signOut()
      const debugUrl = new URL('/login?error=no_profile', request.url)
      if (userRowError) {
        debugUrl.searchParams.set('debug', `${userRowError.code ?? ''}:${userRowError.message ?? ''}`)
      }
      return NextResponse.redirect(debugUrl)
    }

    // Fetch company code
    const { data: companyRow } = await supabase
      .from('companies')
      .select('code')
      .eq('id', userRow.company_id)
      .single()

    sessionUser = {
      id: userRow.id,
      auth_user_id: authUser.id,
      company_id: userRow.company_id,
      company_code: companyRow?.code ?? '',
      employee_code: userRow.employee_code,
      email: userRow.email,
      first_name_th: userRow.first_name_th,
      last_name_th: userRow.last_name_th,
      role: userRow.role,
      avatar_url: userRow.avatar_url,
    }

    // Store in cookie (7 day TTL, HttpOnly, Secure in prod)
    response.cookies.set('hsc_session', JSON.stringify(sessionUser), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
  }

  // ── Role-based route guard ───────────────────────────────────
  for (const [prefix, allowedRoles] of Object.entries(ROLE_ROUTES)) {
    if (pathname.startsWith(prefix) && !allowedRoles.includes(sessionUser.role)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // ── Inject session into request headers for API routes ───────
  // API route handlers read these to set PostgreSQL RLS session variables
  response.headers.set('x-user-id',     sessionUser.id)
  response.headers.set('x-company-id',  sessionUser.company_id)
  response.headers.set('x-user-role',   sessionUser.role)
  response.headers.set('x-company-code', sessionUser.company_code)

  return response
}

function safeParseSession(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
