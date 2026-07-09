// src/app/api/work-schedule/month/route.ts
// GET /api/work-schedule/month?year=&month= — this company's per-day
// working-day map for a given month (weekly pattern + date overrides
// combined — see src/lib/work-schedule.ts). Any authenticated user can
// read this (it's cosmetic scheduling info, not sensitive), unlike
// /api/hr/work-schedule which also exposes edit rights and is HR/admin-
// only for writes. Used by pages that shade weekends/working days but
// aren't already fetching a timesheet (e.g. the team leave calendar).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized,
} from '@/lib/api-helpers'
import { getWorkingDayMapForMonth } from '@/lib/work-schedule'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const year  = parseInt(searchParams.get('year')  ?? '')
  const month = parseInt(searchParams.get('month') ?? '')
  if (!year || !month || month < 1 || month > 12) return badRequest('year/month invalid')

  const supabase = createAdminSupabaseClient()
  const workingDayMap = await getWorkingDayMapForMonth(supabase, session.company_id, year, month)

  return ok({ workingDays: Object.fromEntries(workingDayMap) })
}
