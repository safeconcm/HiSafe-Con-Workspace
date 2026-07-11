// src/app/api/hr/holidays/sync/route.ts
// POST — auto-generate Thailand's national public holiday set for a given
// year (HR/Admin only) and insert any not already present for this company.
//
// Never overwrites or duplicates existing rows:
//   - dates already active for this company are skipped as-is (so any
//     manual edit HR made to an existing holiday is left untouched)
//   - dates that exist but were soft-deleted (is_active = false) are
//     reactivated with the computed name, rather than attempting a second
//     insert that would violate uq_company_holiday_date(company_id, holiday_date)
//
// See src/lib/thai-holidays-data.ts for what is/isn't included and why
// (no live API for Thailand exists; ad-hoc government "bridge" holidays
// still require manual entry via the regular add-holiday form).

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'
import { computeThaiHolidaysForYear } from '@/lib/thai-holidays-data'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => ({}))
  const year = Number(body?.year)
  if (!year || year < 2020 || year > 2100) return badRequest('year (2020-2100) required')

  const { holidays, lunarConfidence } = computeThaiHolidaysForYear(year)

  const supabase = createAdminSupabaseClient()

  // Look up every existing row (active or soft-deleted) for this company in
  // the target year so we know, per computed date, whether to insert,
  // reactivate, or skip.
  const { data: existingRows, error: existingErr } = await supabase
    .from('holidays')
    .select('id, holiday_date, is_active')
    .eq('company_id', session.company_id)
    .eq('year', year)
  if (existingErr) return serverError(existingErr)

  const existingByDate = new Map((existingRows ?? []).map(r => [r.holiday_date, r]))

  const toInsert = holidays.filter(h => !existingByDate.has(h.holiday_date))
  const toReactivate = holidays.filter(h => existingByDate.get(h.holiday_date)?.is_active === false)
  const skipped = holidays.length - toInsert.length - toReactivate.length

  let insertedRows: any[] = []
  if (toInsert.length) {
    const { data, error } = await supabase
      .from('holidays')
      .insert(toInsert.map(h => ({
        company_id:   session.company_id,
        holiday_date: h.holiday_date,
        name_th:      h.name_th,
        name_en:      h.name_en,
        type:         'national',
        created_by:   session.id,
      })))
      .select()
    if (error) return serverError(error)
    insertedRows = data ?? []
  }

  if (toReactivate.length) {
    for (const h of toReactivate) {
      const row = existingByDate.get(h.holiday_date)!
      await supabase.from('holidays').update({ is_active: true, name_th: h.name_th, name_en: h.name_en }).eq('id', row.id)
    }
  }

  await writeAuditLog({
    session, action: 'holiday.synced', entity_type: 'holiday', entity_id: session.company_id,
    new_data: { year, inserted: insertedRows.length, reactivated: toReactivate.length, skipped },
    req,
  })

  return ok({
    year,
    inserted: insertedRows.length,
    reactivated: toReactivate.length,
    skipped,
    total_computed: holidays.length,
    lunar_confidence: lunarConfidence, // 'confirmed' | 'estimated' | null (null = no lunar data for this year yet)
  })
}
