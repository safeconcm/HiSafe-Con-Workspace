// src/app/api/public/job-applications/route.ts
// POST /api/public/job-applications
// Public, unauthenticated endpoint behind the /apply/[company] form.
// Accepts multipart/form-data: a "data" field (JSON payload) plus up to
// four file fields (photo required, others optional). Uses the service-role
// client throughout — there is no anon INSERT policy on job_applications or
// the job-applications storage bucket, so this route is the only write path.

import { NextRequest } from 'next/server'
import { createAdminSupabaseClient, ok, badRequest, serverError } from '@/lib/api-helpers'
import type { JobApplicationPayload } from '@/types/job-application'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB, matches the bucket's file_size_limit
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

/** Thai national ID: 13 digits + mod-11 checksum on the last digit. */
function isValidThaiId(raw: string): boolean {
  const id = raw.replace(/[^0-9]/g, '')
  if (id.length !== 13) return false
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i)
  const check = (11 - (sum % 11)) % 10
  return check === Number(id[12])
}

async function uploadFile(
  supabase: ReturnType<typeof createAdminSupabaseClient>,
  file: File, companyCode: string, applicationId: string, slot: string
): Promise<string | null> {
  if (!file || file.size === 0) return null
  if (file.size > MAX_FILE_BYTES) throw new Error(`ไฟล์ "${slot}" ใหญ่เกิน 5MB`)
  if (!ALLOWED_MIME.includes(file.type)) throw new Error(`ไฟล์ "${slot}" ต้องเป็น JPG, PNG หรือ PDF เท่านั้น`)

  const ext  = file.name.split('.').pop() || 'bin'
  const path = `${companyCode}/${applicationId}/${slot}.${ext}`
  const buf  = await file.arrayBuffer()

  const { error } = await supabase.storage.from('job-applications').upload(path, buf, {
    contentType: file.type, upsert: true,
  })
  if (error) throw new Error(`อัปโหลด "${slot}" ไม่สำเร็จ: ${error.message}`)
  return path
}

export async function POST(req: NextRequest) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return badRequest('รูปแบบข้อมูลไม่ถูกต้อง')
  }

  const companyCode = String(form.get('company_code') ?? '').trim().toUpperCase()
  if (!companyCode) return badRequest('ไม่พบบริษัทที่สมัคร')

  const rawData = form.get('data')
  if (typeof rawData !== 'string') return badRequest('ไม่พบข้อมูลใบสมัคร')

  let payload: JobApplicationPayload
  try {
    payload = JSON.parse(rawData)
  } catch {
    return badRequest('ข้อมูลใบสมัครไม่ถูกต้อง')
  }

  // ── Required-field validation (mirrors the paper form's mandatory fields) ──
  const required: [keyof JobApplicationPayload, string][] = [
    ['position_applied_1', 'ตำแหน่งที่ต้องการ'],
    ['full_name_th',       'ชื่อ-นามสกุล'],
    ['mobile',              'เบอร์มือถือ'],
    ['email',                'อีเมล'],
    ['birth_date',            'วันเดือนปีเกิด'],
    ['id_card_no',             'เลขบัตรประชาชน'],
    ['gender',                  'เพศ'],
  ]
  for (const [key, label] of required) {
    if (!String(payload[key] ?? '').trim()) return badRequest(`กรุณากรอก${label}`)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) return badRequest('อีเมลไม่ถูกต้อง')
  if (!isValidThaiId(payload.id_card_no)) return badRequest('เลขบัตรประชาชนไม่ถูกต้อง (ต้องเป็นตัวเลข 13 หลัก)')
  if (!payload.consent_confirmed) return badRequest('กรุณายืนยันความถูกต้องของข้อมูลก่อนส่งใบสมัคร')

  // Basic length caps — a public, unauthenticated form shouldn't accept
  // unbounded strings into free-text fields.
  const MAX_SHORT = 200, MAX_LONG = 4000
  const longFields: (keyof JobApplicationPayload)[] = ['self_introduction', 'special_knowledge', 'other_ability']
  for (const key of Object.keys(payload) as (keyof JobApplicationPayload)[]) {
    const val = payload[key]
    if (typeof val === 'string') {
      const limit = longFields.includes(key) ? MAX_LONG : MAX_SHORT
      if (val.length > limit) return badRequest(`ข้อมูล "${String(key)}" ยาวเกินไป`)
    }
  }

  const photo = form.get('photo')
  if (!(photo instanceof File) || photo.size === 0) return badRequest('กรุณาแนบรูปถ่าย')

  const supabase = createAdminSupabaseClient()

  // ── Rate limit: max 5 submissions per IP per 30 minutes ──────────────
  // Uses the existing submitted_ip column already stored on this table —
  // no new table or external service needed. Generous enough for a few
  // family members applying from the same home/office connection, but
  // stops a scripted flood of fake applications.
  const submitterIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  if (submitterIp) {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('job_applications')
      .select('id', { count: 'exact', head: true })
      .eq('submitted_ip', submitterIp)
      .gte('created_at', thirtyMinAgo)
    if ((recentCount ?? 0) >= 5) {
      return badRequest('ส่งใบสมัครถี่เกินไป กรุณาลองใหม่อีกครั้งภายหลัง')
    }
  }

  const { data: company, error: companyErr } = await supabase
    .from('companies').select('id, code').eq('code', companyCode).eq('is_active', true).single()
  if (companyErr || !company) return badRequest('ไม่พบบริษัทที่สมัคร')

  // Row created first (without file URLs) so uploads can be keyed by its id.
  const { data: inserted, error: insertErr } = await supabase
    .from('job_applications')
    .insert({
      company_id: company.id,

      position_applied_1: payload.position_applied_1.trim(),
      position_applied_2: payload.position_applied_2?.trim() || null,
      salary_expected:     payload.salary_expected ? Number(payload.salary_expected) : null,

      full_name_th:          payload.full_name_th.trim(),
      address_no:              payload.address_no || null,
      address_moo:              payload.address_moo || null,
      address_road:              payload.address_road || null,
      address_sub_district:       payload.address_sub_district || null,
      address_district:            payload.address_district || null,
      address_province:             payload.address_province || null,
      address_postal_code:           payload.address_postal_code || null,
      phone:                          payload.phone || null,
      mobile:                          payload.mobile.trim(),
      email:                            payload.email.trim().toLowerCase(),
      living_with:                      payload.living_with || null,
      birth_date:                        payload.birth_date,
      race:                               payload.race || null,
      nationality:                         payload.nationality || null,
      religion:                            payload.religion || null,
      id_card_no:                          payload.id_card_no.trim(),
      id_card_expiry:                      payload.id_card_expiry || null,
      height_cm:                           payload.height_cm ? Number(payload.height_cm) : null,
      weight_kg:                           payload.weight_kg ? Number(payload.weight_kg) : null,
      military_status:                     payload.military_status || null,
      marital_status:                      payload.marital_status || null,
      gender:                              payload.gender,

      father_name:       payload.father_name || null,
      father_age:         payload.father_age ? Number(payload.father_age) : null,
      father_occupation:   payload.father_occupation || null,
      father_alive:         payload.father_alive,
      mother_name:           payload.mother_name || null,
      mother_age:             payload.mother_age ? Number(payload.mother_age) : null,
      mother_occupation:       payload.mother_occupation || null,
      mother_alive:             payload.mother_alive,
      spouse_name:               payload.spouse_name || null,
      spouse_workplace:            payload.spouse_workplace || null,
      spouse_position:               payload.spouse_position || null,
      children_count:                 payload.children_count ? Number(payload.children_count) : null,
      siblings_total:                   payload.siblings_total ? Number(payload.siblings_total) : null,
      siblings_male:                     payload.siblings_male ? Number(payload.siblings_male) : null,
      siblings_female:                     payload.siblings_female ? Number(payload.siblings_female) : null,
      birth_order:                          payload.birth_order ? Number(payload.birth_order) : null,
      siblings:                              payload.siblings ?? [],

      education:        payload.education ?? [],
      work_experience:  payload.work_experience ?? [],
      language_ability: payload.language_ability ?? {},

      typing_thai_wpm:       payload.typing_thai_wpm ? Number(payload.typing_thai_wpm) : null,
      typing_english_wpm:     payload.typing_english_wpm ? Number(payload.typing_english_wpm) : null,
      computer_skill:           payload.computer_skill || null,
      driving_license_no:        payload.driving_license_no || null,
      office_machine_skill:        payload.office_machine_skill || null,
      hobbies:                       payload.hobbies || null,
      favourite_sport:                 payload.favourite_sport || null,
      special_knowledge:                 payload.special_knowledge || null,
      other_ability:                       payload.other_ability || null,
      can_work_upcountry:                    payload.can_work_upcountry === 'yes',
      can_work_upcountry_note:                 payload.can_work_upcountry_note || null,

      emergency_contact_name:      payload.emergency_contact_name || null,
      emergency_contact_relation:    payload.emergency_contact_relation || null,
      emergency_contact_address:      payload.emergency_contact_address || null,
      emergency_contact_phone:          payload.emergency_contact_phone || null,

      source_of_info:            payload.source_of_info || null,
      had_serious_illness:        payload.had_serious_illness === 'yes',
      serious_illness_detail:      payload.serious_illness_detail || null,
      applied_before:                payload.applied_before === 'yes',
      applied_before_when:             payload.applied_before_when || null,
      known_relatives_friends:           payload.known_relatives_friends || null,
      reference_contacts:                  payload.reference_contacts ?? [],
      self_introduction:                     payload.self_introduction || null,

      signature_data_url:  payload.signature_data_url || null,
      consent_confirmed:    true,
      submitted_ip:          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      submitted_user_agent:   req.headers.get('user-agent') || null,

      status: 'new',
    })
    .select('id')
    .single()

  if (insertErr || !inserted) return serverError(insertErr ?? new Error('บันทึกใบสมัครไม่สำเร็จ'))

  // ── File uploads (best-effort per-file; failures reported, row already saved) ──
  const fileUrls: Record<string, string | null> = {}
  try {
    fileUrls.photo_url               = await uploadFile(supabase, photo as File, companyCode, inserted.id, 'photo')
    const idCard   = form.get('id_card_copy')
    const houseReg = form.get('house_reg_copy')
    const eduOrLic = form.get('education_or_license')
    if (idCard   instanceof File) fileUrls.id_card_copy_url  = await uploadFile(supabase, idCard,   companyCode, inserted.id, 'id_card_copy')
    if (houseReg instanceof File) fileUrls.house_reg_copy_url = await uploadFile(supabase, houseReg, companyCode, inserted.id, 'house_reg_copy')
    if (eduOrLic instanceof File) fileUrls.education_cert_url = await uploadFile(supabase, eduOrLic, companyCode, inserted.id, 'education_or_license')
  } catch (err: any) {
    // Row already exists — update whatever uploaded successfully, then report the error
    await supabase.from('job_applications').update(fileUrls).eq('id', inserted.id)
    return badRequest(err.message ?? 'อัปโหลดไฟล์ไม่สำเร็จ')
  }

  await supabase.from('job_applications').update(fileUrls).eq('id', inserted.id)

  return ok({ id: inserted.id })
}
