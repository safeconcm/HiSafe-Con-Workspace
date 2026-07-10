// src/app/api/cron/daily-checks/route.ts
// GET /api/cron/daily-checks — triggered once a day by Vercel Cron (see
// vercel.json). Scans for three things HR previously had to remember to
// check manually, and notifies the right people via the existing
// dispatchNotifications() (in-app + email + LINE):
//
//   1. Contracts ending within 30 days           → notify HR/Admin
//   2. Probation ending within 7 days, or already
//      overdue and still unresolved              → notify HR/Admin
//      (HR/Admin key in the dept_head/MD result themselves — see
//      /api/hr/probation-evaluations — so there's no per-evaluator
//      notification to send, just a heads-up to HR to go collect it)
//   3. Unused annual leave, once we're inside the last ~45 days of the
//      year                                       → notify the employee
//
// Idempotency: rather than adding new "reminder sent" columns everywhere,
// this checks the notifications table itself for an existing row with the
// same event_type + reference_id sent within the dedupe window — one
// exception is probation, which reuses the existing (already in the DB,
// previously unused) contracts.probation_reminder_sent_at column instead
// since it was clearly added for exactly this purpose already.
//
// Auth: Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
// for scheduled invocations once CRON_SECRET is set as an env var in the
// Vercel project — see README note below. If CRON_SECRET isn't set yet,
// the check is skipped (so this can be hand-tested on staging before
// that's configured) but a warning is included in the response.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, dispatchNotifications } from '@/lib/api-helpers'

const CONTRACT_WINDOW_DAYS  = 30
const PROBATION_WINDOW_DAYS = 7
const DEDUPE_DAYS           = 14   // don't re-notify the same thing more than once per this many days
const YEAR_END_WINDOW_DAYS  = 45   // only run the leave-expiry check once we're this close to Dec 31

function daysFromNow(days: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

async function alreadyNotifiedRecently(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  eventType: string,
  referenceId: string,
  withinDays: number,
) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - withinDays)
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .eq('reference_id', referenceId)
    .gte('created_at', since.toISOString())
  return (count ?? 0) > 0
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  let authWarning: string | null = null
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else {
    authWarning = 'CRON_SECRET ยังไม่ได้ตั้งค่าใน environment variables — endpoint นี้ยังไม่ถูกป้องกันด้วย secret'
  }

  const supabase = createAdminSupabaseClient()
  const today = todayISO()
  const results = { contracts_expiring: 0, probation_reminders: 0, leave_expiring: 0 }

  try {

  // ── HR/Admin lookup, grouped by company (shared by checks 1 & 2) ──────
  const { data: hrAdminUsers } = await supabase
    .from('users')
    .select('id, company_id')
    .in('role', ['hr', 'admin'])
  const hrAdminByCompany = new Map<string, string[]>()
  for (const u of hrAdminUsers ?? []) {
    const list = hrAdminByCompany.get(u.company_id) ?? []
    list.push(u.id)
    hrAdminByCompany.set(u.company_id, list)
  }

  // ── 1. Contracts ending within 30 days ─────────────────────────────────
  const { data: expiringContracts } = await supabase
    .from('contracts')
    .select(`
      id, company_id, end_date,
      user:users!contracts_user_id_fkey(first_name_th, last_name_th, employee_code)
    `)
    .eq('status', 'active')
    .not('end_date', 'is', null)
    .gte('end_date', today)
    .lte('end_date', daysFromNow(CONTRACT_WINDOW_DAYS))

  for (const c of expiringContracts ?? []) {
    const recipients = hrAdminByCompany.get(c.company_id) ?? []
    if (!recipients.length) continue
    if (await alreadyNotifiedRecently(supabase, 'contract_expiring', c.id, DEDUPE_DAYS)) continue

    const u = Array.isArray(c.user) ? c.user[0] : c.user
    await dispatchNotifications({
      company_id: c.company_id,
      recipient_ids: recipients,
      event_type: 'contract_expiring',
      title: 'สัญญาจ้างใกล้ครบกำหนด',
      body: `สัญญาจ้างของ ${u?.first_name_th ?? ''} ${u?.last_name_th ?? ''} (${u?.employee_code ?? '-'}) จะครบกำหนดวันที่ ${c.end_date}`,
      reference_id: c.id,
      reference_type: 'contract',
    })
    results.contracts_expiring++
  }

  // ── 2. Probation ending soon or overdue, still unresolved ─────────────
  const { data: probationContracts } = await supabase
    .from('contracts')
    .select(`
      id, company_id, probation_end, probation_reminder_sent_at,
      user:users!contracts_user_id_fkey(first_name_th, last_name_th, employee_code)
    `)
    .eq('probation_status', 'pending')
    .not('probation_end', 'is', null)
    .lte('probation_end', daysFromNow(PROBATION_WINDOW_DAYS))

  for (const c of probationContracts ?? []) {
    const recipients = hrAdminByCompany.get(c.company_id) ?? []
    if (!recipients.length) continue

    // Dedupe against the notifications table itself, not just
    // probation_reminder_sent_at — the column update below used to run
    // unconditionally after dispatchNotifications(), so a failed send
    // (e.g. the notification_event enum not yet having this value) would
    // still mark the reminder as "sent" and block a real one for
    // DEDUPE_DAYS. Checking actual notification rows means a failed
    // attempt gets retried on the next run instead of silently blocked.
    if (await alreadyNotifiedRecently(supabase, 'probation_reminder', c.id, DEDUPE_DAYS)) continue

    const u = Array.isArray(c.user) ? c.user[0] : c.user
    const overdue = c.probation_end < today
    await dispatchNotifications({
      company_id: c.company_id,
      recipient_ids: recipients,
      event_type: 'probation_reminder',
      title: overdue ? 'ทดลองงานเลยกำหนดประเมินแล้ว' : 'ใกล้ครบกำหนดทดลองงาน',
      body: `${u?.first_name_th ?? ''} ${u?.last_name_th ?? ''} (${u?.employee_code ?? '-'}) ${overdue ? 'ครบกำหนดทดลองงานไปแล้วเมื่อ' : 'จะครบกำหนดทดลองงานวันที่'} ${c.probation_end} — กรุณาเก็บผลประเมินจากหัวหน้างาน/MD`,
      reference_id: c.id,
      reference_type: 'contract',
    })
    await supabase.from('contracts')
      .update({ probation_reminder_sent_at: new Date().toISOString() })
      .eq('id', c.id)
    results.probation_reminders++
  }

  // ── 3. Unused annual leave — only once we're close to year-end ────────
  const now = new Date()
  const daysLeftInYear = Math.ceil(
    (new Date(Date.UTC(now.getUTCFullYear(), 11, 31)).getTime() - now.getTime()) / 86_400_000
  )
  if (daysLeftInYear <= YEAR_END_WINDOW_DAYS && daysLeftInYear >= 0) {
    const { data: balances } = await supabase
      .from('leave_balances')
      .select(`
        id, company_id, user_id, quota_days, carried_forward, adjusted_days, used_days, pending_days,
        user:users!leave_balances_user_id_fkey(first_name_th, last_name_th, employee_code)
      `)
      .eq('year', now.getUTCFullYear())
      .eq('leave_type', 'annual')

    for (const b of balances ?? []) {
      const remaining = (b.quota_days ?? 0) + (b.carried_forward ?? 0) + (b.adjusted_days ?? 0)
        - (b.used_days ?? 0) - (b.pending_days ?? 0)
      if (remaining <= 0) continue
      if (await alreadyNotifiedRecently(supabase, 'leave_expiring', b.id, DEDUPE_DAYS)) continue

      await dispatchNotifications({
        company_id: b.company_id,
        recipient_ids: [b.user_id],
        event_type: 'leave_expiring',
        title: 'วันลาพักร้อนคงเหลือใกล้หมดอายุปีนี้',
        body: `คุณมีวันลาพักร้อนคงเหลือ ${remaining} วัน จะหมดอายุสิ้นปีนี้ (เหลืออีก ${daysLeftInYear} วัน) กรุณาวางแผนใช้วันลา`,
        reference_id: b.id,
        reference_type: 'leave_balance',
      })
      results.leave_expiring++
    }
  }

  return NextResponse.json({ ok: true, date: today, results, ...(authWarning ? { warning: authWarning } : {}) })

  } catch (err) {
    console.error('[cron/daily-checks]', err)
    return NextResponse.json({
      ok: false,
      date: today,
      results, // partial counts from whichever checks completed before the failure
      error: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
