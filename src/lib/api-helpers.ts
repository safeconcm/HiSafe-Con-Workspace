import { createClient as createSupabaseClient } from '@supabase/supabase-js'
// src/lib/api-helpers.ts
// Utilities shared by all API Route Handlers
// - Extract session from request headers (set by middleware)
// - Create Supabase client with RLS session variables
// - Standard response helpers
// - Audit log writer

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { SessionUser } from '@/types/database'
import type { ApiResponse } from '@/types/api'

// ── Session ──────────────────────────────────────────────────

export function getSessionFromHeaders(req: NextRequest): SessionUser | null {
  const userId      = req.headers.get('x-user-id')
  const companyId   = req.headers.get('x-company-id')
  const role        = req.headers.get('x-user-role')
  const companyCode = req.headers.get('x-company-code')

  if (!userId || !companyId || !role) return null

  // Re-read full session from cookie for email / name fields
  const sessionCookie = req.cookies.get('hsc_session')?.value
  if (sessionCookie) {
    try {
      return JSON.parse(sessionCookie) as SessionUser
    } catch { /* fall through */ }
  }

  return {
    id: userId,
    auth_user_id: '',
    company_id: companyId,
    company_code: companyCode ?? '',
    employee_code: '',
    email: '',
    first_name_th: '',
    last_name_th: '',
    role: role as SessionUser['role'],
    avatar_url: null,
  }
}

// ── Supabase client with RLS session variables set ───────────

export async function createRLSClient(session: SessionUser) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Server Component context */ }
        },
      },
    }
  )

  // Set PostgreSQL session variables for RLS policies
  try {
    await supabase.rpc('set_app_context', {
      p_company_id: session.company_id,
      p_user_id:    session.id,
      p_role:       session.role,
    })
  } catch { /* ignore - RLS context will use anon fallback */ }

  // RLS context set via rpc above

  return supabase
}

// ── Admin client (bypasses RLS — use sparingly) ──────────────

export function createAdminSupabaseClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' },
    }
  )
}

// Sets RLS context via raw SQL — call at start of each API handler
export async function withRLSContext<T>(
  session: SessionUser,
  fn: (supabase: ReturnType<typeof createAdminSupabaseClient>) => Promise<T>
): Promise<T> {
  const supabase = createAdminSupabaseClient()

  // Set session variables for RLS
  await supabase.rpc('set_app_context', {
    p_company_id: session.company_id,
    p_user_id: session.id,
    p_role: session.role,
  })

  return fn(supabase)
}

// Escape characters that are structurally meaningful in a PostgREST filter
// string (comma separates OR clauses, parens group them, period separates
// column.operator.value) before interpolating user-supplied search text into
// a `.or('col.ilike.%${q}%,...')` call, so a search string can't inject an
// extra filter clause. The `%`/`_` ilike wildcards are left as-is since they're
// the intended wildcard behavior for a search box, not a security boundary.
export function escapeForOrFilter(raw: string): string {
  return raw.replace(/[,()]/g, '')
}

// ── Response helpers ─────────────────────────────────────────

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status })
}

export function created<T>(data: T): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status: 201 })
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 })
}

export function badRequest(error: string): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error }, { status: 400 })
}

export function unauthorized(): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    { data: null, error: 'Unauthorized' },
    { status: 401 }
  )
}

export function forbidden(): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    { data: null, error: 'Forbidden — insufficient role' },
    { status: 403 }
  )
}

export function notFound(entity = 'Resource'): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    { data: null, error: `${entity} not found` },
    { status: 404 }
  )
}

export function serverError(err: unknown): NextResponse<ApiResponse<null>> {
  console.error('[API Error]', err)
  const message = err instanceof Error ? err.message : 'Internal server error'
  return NextResponse.json({ data: null, error: message }, { status: 500 })
}

// ── Role guards ──────────────────────────────────────────────

export function requireRole(
  session: SessionUser,
  roles: SessionUser['role'][]
): NextResponse<ApiResponse<null>> | null {
  if (!roles.includes(session.role)) return forbidden()
  return null
}

export function isHROrAdmin(session: SessionUser) {
  return session.role === 'hr' || session.role === 'admin'
}

export function isSupervisorOrAbove(session: SessionUser) {
  return ['supervisor', 'hr', 'admin'].includes(session.role)
}

// ── Audit log writer ─────────────────────────────────────────

export async function writeAuditLog(params: {
  session: SessionUser
  action: string
  entity_type: string
  entity_id?: string
  old_data?: Record<string, unknown> | null
  new_data?: Record<string, unknown> | null
  req?: NextRequest
}) {
  const supabase = createAdminSupabaseClient()
  await supabase.from('audit_logs').insert({
    company_id:  params.session.company_id,
    actor_id:    params.session.id,
    actor_email: params.session.email,
    actor_role:  params.session.role,
    action:      params.action,
    entity_type: params.entity_type,
    entity_id:   params.entity_id ?? null,
    old_data:    params.old_data ?? null,
    new_data:    params.new_data ?? null,
    ip_address:  params.req?.headers.get('x-forwarded-for') ?? null,
    user_agent:  params.req?.headers.get('user-agent') ?? null,
  })
}

// ── Notification dispatcher ──────────────────────────────────

export async function dispatchNotifications(params: {
  company_id: string
  recipient_ids: string[]
  event_type: string
  title: string
  body: string
  reference_id?: string
  reference_type?: string
}) {
  const supabase = createAdminSupabaseClient()
  const channels = ['in_app', 'email', 'line'] as const
  const rows = params.recipient_ids.flatMap((recipient_id) =>
    channels.map((channel) => ({
      company_id:     params.company_id,
      recipient_id,
      channel,
      event_type:     params.event_type,
      title:          params.title,
      body:           params.body,
      reference_id:   params.reference_id ?? null,
      reference_type: params.reference_type ?? null,
      status:         'pending',
    }))
  )
  await supabase.from('notifications').insert(rows)
}
