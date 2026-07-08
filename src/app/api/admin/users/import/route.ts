// src/app/api/admin/users/import/route.ts
// POST /api/admin/users/import
// Accepts parsed CSV rows as JSON, validates, bulk-creates users

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog,
} from '@/lib/api-helpers'

interface ImportRow {
  company_code?:          string
  employee_code:          string
  email:                  string
  first_name_th:          string
  last_name_th:           string
  first_name_en?:         string
  last_name_en?:          string
  position_th?:           string
  department?:            string
  role?:                  string
  hire_date:              string
  phone?:                 string
  annual_leave_balance?:  string | number
  sick_leave_balance?:    string | number
  personal_leave_balance?: string | number
}

const VALID_ROLES = ['employee', 'supervisor', 'hr', 'admin']

// Accept common Thai / English aliases so HR staff don't have to memorize the
// exact enum code when typing into Excel. Keys are lowercased before lookup
// (Thai has no case, so this only affects the English aliases).
const ROLE_ALIASES: Record<string, string> = {
  employee: 'employee', staff: 'employee', 'พนักงาน': 'employee', 'พนง': 'employee', 'พนง.': 'employee',
  supervisor: 'supervisor', manager: 'supervisor', md: 'supervisor',
  'หัวหน้างาน': 'supervisor', 'หัวหน้า': 'supervisor', 'ผู้จัดการ': 'supervisor', 'ผจก': 'supervisor', 'ผจก.': 'supervisor',
  hr: 'hr', 'human resource': 'hr', 'ฝ่ายบุคคล': 'hr', 'บุคคล': 'hr', 'เจ้าหน้าที่บุคคล': 'hr',
  admin: 'admin', administrator: 'admin', 'ผู้ดูแลระบบ': 'admin', 'แอดมิน': 'admin',
}

function normalizeRole(raw?: string): string {
  const key = (raw ?? '').trim()
  if (!key) return 'employee'
  return ROLE_ALIASES[key.toLowerCase()] ?? ROLE_ALIASES[key] ?? key
}

/**
 * Accepts ISO (YYYY-MM-DD), YYYY/MM/DD, and the day-first D/M/YYYY format
 * Thai staff commonly type into Excel (e.g. "26/6/2026"). Returns null if
 * the string can't be confidently parsed, so the caller can report an error
 * instead of silently guessing wrong.
 */
function normalizeDate(raw?: string): string | null {
  const s = (raw ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  let m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }

  // Day-first (Thai convention): D/M/YYYY or D-M-YYYY
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body?.rows || !Array.isArray(body.rows)) return badRequest('rows array required')

  const rows: ImportRow[] = body.rows
  if (rows.length === 0) return badRequest('ไม่มีข้อมูลในไฟล์')
  if (rows.length > 500) return badRequest('นำเข้าได้สูงสุด 500 รายการต่อครั้ง')

  const supabase    = createAdminSupabaseClient()
  const currentYear = new Date().getFullYear()

  // ── Resolve company_code → company_id ────────────────────────
  // An admin may be linked to more than one company (see company-context.ts).
  // Each row can target a different company via its company_code column;
  // rows with no company_code fall back to the admin's current active company.
  const linkedCompanyIds = (session.available_companies?.length
    ? session.available_companies.map(c => c.id)
    : [session.company_id])

  const { data: companyRows } = await supabase
    .from('companies')
    .select('id, code')
    .in('id', linkedCompanyIds)

  const companyByCode = new Map((companyRows ?? []).map(c => [c.code.toUpperCase(), c.id]))

  // Pre-validate all rows first
  const validationErrors: { row: number; error: string }[] = []
  const emailSet = new Set<string>()
  const codeSet  = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i]
    const idx = i + 2 // row number (1=header, 2=first data row)

    if (!r.employee_code?.trim()) validationErrors.push({ row: idx, error: 'employee_code ว่าง' })
    if (!r.email?.trim())         validationErrors.push({ row: idx, error: 'email ว่าง' })
    if (!r.first_name_th?.trim()) validationErrors.push({ row: idx, error: 'first_name_th ว่าง' })
    if (!r.last_name_th?.trim())  validationErrors.push({ row: idx, error: 'last_name_th ว่าง' })
    if (!r.hire_date?.trim())     validationErrors.push({ row: idx, error: 'hire_date ว่าง' })

    const companyCode = r.company_code?.trim().toUpperCase()
    if (!companyCode) {
      validationErrors.push({ row: idx, error: 'company_code ว่าง' })
    } else if (!companyByCode.has(companyCode)) {
      validationErrors.push({ row: idx, error: `company_code "${r.company_code}" ไม่ถูกต้อง (ต้องเป็น ${[...companyByCode.keys()].join(' หรือ ')})` })
    }

    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
      validationErrors.push({ row: idx, error: `email "${r.email}" ไม่ถูกต้อง` })
    }

    // Normalize hire_date in place (accepts YYYY-MM-DD, YYYY/MM/DD, D/M/YYYY)
    // so the rest of the pipeline only ever sees ISO dates.
    if (r.hire_date) {
      const normalizedDate = normalizeDate(r.hire_date)
      if (!normalizedDate) {
        validationErrors.push({ row: idx, error: `hire_date "${r.hire_date}" ไม่ถูกต้อง (ใช้รูปแบบ YYYY-MM-DD หรือ D/M/YYYY เช่น 26/6/2026)` })
      } else {
        r.hire_date = normalizedDate
      }
    }

    // Normalize role in place (accepts Thai labels like "หัวหน้างาน", "พนักงาน")
    if (r.role) {
      const normalizedRole = normalizeRole(r.role)
      if (!VALID_ROLES.includes(normalizedRole)) {
        validationErrors.push({ row: idx, error: `role "${r.role}" ไม่ถูกต้อง (รองรับ: employee/พนักงาน, supervisor/หัวหน้างาน, hr/ฝ่ายบุคคล, admin/ผู้ดูแลระบบ)` })
      } else {
        r.role = normalizedRole
      }
    }

    // Duplicate check within file (employee_code is unique per company)
    const emailKey = r.email?.toLowerCase()
    const codeKey  = `${companyCode}:${r.employee_code?.toUpperCase()}`
    if (emailKey && emailSet.has(emailKey)) validationErrors.push({ row: idx, error: `email "${r.email}" ซ้ำในไฟล์` })
    if (codeKey  && codeSet.has(codeKey))  validationErrors.push({ row: idx, error: `employee_code "${r.employee_code}" ซ้ำในไฟล์ (บริษัทเดียวกัน)` })
    if (emailKey) emailSet.add(emailKey)
    if (codeKey)  codeSet.add(codeKey)
  }

  // Check against DB for existing emails
  const emails = rows.map(r => r.email?.toLowerCase()).filter(Boolean)
  const { data: existingUsers } = await supabase
    .from('users').select('email').in('email', emails)
  const existingEmails = new Set((existingUsers ?? []).map((u: any) => u.email.toLowerCase()))

  for (let i = 0; i < rows.length; i++) {
    if (existingEmails.has(rows[i].email?.toLowerCase())) {
      validationErrors.push({ row: i + 2, error: `email "${rows[i].email}" มีในระบบแล้ว` })
    }
  }

  if (validationErrors.length > 0) {
    return ok({
      success: false,
      created: 0,
      failed:  rows.length,
      total:   rows.length,
      errors:  validationErrors,
    })
  }

  // ── Bulk create ──────────────────────────────────────────────
  const results: { row: number; employee_code: string; success: boolean; error?: string }[] = []
  let successCount = 0

  for (let i = 0; i < rows.length; i++) {
    const r          = rows[i]
    const idx        = i + 2
    const companyId  = companyByCode.get(r.company_code!.trim().toUpperCase())!

    try {
      // Create auth user
      const defaultPassword = `Hsc${r.employee_code}2024!`
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email:         r.email.trim().toLowerCase(),
        password:      defaultPassword,
        email_confirm: true,
      })
      if (authErr) throw new Error(authErr.message)

      // Create profile
      const { data: user, error: userErr } = await supabase
        .from('users')
        .insert({
          company_id:    companyId,
          employee_code: r.employee_code.trim().toUpperCase(),
          auth_user_id:  authData.user.id,
          email:         r.email.trim().toLowerCase(),
          first_name_th: r.first_name_th.trim(),
          last_name_th:  r.last_name_th.trim(),
          first_name_en: r.first_name_en?.trim() ?? null,
          last_name_en:  r.last_name_en?.trim()  ?? null,
          position_th:   r.position_th?.trim()   ?? null,
          department:    r.department?.trim()     ?? null,
          role:          r.role ?? 'employee',
          hire_date:     r.hire_date,
          phone:         r.phone?.trim()          ?? null,
          status:        'active',
          imported_at:   new Date().toISOString(),
        })
        .select('id')
        .single()

      if (userErr) {
        await supabase.auth.admin.deleteUser(authData.user.id)
        throw new Error(userErr.message)
      }

      // Init leave balances
      await supabase.rpc('init_leave_balances', {
        p_user_id:    user.id,
        p_company_id: companyId,
        p_hire_date:  r.hire_date,
        p_year:       currentYear,
      }).then(() => {}, () => {})

      // Override balances if provided
      const balanceOverrides: { leave_type: string; quota_days: number }[] = []
      if (r.annual_leave_balance   !== undefined && r.annual_leave_balance   !== '')
        balanceOverrides.push({ leave_type: 'annual',   quota_days: Number(r.annual_leave_balance)   })
      if (r.sick_leave_balance     !== undefined && r.sick_leave_balance     !== '')
        balanceOverrides.push({ leave_type: 'sick',     quota_days: Number(r.sick_leave_balance)     })
      if (r.personal_leave_balance !== undefined && r.personal_leave_balance !== '')
        balanceOverrides.push({ leave_type: 'personal', quota_days: Number(r.personal_leave_balance) })

      for (const b of balanceOverrides) {
        await supabase.from('leave_balances').upsert({
          company_id:  companyId,
          user_id:     user.id,
          leave_type:  b.leave_type,
          year:        currentYear,
          quota_days:  b.quota_days,
        }, { onConflict: 'user_id,leave_type,year' })
      }

      results.push({ row: idx, employee_code: r.employee_code, success: true })
      successCount++

    } catch (err: any) {
      results.push({ row: idx, employee_code: r.employee_code, success: false, error: err.message })
    }
  }

  await writeAuditLog({
    session, action: 'users.bulk_imported', entity_type: 'user',
    new_data: { total: rows.length, success: successCount, failed: rows.length - successCount }, req,
  })

  return ok({
    success:    true,
    created:    successCount,
    failed:     rows.length - successCount,
    total:      rows.length,
    results,
  })
}
