// src/app/api/hr/salary/import/route.ts
// POST /api/hr/salary/import — bulk-submit salary adjustments from a parsed
// CSV/Excel file (2026-10-20, "ข้อ 2": year-end raises for many employees at
// once). Every row lands as status='pending', same as a one-by-one submit
// via POST /api/hr/salary — still needs an Admin/org-root MD to approve
// before payroll.ts will use it (see that route's own comment).
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden, isHROrAdmin,
} from '@/lib/api-helpers'

const MAX_ROWS = 500

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  const rows: Record<string, string>[] = body?.rows
  if (!Array.isArray(rows) || !rows.length) return badRequest('ไม่มีข้อมูลให้นำเข้า')
  if (rows.length > MAX_ROWS) return badRequest(`นำเข้าได้สูงสุด ${MAX_ROWS} รายการต่อครั้ง`)

  const supabase = createAdminSupabaseClient()

  // Resolve employee_code → user_id within this company up front
  const codes = Array.from(new Set(rows.map(r => r.employee_code?.trim().toUpperCase()).filter(Boolean)))
  const { data: users } = await supabase
    .from('users')
    .select('id, employee_code')
    .eq('company_id', session.company_id)
    .in('employee_code', codes)
  const userByCode = new Map((users ?? []).map(u => [u.employee_code.toUpperCase(), u.id]))

  const errors: { row: number; error: string }[] = []
  rows.forEach((r, i) => {
    const rowNum = i + 2
    const code = r.employee_code?.trim().toUpperCase()
    if (!code) { errors.push({ row: rowNum, error: 'ขาด employee_code' }); return }
    if (!userByCode.has(code)) { errors.push({ row: rowNum, error: `employee_code "${r.employee_code}" ไม่พบในบริษัทนี้` }); return }
    if (!r.effective_date?.trim()) errors.push({ row: rowNum, error: 'ขาด effective_date' })
    if (!r.base_salary?.trim() || isNaN(Number(r.base_salary))) errors.push({ row: rowNum, error: `base_salary "${r.base_salary}" ต้องเป็นตัวเลข` })
  })

  if (errors.length) {
    return ok({ success: false, created: 0, failed: rows.length, total: rows.length, errors })
  }

  const insertRows = rows.map(r => ({
    company_id:     session.company_id,
    user_id:        userByCode.get(r.employee_code.trim().toUpperCase())!,
    effective_date: r.effective_date.trim(),
    salary_type:    'monthly',
    base_salary:    Number(r.base_salary),
    net_salary:     Number(r.base_salary),
    reason:         r.reason?.trim() || 'ปรับเงินเดือนประจำปี (นำเข้าไฟล์)',
    status:         'pending',
    created_by:     session.id,
  }))

  const { data, error } = await supabase.from('salary_records').insert(insertRows).select('id')
  if (error) return ok({ success: false, created: 0, failed: rows.length, total: rows.length, errors: [{ row: 0, error: error.message }] })

  return ok({ success: true, created: data?.length ?? 0, failed: rows.length - (data?.length ?? 0), total: rows.length })
}
