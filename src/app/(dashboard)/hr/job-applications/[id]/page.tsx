'use client'
// src/app/(dashboard)/hr/job-applications/[id]/page.tsx
// Full detail view of one online job application, mirroring every section
// of the paper "ใบสมัครงาน" form, plus the HR-only hiring consideration
// section and a status pipeline.

import { useState, useEffect } from 'react'
import { useParams }           from 'next/navigation'
import Link      from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast }  from '@/components/ui/Toaster'
import { cn }     from '@/utils'
import {
  ArrowLeft, Loader2, Printer, FileText, Download,
  Users, GraduationCap, Briefcase, Languages, Star, Phone, Info, UserPlus, CheckCircle2,
} from 'lucide-react'
import {
  LIVING_WITH_LABEL, MILITARY_STATUS_LABEL, MARITAL_STATUS_LABEL, GENDER_LABEL,
  LANG_LEVEL_LABEL, JOB_APPLICATION_STATUS_LABEL as STATUS_LABEL,
  JOB_APPLICATION_STATUS_COLOR as STATUS_COLOR,
} from '@/types/job-application'

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="card card-body">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  )
}

export default function JobApplicationDetailPage() {
  const params = useParams()
  const id     = params.id as string
  const qc = useQueryClient()

  const { data: app, isLoading } = useQuery({
    queryKey: ['job-application', id],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/job-applications/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  const [hireForm, setHireForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!app) return
    setHireForm({
      hire_position: app.hire_position ?? '', hire_department: app.hire_department ?? '',
      hire_salary: app.hire_salary ?? '', hire_start_date: app.hire_start_date ?? '',
      hire_allowances: app.hire_allowances ?? '', hire_supervised_by: app.hire_supervised_by ?? '',
      interviewer_name: app.interviewer_name ?? '', interview_date: app.interview_date ?? '',
      hr_reviewer_name: app.hr_reviewer_name ?? '', hr_review_date: app.hr_review_date ?? '',
      approver_name: app.approver_name ?? '', approver_date: app.approver_date ?? '',
      hr_notes: app.hr_notes ?? '',
    })
  }, [app])

  const patch = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res  = await fetch(`/api/hr/job-applications/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      qc.setQueryData(['job-application', id], data)
      qc.invalidateQueries({ queryKey: ['job-applications'] })
      toast.success('บันทึกแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const [employeeCode, setEmployeeCode] = useState('')
  const [hireRole, setHireRole] = useState('employee')
  const [hiredUserId, setHiredUserId] = useState<string | null>(null)

  const hire = useMutation({
    mutationFn: async () => {
      const res  = await fetch(`/api/hr/job-applications/${id}/hire`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_code: employeeCode, role: hireRole,
          position_th: hireForm.hire_position, department: hireForm.hire_department,
          base_salary: hireForm.hire_salary, hire_date: hireForm.hire_start_date,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: (data) => {
      setHiredUserId(data.user_id)
      qc.invalidateQueries({ queryKey: ['job-application', id] })
      qc.invalidateQueries({ queryKey: ['job-applications'] })
      toast.success('รับเข้าทำงานสำเร็จ สร้างบัญชีพนักงานแล้ว')
    },
    onError: (e: Error) => toast.error('รับเข้าทำงานไม่สำเร็จ', e.message),
  })

  if (isLoading || !app) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const la = app.language_ability ?? {}
  const langRow = (label: string, k: string) => la[k] && (
    <tr>
      <td className="py-1.5 pr-3 text-gray-600">{label}{k === 'other' && la.other?.name ? ` (${la.other.name})` : ''}</td>
      <td className="py-1.5 pr-3">{LANG_LEVEL_LABEL[la[k]?.speak] ?? '—'}</td>
      <td className="py-1.5 pr-3">{LANG_LEVEL_LABEL[la[k]?.write] ?? '—'}</td>
      <td className="py-1.5">{LANG_LEVEL_LABEL[la[k]?.read] ?? '—'}</td>
    </tr>
  )

  return (
    <div className="page-container max-w-5xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/hr/job-applications" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1>{app.full_name_th}</h1>
            <p className="text-sm text-gray-500">สมัครตำแหน่ง {app.position_applied_1}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={app.status}
            onChange={e => patch.mutate({ status: e.target.value })}
            className={cn('form-input w-auto text-sm font-medium', STATUS_COLOR[app.status])}
          >
            {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Link href={`/hr/job-applications/${id}/print`} target="_blank"
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            <Printer className="w-4 h-4" />
            พิมพ์ใบสมัคร
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Personal info */}
          <Section icon={Info} title="ประวัติส่วนตัว">
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="ชื่อ-นามสกุล" value={app.full_name_th} />
              <Field label="เพศ" value={GENDER_LABEL[app.gender]} />
              <Field label="วันเกิด" value={app.birth_date} />
              <Field label="สัญชาติ" value={app.nationality} />
              <Field label="ศาสนา" value={app.religion} />
              <Field label="เชื้อชาติ" value={app.race} />
              <Field label="เลขบัตรประชาชน" value={app.id_card_no} />
              <Field label="บัตรหมดอายุ" value={app.id_card_expiry} />
              <Field label="ส่วนสูง/น้ำหนัก" value={app.height_cm || app.weight_kg ? `${app.height_cm ?? '—'} ซม. / ${app.weight_kg ?? '—'} กก.` : null} />
              <Field label="สถานภาพ" value={MARITAL_STATUS_LABEL[app.marital_status]} />
              <Field label="ภาวะทางทหาร" value={MILITARY_STATUS_LABEL[app.military_status]} />
              <Field label="อาศัยอยู่กับ" value={LIVING_WITH_LABEL[app.living_with]} />
              <Field label="โทรศัพท์" value={app.phone} />
              <Field label="มือถือ" value={app.mobile} />
              <Field label="อีเมล" value={app.email} />
              <Field label="เงินเดือนที่ต้องการ" value={app.salary_expected ? `${Number(app.salary_expected).toLocaleString()} บาท` : null} />
              <Field label="ตำแหน่งสำรอง" value={app.position_applied_2} />
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Field label="ที่อยู่ปัจจุบัน" value={[
                app.address_no && `เลขที่ ${app.address_no}`, app.address_moo && `หมู่ ${app.address_moo}`,
                app.address_road && `ถ.${app.address_road}`, app.address_sub_district, app.address_district,
                app.address_province, app.address_postal_code,
              ].filter(Boolean).join(' ')} />
            </div>
          </Section>

          {/* Family */}
          <Section icon={Users} title="ประวัติครอบครัว">
            <div className="grid sm:grid-cols-2 gap-4 mb-3">
              <Field label="บิดา" value={app.father_name ? `${app.father_name} (อายุ ${app.father_age ?? '—'} ปี, ${app.father_occupation ?? '—'}) — ${app.father_alive ? 'ยังมีชีวิต' : 'ถึงแก่กรรม'}` : null} />
              <Field label="มารดา" value={app.mother_name ? `${app.mother_name} (อายุ ${app.mother_age ?? '—'} ปี, ${app.mother_occupation ?? '—'}) — ${app.mother_alive ? 'ยังมีชีวิต' : 'ถึงแก่กรรม'}` : null} />
              <Field label="คู่สมรส" value={app.spouse_name ? `${app.spouse_name} — ${app.spouse_workplace ?? ''} ${app.spouse_position ?? ''}` : null} />
              <Field label="จำนวนบุตร" value={app.children_count} />
              <Field label="พี่น้อง" value={app.siblings_total ? `${app.siblings_total} คน (ชาย ${app.siblings_male ?? 0} หญิง ${app.siblings_female ?? 0}) เป็นบุตรคนที่ ${app.birth_order ?? '—'}` : null} />
            </div>
            {!!app.siblings?.length && (
              <table className="data-table text-xs">
                <thead><tr><th>ชื่อ</th><th>อายุ</th><th>อาชีพ</th></tr></thead>
                <tbody>{app.siblings.map((s: any, i: number) => (
                  <tr key={i}><td>{s.name || '—'}</td><td>{s.age || '—'}</td><td>{s.occupation || '—'}</td></tr>
                ))}</tbody>
              </table>
            )}
          </Section>

          {/* Education */}
          <Section icon={GraduationCap} title="การศึกษา">
            <table className="data-table text-xs">
              <thead><tr><th>ระดับ</th><th>สถาบัน</th><th>สาขา</th><th>ตั้งแต่</th><th>ถึง</th></tr></thead>
              <tbody>
                {(app.education ?? []).filter((e: any) => e.institution).map((e: any, i: number) => (
                  <tr key={i}><td>{e.level}</td><td>{e.institution}</td><td>{e.major || '—'}</td><td>{e.from || '—'}</td><td>{e.to || '—'}</td></tr>
                ))}
                {!(app.education ?? []).some((e: any) => e.institution) && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-3">ไม่ได้กรอกข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Work experience */}
          <Section icon={Briefcase} title="ประสบการณ์ทำงาน">
            <table className="data-table text-xs">
              <thead><tr><th>บริษัท</th><th>ระยะเวลา</th><th>ตำแหน่ง</th><th>ลักษณะงาน</th><th>ค่าจ้าง</th><th>เหตุที่ออก</th></tr></thead>
              <tbody>
                {(app.work_experience ?? []).filter((w: any) => w.company).map((w: any, i: number) => (
                  <tr key={i}>
                    <td>{w.company}</td><td>{w.from || '—'}–{w.to || '—'}</td><td>{w.position || '—'}</td>
                    <td>{w.job_description || '—'}</td><td>{w.salary || '—'}</td><td>{w.reason || '—'}</td>
                  </tr>
                ))}
                {!(app.work_experience ?? []).some((w: any) => w.company) && (
                  <tr><td colSpan={6} className="text-center text-gray-400 py-3">ไม่มีประสบการณ์ทำงาน</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Language + special ability */}
          <Section icon={Languages} title="ภาษาและความสามารถพิเศษ">
            <table className="data-table text-xs mb-4">
              <thead><tr><th>ภาษา</th><th>พูด</th><th>เขียน</th><th>อ่าน</th></tr></thead>
              <tbody>
                {langRow('ไทย', 'thai')}{langRow('อังกฤษ', 'english')}{langRow('ญี่ปุ่น', 'japanese')}{langRow('อื่นๆ', 'other')}
              </tbody>
            </table>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="พิมพ์ดีด" value={app.typing_thai_wpm || app.typing_english_wpm ? `ไทย ${app.typing_thai_wpm ?? 0} / อังกฤษ ${app.typing_english_wpm ?? 0} คำ/นาที` : null} />
              <Field label="คอมพิวเตอร์" value={app.computer_skill} />
              <Field label="ใบขับขี่" value={app.driving_license_no} />
              <Field label="เครื่องใช้สำนักงาน" value={app.office_machine_skill} />
              <Field label="งานอดิเรก" value={app.hobbies} />
              <Field label="กีฬาที่ชอบ" value={app.favourite_sport} />
              <Field label="ความรู้พิเศษ" value={app.special_knowledge} />
              <Field label="อื่นๆ" value={app.other_ability} />
              <Field label="ไปปฏิบัติงานต่างจังหวัด" value={app.can_work_upcountry ? `ได้${app.can_work_upcountry_note ? ' — ' + app.can_work_upcountry_note : ''}` : 'ไม่ได้'} />
            </div>
          </Section>

          {/* Background / misc */}
          <Section icon={Star} title="ข้อมูลเพิ่มเติม">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="ทราบข่าวจาก" value={app.source_of_info} />
              <Field label="เคยป่วยหนัก/โรคติดต่อร้ายแรง" value={app.had_serious_illness ? (app.serious_illness_detail || 'เคย') : 'ไม่เคย'} />
              <Field label="เคยสมัครงานกับบริษัทมาก่อน" value={app.applied_before ? (app.applied_before_when || 'เคย') : 'ไม่เคย'} />
              <Field label="ญาติ/เพื่อนที่ทำงานอยู่" value={app.known_relatives_friends} />
            </div>
            {!!app.self_introduction && <div className="mt-3 pt-3 border-t border-gray-100">
              <Field label="แนะนำตัว" value={app.self_introduction} />
            </div>}
            {!!app.reference_contacts?.length && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">บุคคลอ้างอิง</p>
                <table className="data-table text-xs">
                  <thead><tr><th>ชื่อ</th><th>ที่อยู่</th><th>โทร</th><th>อาชีพ</th></tr></thead>
                  <tbody>{app.reference_contacts.filter((r: any) => r.name).map((r: any, i: number) => (
                    <tr key={i}><td>{r.name}</td><td>{r.address || '—'}</td><td>{r.phone || '—'}</td><td>{r.occupation || '—'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          {/* Photo + files */}
          <Section icon={FileText} title="เอกสารแนบ">
            {app.photo_url && (
              <img src={app.photo_url} alt="รูปถ่าย" className="w-28 h-32 object-cover rounded-lg border border-gray-200 mb-4" />
            )}
            <div className="space-y-2">
              {[
                { url: app.id_card_copy_url,   label: 'สำเนาบัตรประชาชน' },
                { url: app.house_reg_copy_url, label: 'สำเนาทะเบียนบ้าน' },
                { url: app.education_cert_url, label: 'วุฒิการศึกษา / ใบขับขี่' },
              ].filter(f => f.url).map(f => (
                <a key={f.label} href={f.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <Download className="w-3.5 h-3.5" />{f.label}
                </a>
              ))}
              {![app.id_card_copy_url, app.house_reg_copy_url, app.education_cert_url].some(Boolean) && (
                <p className="text-xs text-gray-400">ไม่มีเอกสารแนบเพิ่มเติม</p>
              )}
            </div>
          </Section>

          {/* Emergency contact */}
          <Section icon={Phone} title="กรณีฉุกเฉิน">
            <div className="space-y-2">
              <Field label="ชื่อ" value={app.emergency_contact_name} />
              <Field label="เกี่ยวข้องเป็น" value={app.emergency_contact_relation} />
              <Field label="โทร" value={app.emergency_contact_phone} />
              <Field label="ที่อยู่" value={app.emergency_contact_address} />
            </div>
          </Section>

          {/* Internal hiring consideration */}
          <div className="card card-body space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">การพิจารณาว่าจ้าง (ภายใน)</h3>
            <div>
              <label className="form-label text-xs">ตำแหน่ง</label>
              <input className="form-input text-sm" value={hireForm.hire_position ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_position: e.target.value }))} />
            </div>
            <div>
              <label className="form-label text-xs">แผนก</label>
              <input className="form-input text-sm" value={hireForm.hire_department ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_department: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label text-xs">เงินเดือน</label>
                <input type="number" className="form-input text-sm" value={hireForm.hire_salary ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_salary: e.target.value }))} />
              </div>
              <div>
                <label className="form-label text-xs">วันที่เริ่มงาน</label>
                <input type="date" className="form-input text-sm" value={hireForm.hire_start_date ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_start_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label text-xs">ค่าใช้จ่ายพิเศษ</label>
              <input className="form-input text-sm" value={hireForm.hire_allowances ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_allowances: e.target.value }))} />
            </div>
            <div>
              <label className="form-label text-xs">บังคับบัญชาโดย</label>
              <input className="form-input text-sm" value={hireForm.hire_supervised_by ?? ''} onChange={e => setHireForm(f => ({ ...f, hire_supervised_by: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label text-xs">ผู้สัมภาษณ์</label>
                <input className="form-input text-sm" value={hireForm.interviewer_name ?? ''} onChange={e => setHireForm(f => ({ ...f, interviewer_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label text-xs">วันที่สัมภาษณ์</label>
                <input type="date" className="form-input text-sm" value={hireForm.interview_date ?? ''} onChange={e => setHireForm(f => ({ ...f, interview_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label text-xs">ฝ่ายทรัพยากรบุคคล</label>
                <input className="form-input text-sm" value={hireForm.hr_reviewer_name ?? ''} onChange={e => setHireForm(f => ({ ...f, hr_reviewer_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label text-xs">วันที่</label>
                <input type="date" className="form-input text-sm" value={hireForm.hr_review_date ?? ''} onChange={e => setHireForm(f => ({ ...f, hr_review_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="form-label text-xs">ผู้อนุมัติ</label>
                <input className="form-input text-sm" value={hireForm.approver_name ?? ''} onChange={e => setHireForm(f => ({ ...f, approver_name: e.target.value }))} />
              </div>
              <div>
                <label className="form-label text-xs">วันที่</label>
                <input type="date" className="form-input text-sm" value={hireForm.approver_date ?? ''} onChange={e => setHireForm(f => ({ ...f, approver_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="form-label text-xs">หมายเหตุ (ภายใน)</label>
              <textarea rows={3} className="form-input text-sm resize-none" value={hireForm.hr_notes ?? ''} onChange={e => setHireForm(f => ({ ...f, hr_notes: e.target.value }))} />
            </div>
            <button
              onClick={() => patch.mutate(hireForm)}
              disabled={patch.isPending}
              className="w-full rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {patch.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูลการพิจารณา'}
            </button>
          </div>

          {/* Convert to employee */}
          <div className="card card-body space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-gray-400" />
              รับเข้าทำงานเป็นพนักงาน
            </h3>
            {app.converted_user_id || hiredUserId ? (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3 text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>รับเข้าทำงานแล้ว —{' '}
                  <Link href={`/admin/users/${hiredUserId ?? app.converted_user_id}`} className="underline font-medium">
                    ดูข้อมูลพนักงาน
                  </Link>
                </span>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400">
                  สร้างบัญชีพนักงานจากข้อมูลในใบสมัคร (ชื่อ อีเมล เบอร์โทร รูปถ่าย) พร้อมสัญญาทดลองงานเริ่มต้น — ใช้ข้อมูล ตำแหน่ง/แผนก/เงินเดือน/วันเริ่มงาน จากช่อง &quot;การพิจารณาว่าจ้าง&quot; ด้านบน
                </p>
                <div>
                  <label className="form-label text-xs">รหัสพนักงาน *</label>
                  <input className="form-input text-sm" value={employeeCode} onChange={e => setEmployeeCode(e.target.value)} placeholder="เช่น SC-045" />
                </div>
                <div>
                  <label className="form-label text-xs">Role</label>
                  <select className="form-input text-sm" value={hireRole} onChange={e => setHireRole(e.target.value)}>
                    <option value="employee">พนักงาน</option>
                    <option value="supervisor">หัวหน้างาน</option>
                    <option value="hr">HR</option>
                  </select>
                </div>
                <button
                  onClick={() => hire.mutate()}
                  disabled={!employeeCode.trim() || hire.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-lg bg-green-700 text-white px-4 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-60"
                >
                  {hire.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  รับเข้าทำงาน
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
