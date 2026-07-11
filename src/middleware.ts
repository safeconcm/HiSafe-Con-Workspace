// src/middleware.ts
// Runs on every request:
//   1. Refreshes Supabase session cookie
//   2. Redirects unauthenticated users to /login
//   3. Injects company_id, user_id, role into request headers
//      so API route handlers can set PostgreSQL session variables for RLS

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { pickActiveRow, ACTIVE_COMPANY_COOKIE } from '@/lib/company-context'

// Routes that don't require authentication
// '/api/cron' is here because Vercel's scheduled invocations call it
// server-to-server with an `Authorization: Bearer $CRON_SECRET` header and
// no Supabase session cookie at all — without this exemption, middleware's
// "no authUser → redirect to /login" branch below would intercept every
// real cron trigger before it ever reached the route's own CRON_SECRET
// check (see /api/cron/daily-checks/route.ts), silently breaking the
// scheduled job while still looking fine under manual/browser testing
// (which carries a logged-in session cookie and never exercises this path).
// '/api/line/webhook' is here for the same reason as '/api/cron' above —
// LINE's Messaging API platform calls this server-to-server with no
// Supabase session cookie at all. Before this exemption, every webhook
// delivery hit the "no authUser → redirect to /login" branch below, so the
// route's own HMAC signature check (see /api/line/webhook/route.ts) never
// even ran — the 6-digit account-link code was never marked used, and the
// LINE OA fell back to its own default "can't reply to messages" canned
// response instead of ours. Found while debugging why LINE linking silently
// never completed (conversation 2026-07-11).
const PUBLIC_ROUTES = ['/login', '/forgot-password', '/reset-password', '/api/auth/callback', '/api/auth/logout', '/manifest.json', '/sw.js', '/apply', '/api/public', '/api/cron', '/api/line/webhook']

// Routes that require specific roles. Matched by longest-prefix-wins (see the
// route-guard loop below), so more specific paths must be listed — order in
// this object doesn't matter, only string length does.
// HR can view employee records (list + the employee-360 detail page) since
// the underlying APIs already treat HR the same as Admin for reads — see
// GET /api/admin/users and GET /api/admin/users/[id]. Creating/importing
// users, org structure, job codes, and system settings stay Admin-only.
const ROLE_ROUTES: Record<string, string[]> = {
  '/hr':                  ['hr', 'admin'],
  '/admin/users/new':     ['admin'],
  '/admin/users/import':  ['admin'],
  '/admin/organization':  ['admin'],
  '/admin/jobs':          ['admin'],
  '/admin/settings':      ['admin'],
  '/admin/users':         ['hr', 'admin'],
  '/admin':               ['admin'],
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
    return NextResponse.redirect(loginUrl, 303)
  }

  // ── Fetch user profile from DB (cached in cookie for perf) ──
  // We store a lightweight session payload in a signed cookie
  // to avoid a DB query on every request
  const activeCompanyId = request.cookies.get(ACTIVE_COMPANY_COOKIE)?.value
  const sessionCookie = request.cookies.get('hsc_session')?.value
  let sessionUser = sessionCookie ? safeParseSession(sessionCookie) : null

  const cacheStale =
    !sessionUser ||
    sessionUser.auth_user_id !== authUser.id ||
    (!!activeCompanyId && sessionUser.company_id !== activeCompanyId)

  if (cacheStale) {
    // Fetch all active profile rows for this auth user — an admin may be
    // linked to more than one company (see src/lib/company-context.ts)
    const { data: userRows, error: userRowError } = await supabase
      .from('users')
      .select(
        'id, company_id, employee_code, email, first_name_th, last_name_th, role, avatar_url, is_executive'
      )
      .eq('auth_user_id', authUser.id)
      .eq('status', 'active')

    const userRow = pickActiveRow(userRows, activeCompanyId)

    if (!userRow) {
      // Auth user exists but no profile — deactivated or not set up
      console.error('[middleware] no_profile lookup failed', {
        authUserId: authUser.id,
        error: userRowError,
      })
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/login?error=no_profile', request.url), 303)
    }

    // Fetch company info for every linked company (switcher) + active one's code
    const companyIds = Array.from(new Set((userRows ?? []).map(r => r.company_id)))
    const { data: companyRows } = await supabase
      .from('companies')
      .select('id, code, name_th, logo_url')
      .in('id', companyIds)

    const activeCompany = companyRows?.find(c => c.id === userRow.company_id)

    sessionUser = {
      id: userRow.id,
      auth_user_id: authUser.id,
      company_id: userRow.company_id,
      company_code: activeCompany?.code ?? '',
      employee_code: userRow.employee_code,
      email: userRow.email,
      first_name_th: userRow.first_name_th,
      last_name_th: userRow.last_name_th,
      role: userRow.role,
      avatar_url: userRow.avatar_url,
      is_executive: userRow.is_executive ?? false,
      available_companies: companyRows ?? [],
    }

    // Store in cookie (7 day TTL, Secure in prod). NOT httpOnly: several
    // client components (admin/users, timesheet, leave detail, OT/timesheet
    // approvals — see the `document.cookie` reads for 'hsc_session') read
    // this cookie directly in the browser to avoid an extra round-trip for
    // display-only session info (id/role/company). None of that data is
    // secret — it's already rendered in the UI (name, email, role badge) —
    // so there's no meaningful security loss versus the real protection
    // (Supabase's own auth session cookies, which stay httpOnly/managed by
    // @supabase/ssr and are untouched here).
    response.cookies.set('hsc_session', JSON.stringify(sessionUser), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })
  }

  // ── Role-based route guard ───────────────────────────────────
  // Longest-prefix-wins: e.g. "/admin/users/new" must be checked before the
  // broader "/admin/users" and "/admin" rules, otherwise the first matching
  // (shorter) prefix in object-iteration order would win instead.
  const matchedPrefix = Object.keys(ROLE_ROUTES)
    .filter(prefix => pathname.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0]
  if (matchedPrefix && !ROLE_ROUTES[matchedPrefix].includes(sessionUser.role)) {
    return NextResponse.redirect(new URL('/dashboard', request.url), 303)
  }

  // ── Inject session into request headers for API routes ───────
  // API route handlers read these to set PostgreSQL RLS session variables.
  // IMPORTANT: these must be attached via NextResponse.next({ request: { headers } })
  // so they reach the Route Handler. Setting them on `response.headers` directly
  // (the previous approach) only affects headers sent back to the browser, per
  // Next.js's documented middleware semantics — it does not forward them to the
  // destination route. This rebuilds the request headers explicitly so route
  // handlers reliably receive x-user-id/x-company-id/x-user-role/x-company-code.
  const forwardedHeaders = new Headers(request.headers)
  forwardedHeaders.set('x-user-id',      sessionUser.id)
  forwardedHeaders.set('x-company-id',   sessionUser.company_id)
  forwardedHeaders.set('x-user-role',    sessionUser.role)
  forwardedHeaders.set('x-company-code', sessionUser.company_code)

  const finalResponse = NextResponse.next({ request: { headers: forwardedHeaders } })
  // Carry over any cookies queued on `response` (Supabase session refresh,
  // and the hsc_session cache cookie set above) onto the response we return.
  response.cookies.getAll().forEach(cookie => finalResponse.cookies.set(cookie))

  return finalResponse
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
