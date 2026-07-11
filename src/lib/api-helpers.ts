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
import { sendCompanyEmail } from '@/lib/mailer'
import { sendLineMessage } from '@/lib/line'

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
    is_executive: false,
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

// Looks up an existing auth.users row by email via the Admin API (paginated —
// there's no direct getUserByEmail). Used to recover from "already registered"
// errors on auth.admin.createUser(): this happens when someone previously
// attempted a Google OAuth login before HR added them as an employee, leaving
// an orphaned auth.users row with no matching public.users profile. Rather
// than failing the create/import, callers reuse this existing auth id.
export async function findAuthUserByEmail(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  email: string
): Promise<{ id: string } | null> {
  const target = email.trim().toLowerCase()
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) {
      console.error('[findAuthUserByEmail] listUsers error', { page, target, error })
      return null
    }
    if (!data?.users?.length) {
      console.error('[findAuthUserByEmail] listUsers returned no users', { page, target, data })
      return null
    }
    console.error('[findAuthUserByEmail] scanning page', {
      page, target, count: data.users.length,
      emails: data.users.map(u => u.email),
    })
    const found = data.users.find(u => u.email?.toLowerCase() === target)
    if (found) return { id: found.id }
    if (data.users.length < perPage) return null
    page++
  }
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

// Which event_types are allowed to push through LINE. In-app + email still
// fire for every event (they're free and don't clutter anything), but LINE
// pushes count against the OA's monthly quota and — more importantly — get
// read as phone notifications, so keeping this list short matters. Curated
// per user request 2026-07-11 ("การแจ้งเตือนผ่าน LINE ไม่ให้เยอะและซับซ้อน"),
// "มาตรฐาน" scope: leave/OT approval results (to the employee) + new
// leave/OT requests (to the approving supervisor) + inquiry replies (to the
// employee who asked). Deliberately excludes: timesheet submit/approve/
// reject (routine, checked in-app monthly), announcements, contract/
// probation/leave-expiry reminders (HR-internal, checked via dashboard),
// inquiry_submitted (to HR), and leave_balance_adjusted/cancelled — those
// stay in_app + email only. Adding a new event to LINE later is just adding
// its event_type string here.
const LINE_NOTIFY_EVENTS = new Set<string>([
  'leave_submitted', 'leave_approved', 'leave_rejected',
  'ot_submitted', 'ot_approved', 'ot_rejected',
  'inquiry_reply',
])

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

  // Need each recipient's email / LINE link to actually deliver the
  // email/line channels below (in_app just needs the row itself).
  const { data: recipients } = await supabase
    .from('users')
    .select('id, email, line_user_id')
    .in('id', params.recipient_ids)
  const byId = new Map((recipients ?? []).map((u) => [u.id, u]))

  const channels: ('in_app' | 'email' | 'line')[] = LINE_NOTIFY_EVENTS.has(params.event_type)
    ? ['in_app', 'email', 'line']
    : ['in_app', 'email']
  const nowIso = new Date().toISOString()
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
      // in_app is "delivered" the moment the row exists — no external
      // send step needed, so mark it sent immediately.
      status:         channel === 'in_app' ? 'sent' : 'pending',
      sent_at:        channel === 'in_app' ? nowIso : null,
    }))
  )

  const { data: inserted, error: insertErr } = await supabase
    .from('notifications')
    .insert(rows)
    .select('id, recipient_id, channel')

  // This used to fail completely silently (error was never read) — e.g. an
  // event_type not yet in the notification_event enum would make the whole
  // insert fail, but every caller of dispatchNotifications() would see it
  // as a normal "sent" outcome with zero visible symptoms. Logging isn't a
  // full fix, but it means a bad deploy shows up in Vercel logs instead of
  // just quietly notifying nobody.
  if (insertErr) console.error('[dispatchNotifications] insert failed:', insertErr)

  // Best-effort delivery for email/line, attempted inline in the same
  // request — there is no background queue worker in this deployment yet.
  // Failures are recorded on the row (status='failed', last_error) instead
  // of thrown, so a slow/misconfigured mail server or unlinked LINE
  // account never breaks the calling API request (leave approval, etc).
  for (const row of inserted ?? []) {
    if (row.channel === 'in_app') continue
    const user = byId.get(row.recipient_id)

    if (row.channel === 'email') {
      if (!user?.email) {
        await supabase.from('notifications')
          .update({ status: 'failed', last_error: 'ไม่มีอีเมลของผู้รับในระบบ' })
          .eq('id', row.id)
        continue
      }
      const result = await sendCompanyEmail({
        company_id: params.company_id,
        to: user.email,
        subject: params.title,
        html: `<p>${params.body.replace(/\n/g, '<br/>')}</p>`,
      })
      await supabase.from('notifications')
        .update(result.ok
          ? { status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', last_error: result.error, retry_count: 1 })
        .eq('id', row.id)
    }

    if (row.channel === 'line') {
      if (!user?.line_user_id) {
        await supabase.from('notifications')
          .update({ status: 'failed', last_error: 'ผู้รับยังไม่ได้เชื่อมต่อบัญชี LINE' })
          .eq('id', row.id)
        continue
      }
      const result = await sendLineMessage({
        company_id: params.company_id,
        line_user_id: user.line_user_id,
        text: `${params.title}\n${params.body}`,
      })
      await supabase.from('notifications')
        .update(result.ok
          ? { status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', last_error: result.error, retry_count: 1 })
        .eq('id', row.id)
    }
  }
}
