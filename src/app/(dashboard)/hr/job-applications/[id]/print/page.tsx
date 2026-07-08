'use client'
// src/app/(dashboard)/hr/job-applications/[id]/print/page.tsx
// Print-formatted rendition of one application, laid out to mirror the
// sections of the original paper "ใบสมัครงาน" form with the correct
// company branding (Safecon or Highcon), ready for window.print().

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import {
  LIVING_WITH_LABEL, MILITARY_STATUS_LABEL, MARITAL_STATUS_LABEL, GENDER_LABEL,
  LANG_LEVEL_LABEL,
} from '@/types/job-application'

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5 border-b border-dotted border-gray-300">
      <span className="text-gray-500 shrink-0 w-32">{label}</span>
      <span className="flex-1 text-gray-900">{value || ' '}</span>
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-wide text-gray-700 bg-gray-100 px-2 py-1 mt-4 mb-2 first:mt-0">{children}</h2>
}

export default function PrintApplicationPage() {
  const params = useParams()
  const id     = params.id as string

  const { data: app, isLoading } = useQuery({
    queryKey: ['job-application', id],
    queryFn: async () => {
      const res  = await fetch(`/api/hr/job-applications/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
  })

  useEffect(() => { document.title = app ? `ใบสมัครงาน - ${app.full_name_th}` : 'ใบสมัครงาน' }, [app])

  if (isLoading || !app) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  const logoSrc  = app.company?.code === 'HIGHCON' ? '/logos/highcon.png' : '/logos/safecon.png'
  const la       = app.language_ability ?? {}
  const langCell = (k: string) => la[k]
    ? `พูด:${LANG_LEVEL_LABEL[la[k]?.speak] ?? '—'} เขียน:${LANG_LEVEL_LABEL[la[k]?.write] ?? '—'} อ่าน:${LANG_LEVEL_LABEL[la[k]?.read] ?? '—'}`
    : null

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto">
      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <Link href={`/hr/job-applications/${id}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />กลับ
        </Link>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800">
          <Printer className="w-4 h-4" />พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>

      {/* Document */}
      <div className="print-page max-w-3xl mx-auto bg-white my-6 p-8 shadow-sm text-[11px] leading-relaxed">

        {/* Letterhead */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-gray-800">
          <Image src={logoSrc} alt={app.company?.name_th ?? ''} width={110} height={50} className="object-contain" />
          <div className="text-center flex-1">
            <p className="text-sm font-bold">APPLICATION FOR EMPLOYMENT</p>
            <p className="text-base font-bold">ใบสมัครงาน</p>
          </div>
          {app.photo_url
            ? <img src={app.photo_url} alt="รูปถ่าย" className="w-16 h-20 object-cover border border-gray-400" />
            : <div className="w-16 h-20 border border-gray-400 flex items-center justify-center text-[9px] text-gray-400">รูปถ่าย</div>}
        </div>

        <Heading>ข้อมูลตำแหน่งที่สมัคร</Heading>
        <Row label="ชื่อ-นามสกุล" value={app.full_name_th} />
        <Row label="ตำแหน่งที่ต้องการ" value={[app.position_applied_1, app.position_applied_2].filter(Boolean).join(' / ')} />
        <Row label="เงินเดือนที่ต้องการ" value={app.salary_expected ? `${Number(app.salary_expected).toLocaleString()} บาท/เดือน` : null} />

        <Heading>ประวัติส่วนตัว</Heading>
        <Row label="ที่อยู่ปัจจุบัน" value={[
          app.address_no && `เลขที่ ${app.address_no}`, app.address_moo && `หมู่ ${app.address_moo}`,
          app.address_road && `ถ.${app.address_road}`, app.address_sub_district, app.address_district,
          app.address_province, app.address_postal_code,
        ].filter(Boolean).join(' ')} />
        <Row label="โทรศัพท์ / มือถือ" value={[app.phone, app.mobile].filter(Boolean).join(' / ')} />
        <Row label="อีเมล" value={app.email} />
        <Row label="อาศัยอยู่กับ" value={LIVING_WITH_LABEL[app.living_with]} />
        <Row label="วัน เดือน ปีเกิด" value={app.birth_date} />
        <Row label="เชื้อชาติ / สัญชาติ / ศาสนา" value={[app.race, app.nationality, app.religion].filter(Boolean).join(' / ')} />
        <Row label="เลขบัตรประชาชน" value={app.id_card_no} />
        <Row label="บัตรหมดอายุ" value={app.id_card_expiry} />
        <Row label="ส่วนสูง / น้ำหนัก" value={app.height_cm || app.weight_kg ? `${app.height_cm ?? '—'} ซม. / ${app.weight_kg ?? '—'} กก.` : null} />
        <Row label="ภาวะทางทหาร" value={MILITARY_STATUS_LABEL[app.military_status]} />
        <Row label="สถานภาพ" value={MARITAL_STATUS_LABEL[app.marital_status]} />
        <Row label="เพศ" value={GENDER_LABEL[app.gender]} />

        <Heading>ประวัติครอบครัว</Heading>
        <Row label="บิดา" value={app.father_name ? `${app.father_name} อายุ ${app.father_age ?? '—'} ปี อาชีพ ${app.father_occupation ?? '—'} (${app.father_alive ? 'ยังมีชีวิต' : 'ถึงแก่กรรม'})` : null} />
        <Row label="มารดา" value={app.mother_name ? `${app.mother_name} อายุ ${app.mother_age ?? '—'} ปี อาชีพ ${app.mother_occupation ?? '—'} (${app.mother_alive ? 'ยังมีชีวิต' : 'ถึงแก่กรรม'})` : null} />
        <Row label="คู่สมรส" value={app.spouse_name ? `${app.spouse_name} — ${app.spouse_workplace ?? ''} ${app.spouse_position ?? ''}` : null} />
        <Row label="บุตร / พี่น้อง" value={`บุตร ${app.children_count ?? 0} คน · พี่น้อง ${app.siblings_total ?? 0} คน (ชาย ${app.siblings_male ?? 0} หญิง ${app.siblings_female ?? 0}) เป็นบุตรคนที่ ${app.birth_order ?? '—'}`} />

        <Heading>การศึกษา</Heading>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="border-b border-gray-400">
            <th className="text-left py-1">ระดับ</th><th className="text-left">สถาบัน</th><th className="text-left">สาขา</th><th className="text-left">ตั้งแต่</th><th className="text-left">ถึง</th>
          </tr></thead>
          <tbody>
            {(app.education ?? []).filter((e: any) => e.institution).map((e: any, i: number) => (
              <tr key={i} className="border-b border-dotted border-gray-300">
                <td className="py-0.5">{e.level}</td><td>{e.institution}</td><td>{e.major || '—'}</td><td>{e.from || '—'}</td><td>{e.to || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Heading>ประสบการณ์ทำงาน</Heading>
        <table className="w-full border-collapse text-[10px]">
          <thead><tr className="border-b border-gray-400">
            <th className="text-left py-1">บริษัท</th><th className="text-left">ระยะเวลา</th><th className="text-left">ตำแหน่ง</th><th className="text-left">ลักษณะงาน</th><th className="text-left">ค่าจ้าง</th><th className="text-left">เหตุที่ออก</th>
          </tr></thead>
          <tbody>
            {(app.work_experience ?? []).filter((w: any) => w.company).map((w: any, i: number) => (
              <tr key={i} className="border-b border-dotted border-gray-300">
                <td className="py-0.5">{w.company}</td><td>{w.from || '—'}–{w.to || '—'}</td><td>{w.position || '—'}</td>
                <td>{w.job_description || '—'}</td><td>{w.salary || '—'}</td><td>{w.reason || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Heading>ภาษา</Heading>
        <Row label="ไทย" value={langCell('thai')} />
        <Row label="อังกฤษ" value={langCell('english')} />
        <Row label="ญี่ปุ่น" value={langCell('japanese')} />
        {la.other?.name && <Row label={`อื่นๆ (${la.other.name})`} value={langCell('other')} />}

        <Heading>ความสามารถพิเศษ</Heading>
        <Row label="พิมพ์ดีด" value={(app.typing_thai_wpm || app.typing_english_wpm) ? `ไทย ${app.typing_thai_wpm ?? 0} / อังกฤษ ${app.typing_english_wpm ?? 0} คำ/นาที` : null} />
        <Row label="คอมพิวเตอร์" value={app.computer_skill} />
        <Row label="ใบขับขี่" value={app.driving_license_no} />
        <Row label="เครื่องใช้สำนักงาน" value={app.office_machine_skill} />
        <Row label="งานอดิเรก / กีฬาที่ชอบ" value={[app.hobbies, app.favourite_sport].filter(Boolean).join(' / ')} />
        <Row label="ความรู้พิเศษ / อื่นๆ" value={[app.special_knowledge, app.other_ability].filter(Boolean).join(' / ')} />
        <Row label="ไปปฏิบัติงานต่างจังหวัด" value={app.can_work_upcountry ? `ได้${app.can_work_upcountry_note ? ' — ' + app.can_work_upcountry_note : ''}` : 'ไม่ได้'} />

        <Heading>กรณีฉุกเฉิน / ข้อมูลเพิ่มเติม</Heading>
        <Row label="ผู้ติดต่อฉุกเฉิน" value={[app.emergency_contact_name, app.emergency_contact_relation, app.emergency_contact_phone].filter(Boolean).join(' · ')} />
        <Row label="ที่อยู่ผู้ติดต่อ" value={app.emergency_contact_address} />
        <Row label="ทราบข่าวจาก" value={app.source_of_info} />
        <Row label="เคยป่วยหนัก/โรคติดต่อร้ายแรง" value={app.had_serious_illness ? (app.serious_illness_detail || 'เคย') : 'ไม่เคย'} />
        <Row label="เคยสมัครงานมาก่อน" value={app.applied_before ? (app.applied_before_when || 'เคย') : 'ไม่เคย'} />
        <Row label="ญาติ/เพื่อนที่ทำงานอยู่" value={app.known_relatives_friends} />

        {!!app.reference_contacts?.filter((r: any) => r.name).length && (
          <>
            <Heading>บุคคลอ้างอิง</Heading>
            {app.reference_contacts.filter((r: any) => r.name).map((r: any, i: number) => (
              <Row key={i} label={`อ้างอิง ${i + 1}`} value={[r.name, r.occupation, r.phone, r.address].filter(Boolean).join(' · ')} />
            ))}
          </>
        )}

        {app.self_introduction && <>
          <Heading>แนะนำตัว</Heading>
          <p className="whitespace-pre-wrap text-gray-900">{app.self_introduction}</p>
        </>}

        {/* Consent + signature */}
        <div className="mt-6 text-[10px] text-gray-700 leading-relaxed">
          <p>ข้าพเจ้าขอรับรองว่า ข้อความดังกล่าวทั้งหมดในใบสมัครนี้เป็นความจริงทุกประการ หลังจากบริษัทจ้างเข้ามาทำงานแล้ว
          ปรากฏว่า ข้อความในใบสมัครงานเอกสารที่นำมาแสดง หรือรายละเอียดที่ให้ไว้ไม่เป็นความจริง บริษัทฯ มีสิทธิ์ที่จะเลิกจ้างข้าพเจ้าได้
          โดยไม่ต้องจ่ายเงินชดเชยหรือค่าเสียหายใดๆ ทั้งสิ้น</p>
        </div>
        <div className="flex justify-end mt-4">
          <div className="text-center">
            {app.signature_data_url
              ? <img src={app.signature_data_url} alt="ลายเซ็น" className="h-14 mx-auto" />
              : <div className="h-14" />}
            <p className="border-t border-gray-400 pt-1 mt-1 text-[10px]">ลายมือชื่อผู้สมัคร (Applicant's signature)</p>
          </div>
        </div>

        {/* Internal hiring consideration */}
        <Heading>การพิจารณาว่าจ้าง (สำหรับเจ้าหน้าที่)</Heading>
        <div className="grid grid-cols-2 gap-x-6">
          <Row label="ตำแหน่ง" value={app.hire_position} />
          <Row label="แผนก" value={app.hire_department} />
          <Row label="เงินเดือน" value={app.hire_salary ? `${Number(app.hire_salary).toLocaleString()} บาท` : null} />
          <Row label="วันที่เริ่มงาน" value={app.hire_start_date} />
          <Row label="ค่าใช้จ่ายพิเศษ" value={app.hire_allowances} />
          <Row label="บังคับบัญชาโดย" value={app.hire_supervised_by} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6 text-center text-[10px]">
          <div>
            <p className="border-t border-gray-400 pt-1">{app.interviewer_name || ' '}</p>
            <p className="text-gray-500">ผู้สัมภาษณ์ {app.interview_date ? `(${app.interview_date})` : ''}</p>
          </div>
          <div>
            <p className="border-t border-gray-400 pt-1">{app.hr_reviewer_name || ' '}</p>
            <p className="text-gray-500">ฝ่ายทรัพยากรบุคคล {app.hr_review_date ? `(${app.hr_review_date})` : ''}</p>
          </div>
          <div>
            <p className="border-t border-gray-400 pt-1">{app.approver_name || ' '}</p>
            <p className="text-gray-500">ผู้อนุมัติ {app.approver_date ? `(${app.approver_date})` : ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
