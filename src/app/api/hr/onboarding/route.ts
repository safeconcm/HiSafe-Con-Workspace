// src/app/api/hr/onboarding/route.ts
// GET /api/hr/onboarding — list onboarding checklists for HR to work through.
//
// Checklists are created lazily rather than at the hire step itself (which
// would mean touching 3 separate creation points: job-application hire,
// admin add-single-user, admin CSV import) — instead, every time this list
// is loaded, any active employee hired within the last 90 days who doesn't
// have a checklist row yet gets one auto-created with the default item
// template. This keeps new hires showing up automatically without needing
// to modify any of those existing, already-working flows.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError, isHROrAdmin,
} from '@/lib/api-helpers'
import { defaultOnboardingItems } from '@/lib/onboarding-items'

const RECENT_HIRE_WINDOW_DAYS = 90

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') // 'in_progress' | 'completed'

  const supabase = createAdminSupabaseClient()

  // Backfill: recently-hired active employees with no checklist yet.
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - RECENT_HIRE_WINDOW_DAYS)
  const { data: recentHires } = await supabase
    .from('users')
    .select('id, company_id, hire_date')
    .eq('company_id', session.company_id)
    .eq('status', 'active')
    .not('hire_date', 'is', null)
    .gte('hire_date', cutoff.toISOString().split('T')[0])

  if (recentHires?.length) {
    const { data: existing } = await supabase
      .from('onboarding_checklists')
      .select('user_id')
      .in('user_id', recentHires.map(u => u.id))
    const existingIds = new Set((existing ?? []).map(e => e.user_id))
    const toCreate = recentHires.filter(u => !existingIds.has(u.id))

    if (toCreate.length) {
      await supabase.from('onboarding_checklists').insert(
        toCreate.map(u => ({
          company_id: u.company_id,
          user_id:    u.id,
          items:      defaultOnboardingItems(),
          created_by: session.id,
        }))
      )
    }
  }

  let query = supabase
    .from('onboarding_checklists')
    .select(`
      id, status, items, completed_at, created_at,
      user:users!onboarding_checklists_user_id_fkey(
        id, employee_code, first_name_th, last_name_th, department, position_th, hire_date, avatar_url
      )
    `)
    .eq('company_id', session.company_id)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return serverError(error)

  return ok({ checklists: data ?? [] })
}
