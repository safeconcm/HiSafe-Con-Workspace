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
// "มาตรฐาน" scope + timesheet/announcement added back per follow-up request
// same day: leave/OT/timesheet submit+approval results (to the employee) +
// new leave/OT requests (to the approving supervisor) + inquiry replies (to
// the employee who asked) + company announcements (to everyone they target).
// Deliberately still excludes: contract/probation/leave-expiry reminders
// (HR-internal, checked via dashboard), inquiry_submitted (to HR), and
// leave_balance_adjusted/cancelled — those stay in_app + email only. Adding
// a new event to LINE later is just adding its event_type string here.
const LINE_NOTIFY_EVENTS = new Set<string>([
  'leave_submitted', 'leave_approved', 'leave_rejected',
  'ot_submitted', 'ot_approved', 'ot_rejected',
  'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected',
  'announcement',
  'inquiry_reply',
])

// Maps a notification's reference_type to the page a tap should land on —
// added per user request 2026-07-12 ("แนบลิ้งให้ user กดเข้าไปอ่านได้").
// LINE auto-links plain-text URLs (tappable, no extra work needed), so this
// just needs to produce the right absolute URL per type. Some types (OT,
// inquiries) don't have a per-record detail page, so they link to the
// shared list/approvals page instead — still gets the person to the right
// screen, just not scrolled to the exact row.
function buildNotificationLink(referenceType?: string | null, referenceId?: string | null): string | null {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  switch (referenceType) {
    case 'leave_request': return referenceId ? `${appUrl}/leave/${referenceId}` : null
    case 'timesheet':     return referenceId ? `${appUrl}/timesheet/detail/${referenceId}` : null
    case 'ot_request':    return `${appUrl}/approvals/ot`
    case 'inquiry':       return `${appUrl}/inquiries`
    case 'announcement':  return `${appUrl}/announcements`
    default: return null
  }
}

const isImageAttachment = (type: string | null | undefined) => !!type && type.startsWith('image/')

// Forces a link tapped from inside a LINE chat to open in the phone's
// default browser (Chrome/Safari) instead of LINE's own in-app browser.
// Needed because Google blocks Sign-In inside known in-app webviews
// (403 disallowed_useragent) — LINE's own docs support this exact
// `openExternalBrowser=1` query param for this purpose (doesn't apply to
// LIFF apps, which we don't use). Added 2026-07-12 alongside the
// UA-detection fallback on the login page (kept as a safety net in case
// an older LINE app version ignores this param).
function withExternalBrowser(url: string): string {
  return url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1'
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Card title + button label for leave/OT/timesheet LINE notifications —
// added per user request 2026-07-12 to give these a thumbnail card like
// announcements have, purely for visual appeal (no functional benefit;
// the plain-text link already worked fine). There's no per-record image
// for these, so the company logo is used as a generic thumbnail instead
// (see companyLogoUrl below).
const CARD_META: Record<string, { title: string; linkLabel: string }> = {
  leave_submitted:     { title: 'ใบลาใหม่ (รออนุมัติ)', linkLabel: 'ดูใบลา' },
  leave_approved:      { title: 'ใบลาอนุมัติแล้ว',       linkLabel: 'ดูใบลา' },
  leave_rejected:       { title: 'ใบลาไม่ได้รับอนุมัติ',    linkLabel: 'ดูใบลา' },
  ot_submitted:        { title: 'คำขอ OT ใหม่',          linkLabel: 'ดู OT' },
  ot_approved:         { title: 'OT อนุมัติแล้ว',          linkLabel: 'ดู OT' },
  ot_rejected:         { title: 'OT ไม่ได้รับอนุมัติ',       linkLabel: 'ดู OT' },
  timesheet_submitted: { title: 'Timesheet ใหม่ (รออนุมัติ)', linkLabel: 'ดู Timesheet' },
  timesheet_approved:  { title: 'Timesheet อนุมัติแล้ว',    linkLabel: 'ดู Timesheet' },
  timesheet_rejected:  { title: 'Timesheet ไม่ได้รับอนุมัติ', linkLabel: 'ดู Timesheet' },
}

// Maps a company code to its logo file under public/logos/ — the only real
// branded image already available to use as a generic thumbnail for these
// event types (companies.logo_url is unpopulated for both companies).
function companyLogoPath(code: string | null | undefined): string | null {
  if (code === 'SAFECON') return '/logos/safecon.png'
  if (code === 'HIGHCON') return '/logos/highcon.png'
  return null
}

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
  // email/line channels below (in_app just needs the row itself). Names
  // added 2026-07-12 for the "เรียน [ชื่อ]" personalized email greeting.
  const { data: recipients } = await supabase
    .from('users')
    .select('id, email, line_user_id, first_name_th, last_name_th')
    .in('id', params.recipient_ids)
  const byId = new Map((recipients ?? []).map((u) => [u.id, u]))

  // For announcement pushes, look up the attachment once (same for every
  // recipient) — the image (if any) becomes the LINE Buttons-template
  // thumbnail / email inline image, and attachment_name (any file type)
  // becomes the "สิ่งที่แนบมาด้วย" line in the email. Only fetched when it
  // could actually matter — avoids an extra query on every other event type.
  let announcementImageUrl: string | null = null
  let announcementAttachmentName: string | null = null
  if (params.event_type === 'announcement' && params.reference_id) {
    const { data: ann } = await supabase
      .from('announcements')
      .select('attachment_url, attachment_type, attachment_name')
      .eq('id', params.reference_id)
      .maybeSingle()
    if (ann?.attachment_url && isImageAttachment(ann.attachment_type)) {
      announcementImageUrl = ann.attachment_url
    }
    announcementAttachmentName = ann?.attachment_name ?? null
  }

  // Company info — used for the LINE company-logo thumbnail (leave/OT/
  // timesheet, see CARD_META below) and, since 2026-07-12, for the email
  // letterhead (logo, legal name, address, tax id, phone in the header/
  // footer) on every email this function sends. Fetched unconditionally
  // now that email needs it regardless of event type.
  const { data: company } = await supabase
    .from('companies')
    .select('code, legal_name_th, address_th, tax_id, phone')
    .eq('id', params.company_id)
    .maybeSingle()
  const cardMeta = CARD_META[params.event_type]
  let companyLogoUrl: string | null = null
  const logoPath = companyLogoPath(company?.code)
  if (logoPath) {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
    companyLogoUrl = `${appUrl}${logoPath}`
  }

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
      // Formal Thai-memo layout, requested 2026-07-12 (letterhead header,
      // personalized "เรียน" greeting, formal closing + signature, letterhead
      // footer with company address/tax id/phone). `plainLink` deliberately
      // skips the `openExternalBrowser=1` param added for LINE — that's a
      // LINE-only in-app-browser workaround, a no-op query string in email.
      const plainLink = buildNotificationLink(params.reference_type, params.reference_id)
      // Body image: only for announcements with their own uploaded image —
      // the company logo now lives in the letterhead header instead (used
      // to also double as the body thumbnail for leave/OT/timesheet before
      // there was a header at all).
      const emailBodyImage = params.event_type === 'announcement' ? announcementImageUrl : null
      const emailTitle = params.event_type === 'announcement'
        ? params.title.replace(/^\[ประกาศ\]\s*/, '')
        : cardMeta?.title ?? params.title
      const emailLinkLabel = cardMeta?.linkLabel
        ?? (params.event_type === 'announcement' ? 'อ่านประกาศ' : 'ดูรายละเอียด')
      const greetingName = `${user.first_name_th ?? ''} ${user.last_name_th ?? ''}`.trim() || user.email
      // Formal closing + signature for org-wide announcements only (not
      // personal leave/OT/timesheet notifications, which don't call for
      // "ถือปฏิบัติ"-style directive language).
      const emailClosing = params.event_type === 'announcement'
        ? 'จึงเรียนมาเพื่อโปรดทราบและถือปฏิบัติ\n\nขอแสดงความนับถือ\nฝ่ายบุคคล (HR)'
        : null

      // Embed images as real inline attachments (cid) instead of remote
      // <img src>, so they aren't hidden behind "click to show images" in
      // mail clients that block remote content by default. Both fetches are
      // best-effort: a failed/slow fetch just drops that image, it never
      // blocks the email itself from sending.
      const attachments: { filename: string; content: Buffer; cid: string }[] = []
      let logoTag = ''
      if (companyLogoUrl) {
        try {
          const logoRes = await fetch(companyLogoUrl)
          if (logoRes.ok) {
            attachments.push({ filename: 'logo.png', content: Buffer.from(await logoRes.arrayBuffer()), cid: 'logo' })
            logoTag = `<img src="cid:logo" alt="" style="height:40px;display:block;margin-bottom:8px;" />`
          }
        } catch {
          // no-op — email still sends without the logo
        }
      }
      let thumbnailTag = ''
      if (emailBodyImage) {
        try {
          const imgRes = await fetch(emailBodyImage)
          if (imgRes.ok) {
            attachments.push({ filename: 'thumbnail.jpg', content: Buffer.from(await imgRes.arrayBuffer()), cid: 'thumbnail' })
            thumbnailTag = `<img src="cid:thumbnail" alt="" style="max-width:100%;border-radius:8px;margin-bottom:16px;display:block;" />`
          }
        } catch {
          // no-op — email still sends without the image
        }
      }

      const result = await sendCompanyEmail({
        company_id: params.company_id,
        to: user.email,
        subject: params.title,
        attachments: attachments.length ? attachments : undefined,
        html: `
          <div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
            ${logoTag}
            <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">${escapeHtml(company?.legal_name_th ?? '')}</div>
            <p style="font-size:14px;margin:0 0 12px;">เรียน ${escapeHtml(greetingName)}</p>
            <h2 style="margin:0 0 12px;font-size:18px;">${escapeHtml(emailTitle)}</h2>
            ${thumbnailTag}
            <p style="white-space:pre-wrap;line-height:1.6;font-size:14px;">${escapeHtml(params.body)}</p>
            ${announcementAttachmentName ? `<p style="font-size:13px;color:#4b5563;margin-top:12px;">สิ่งที่แนบมาด้วย: ${escapeHtml(announcementAttachmentName)}</p>` : ''}
            ${emailClosing ? `<p style="white-space:pre-wrap;line-height:1.6;font-size:14px;margin-top:16px;">${escapeHtml(emailClosing)}</p>` : ''}
            ${plainLink ? `<p style="margin-top:20px;"><a href="${plainLink}" style="background:#2563eb;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;display:inline-block;">${escapeHtml(emailLinkLabel)}</a></p>` : ''}
            <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
            <p style="font-size:12px;color:#9ca3af;line-height:1.6;">
              ${escapeHtml(company?.legal_name_th ?? '')}<br/>
              ${company?.address_th ? `${escapeHtml(company.address_th)}<br/>` : ''}
              ${company?.tax_id ? `เลขประจำตัวผู้เสียภาษี ${escapeHtml(company.tax_id)}<br/>` : ''}
              ${company?.phone ? `โทร ${escapeHtml(company.phone)}` : ''}
            </p>
          </div>
        `,
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
      const rawLink = buildNotificationLink(params.reference_type, params.reference_id)
      const link = rawLink ? withExternalBrowser(rawLink) : null
      // `text` here feeds the altText (chat-list/push preview, 400-char
      // budget — title+body reads well there). The card's own visible line
      // is set separately via `cardText` (60-char budget shared with the
      // title) — it must NOT also repeat params.title, or there's barely
      // any room left for the actual detail (this previously cut leave
      // notifications off mid-date-range). See cardText comment in line.ts.
      const result = announcementImageUrl && link
        ? await sendLineMessage({
            company_id: params.company_id,
            line_user_id: user.line_user_id,
            text: `${params.title}\n${params.body}`,
            richCard: {
              imageUrl: announcementImageUrl,
              title: params.title.replace(/^\[ประกาศ\]\s*/, '').slice(0, 40),
              linkUrl: link,
              linkLabel: 'อ่านประกาศ',
              cardText: params.body,
            },
          })
        : cardMeta && companyLogoUrl && link
        ? await sendLineMessage({
            company_id: params.company_id,
            line_user_id: user.line_user_id,
            text: `${params.title}\n${params.body}`,
            richCard: {
              imageUrl: companyLogoUrl,
              title: cardMeta.title,
              linkUrl: link,
              linkLabel: cardMeta.linkLabel,
              imageSize: 'contain',
              cardText: params.body,
            },
          })
        : await sendLineMessage({
            company_id: params.company_id,
            line_user_id: user.line_user_id,
            // Inquiry Q&A messages skip the link — added per user request
            // 2026-07-12 ("การรับส่งคำถาม คำตอบ ผ่านระบบ ควรแสดงแต่ข้อความ...
            // ไม่ต้องแนบลิ้งมา"). The link only ever went to the generic
            // /inquiries list (no per-thread page exists), so it wasn't
            // pointing anywhere more specific than what the person already
            // has open. Every other event type reaching this fallback branch
            // (there are currently none — leave/OT/timesheet/announcement
            // all have their own richCard branch above) keeps the link.
            text: (link && params.reference_type !== 'inquiry')
              ? `${params.title}\n${params.body}\n\n👉 ${link}`
              : `${params.title}\n${params.body}`,
          })
      await supabase.from('notifications')
        .update(result.ok
          ? { status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', last_error: result.error, retry_count: 1 })
        .eq('id', row.id)
    }
  }
}
