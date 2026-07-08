'use client'
// src/app/apply/[company]/page.tsx
// Public, unauthenticated online job application form — mirrors all 4 pages
// of the paper "ใบสมัครงาน" used by Safecon & Highcon. No login required;
// submissions go to POST /api/public/job-applications.

import { useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { CheckCircle2, Loader2, Upload, X, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import {
  emptyJobApplicationPayload,
  type JobApplicationPayload, type LangLevel,
} from '@/types/job-application'

const COMPANY_META: Record<string, { code: string; name: string; logo: string }> = {
  safecon: { code: 'SAFECON', name: 'Safecon',  logo: '/logos/safecon.png' },
  highcon: { code: 'HIGHCON', name: 'Highcon',  logo: '/logos/highcon.png' },
}

const STEP_LABELS = ['ข้อมูลส่วนตัว', 'ครอบครัว/การศึกษา/ประสบการณ์', 'ภาษาและความสามารถ', 'ข้อมูลเพิ่มเติม/ยืนยัน']

// ── Small field helpers ──────────────────────────────────────────
function Field({ label, required, children, className = '' }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="form-label">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  )
}
const inputCls = 'form-input'

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputCls} />
}

function Pills<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button type="button" key={o.value} onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${value === o.value ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

const LANG_LEVEL_OPTS: { value: LangLevel; label: string }[] = [{ value: 'good', label: 'ดี' }, { value: 'fair', label: 'ปานกลาง' }, { value: 'poor', label: 'พอใช้' }]

export default function ApplyPage() {
  const params = useParams()
  const companySlug = params.company as string
  const meta = COMPANY_META[companySlug?.toLowerCase()]

  const [step, setStep]       = useState(0)
  const [form, setForm]       = useState<JobApplicationPayload>(emptyJobApplicationPayload())
  const [photo, setPhoto]     = useState<File | null>(null)
  const [idCard, setIdCard]   = useState<File | null>(null)
  const [houseReg, setHouseReg] = useState<File | null>(null)
  const [eduDoc, setEduDoc]   = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState('')
  const [done, setDone]       = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const hasSig    = useRef(false)

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800">ไม่พบลิงก์ใบสมัครงานนี้</p>
          <p className="text-sm text-gray-500 mt-1">กรุณาตรวจสอบลิงก์อีกครั้ง</p>
        </div>
      </div>
    )
  }

  const set = <K extends keyof JobApplicationPayload>(key: K, value: JobApplicationPayload[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  // ── Signature pad ────────────────────────────────────────────
  type CanvasPointerEvent = React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  const getPos = (e: CanvasPointerEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const p = 'touches' in e.nativeEvent ? e.nativeEvent.touches[0] : (e.nativeEvent as MouseEvent)
    return { x: p.clientX - rect.left, y: p.clientY - rect.top }
  }
  const startDraw = (e: CanvasPointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return
    drawing.current = true
    const ctx = canvas.getContext('2d')!
    const { x, y } = getPos(e, canvas)
    ctx.beginPath(); ctx.moveTo(x, y)
  }
  const moveDraw = (e: CanvasPointerEvent) => {
    if (!drawing.current) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { x, y } = getPos(e, canvas)
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827'
    ctx.lineTo(x, y); ctx.stroke()
    hasSig.current = true
  }
  const endDraw = () => { drawing.current = false }
  const clearSig = () => {
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    hasSig.current = false
  }

  // ── Dynamic row helpers ──────────────────────────────────────
  const addRow = <K extends 'work_experience' | 'siblings' | 'reference_contacts'>(key: K, empty: any) =>
    setForm(f => ({ ...f, [key]: [...(f[key] as any[]), empty] }))
  const removeRow = (key: 'work_experience' | 'siblings' | 'reference_contacts', i: number) =>
    setForm(f => ({ ...f, [key]: (f[key] as any[]).filter((_, idx) => idx !== i) }))
  const updateRow = (key: 'work_experience' | 'siblings' | 'reference_contacts' | 'education', i: number, patch: any) =>
    setForm(f => ({ ...f, [key]: (f[key] as any[]).map((r, idx) => idx === i ? { ...r, ...patch } : r) }))

  const validateStep = (): string => {
    if (step === 0) {
      if (!form.position_applied_1.trim()) return 'กรุณากรอกตำแหน่งที่ต้องการ'
      if (!form.full_name_th.trim())       return 'กรุณากรอกชื่อ-นามสกุล'
      if (!form.mobile.trim())              return 'กรุณากรอกเบอร์มือถือ'
      if (!form.email.trim())                return 'กรุณากรอกอีเมล'
      if (!form.birth_date)                   return 'กรุณากรอกวันเกิด'
      if (!form.id_card_no.trim())             return 'กรุณากรอกเลขบัตรประชาชน'
      if (!form.gender)                         return 'กรุณาเลือกเพศ'
      if (!photo)                                return 'กรุณาแนบรูปถ่าย'
    }
    return ''
  }

  const next = () => {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => Math.min(s + 1, 3))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const back = () => { setError(''); setStep(s => Math.max(s - 1, 0)); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const handleSubmit = async () => {
    if (!form.consent_confirmed) { setError('กรุณายืนยันความถูกต้องของข้อมูลก่อนส่งใบสมัคร'); return }
    setSubmitting(true); setError('')

    const signature_data_url = hasSig.current && canvasRef.current ? canvasRef.current.toDataURL('image/png') : ''
    const payload: JobApplicationPayload = { ...form, signature_data_url }

    const fd = new FormData()
    fd.set('company_code', meta.code)
    fd.set('data', JSON.stringify(payload))
    if (photo)    fd.set('photo', photo)
    if (idCard)   fd.set('id_card_copy', idCard)
    if (houseReg) fd.set('house_reg_copy', houseReg)
    if (eduDoc)   fd.set('education_or_license', eduDoc)

    try {
      const res  = await fetch('/api/public/job-applications', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setError(e.message ?? 'ส่งใบสมัครไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center card p-8">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">ส่งใบสมัครงานสำเร็จ</h1>
          <p className="text-sm text-gray-500 mt-2">
            ขอบคุณที่สนใจร่วมงานกับ {meta.name} ทีมงานจะติดต่อกลับหากคุณสมบัติตรงกับตำแหน่งที่เปิดรับ
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Image src={meta.logo} alt={meta.name} width={70} height={36} className="object-contain" />
          <div>
            <p className="text-sm font-semibold text-gray-900">ใบสมัครงาน — {meta.name}</p>
            <p className="text-xs text-gray-400">Application for Employment</p>
          </div>
        </div>
        {/* Step indicator */}
        <div className="max-w-3xl mx-auto px-4 pb-3 flex items-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-blue-700' : 'bg-gray-200'}`} />
              <p className={`text-[10px] mt-1 truncate ${i === step ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-5">
        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* ── Step 0: Position + Personal info ─────────────────── */}
        {step === 0 && (
          <>
            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ตำแหน่งที่ต้องการ</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="ตำแหน่งที่ต้องการ (อันดับ 1)" required>
                  <TextInput value={form.position_applied_1} onChange={e => set('position_applied_1', e.target.value)} />
                </Field>
                <Field label="ตำแหน่งที่ต้องการ (อันดับ 2)">
                  <TextInput value={form.position_applied_2} onChange={e => set('position_applied_2', e.target.value)} />
                </Field>
                <Field label="เงินเดือนที่ต้องการ (บาท/เดือน)">
                  <TextInput type="number" value={form.salary_expected} onChange={e => set('salary_expected', e.target.value)} />
                </Field>
              </div>
            </div>

            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">รูปถ่าย <span className="text-red-500">*</span></h3>
              <FileDrop file={photo} onFile={setPhoto} accept="image/*" label="แนบรูปถ่ายหน้าตรง (ขนาดไม่เกิน 5MB)" />
            </div>

            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ประวัติส่วนตัว</h3>
              <Field label="ชื่อ-นามสกุล" required><TextInput value={form.full_name_th} onChange={e => set('full_name_th', e.target.value)} /></Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="เลขที่บ้าน"><TextInput value={form.address_no} onChange={e => set('address_no', e.target.value)} /></Field>
                <Field label="หมู่ที่"><TextInput value={form.address_moo} onChange={e => set('address_moo', e.target.value)} /></Field>
                <Field label="ถนน"><TextInput value={form.address_road} onChange={e => set('address_road', e.target.value)} /></Field>
                <Field label="ตำบล/แขวง"><TextInput value={form.address_sub_district} onChange={e => set('address_sub_district', e.target.value)} /></Field>
                <Field label="อำเภอ/เขต"><TextInput value={form.address_district} onChange={e => set('address_district', e.target.value)} /></Field>
                <Field label="จังหวัด"><TextInput value={form.address_province} onChange={e => set('address_province', e.target.value)} /></Field>
                <Field label="รหัสไปรษณีย์"><TextInput value={form.address_postal_code} onChange={e => set('address_postal_code', e.target.value)} /></Field>
                <Field label="โทรศัพท์"><TextInput value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
                <Field label="มือถือ" required><TextInput value={form.mobile} onChange={e => set('mobile', e.target.value)} /></Field>
                <Field label="อีเมล" required className="sm:col-span-2"><TextInput type="email" value={form.email} onChange={e => set('email', e.target.value)} /></Field>
              </div>
              <Field label="อาศัยอยู่กับ">
                <Pills value={form.living_with} onChange={v => set('living_with', v)} options={[
                  { value: 'parent', label: 'อาศัยกับครอบครัว' }, { value: 'own_home', label: 'บ้านตัวเอง' },
                  { value: 'hired_house', label: 'บ้านเช่า' }, { value: 'hired_flat', label: 'หอพัก' },
                ]} />
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="วันเดือนปีเกิด" required><TextInput type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} /></Field>
                <Field label="เชื้อชาติ"><TextInput value={form.race} onChange={e => set('race', e.target.value)} /></Field>
                <Field label="สัญชาติ"><TextInput value={form.nationality} onChange={e => set('nationality', e.target.value)} /></Field>
                <Field label="ศาสนา"><TextInput value={form.religion} onChange={e => set('religion', e.target.value)} /></Field>
                <Field label="เลขบัตรประชาชน" required><TextInput value={form.id_card_no} onChange={e => set('id_card_no', e.target.value)} /></Field>
                <Field label="บัตรหมดอายุ"><TextInput type="date" value={form.id_card_expiry} onChange={e => set('id_card_expiry', e.target.value)} /></Field>
                <Field label="ส่วนสูง (ซม.)"><TextInput type="number" value={form.height_cm} onChange={e => set('height_cm', e.target.value)} /></Field>
                <Field label="น้ำหนัก (กก.)"><TextInput type="number" value={form.weight_kg} onChange={e => set('weight_kg', e.target.value)} /></Field>
              </div>
              <Field label="ภาวะทางทหาร">
                <Pills value={form.military_status} onChange={v => set('military_status', v)} options={[
                  { value: 'exempted', label: 'ได้รับการยกเว้น' }, { value: 'served', label: 'ปลดเป็นทหารกองหนุน' }, { value: 'not_yet_served', label: 'ยังไม่ได้รับการเกณฑ์' },
                ]} />
              </Field>
              <Field label="สถานภาพ">
                <Pills value={form.marital_status} onChange={v => set('marital_status', v)} options={[
                  { value: 'single', label: 'โสด' }, { value: 'married', label: 'แต่งงาน' }, { value: 'widowed', label: 'หม้าย' }, { value: 'separated', label: 'แยกกัน' },
                ]} />
              </Field>
              <Field label="เพศ" required>
                <Pills value={form.gender} onChange={v => set('gender', v)} options={[{ value: 'male', label: 'ชาย' }, { value: 'female', label: 'หญิง' }]} />
              </Field>
            </div>

            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">เอกสารแนบเพิ่มเติม (ถ้ามี)</h3>
              <FileDrop file={idCard}   onFile={setIdCard}   accept="image/*,application/pdf" label="สำเนาบัตรประชาชน" />
              <FileDrop file={houseReg} onFile={setHouseReg} accept="image/*,application/pdf" label="สำเนาทะเบียนบ้าน" />
              <FileDrop file={eduDoc}   onFile={setEduDoc}   accept="image/*,application/pdf" label="วุฒิการศึกษา / ใบขับขี่" />
            </div>
          </>
        )}

        {/* ── Step 1: Family / Education / Work experience ────── */}
        {step === 1 && (
          <>
            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ประวัติครอบครัว</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="ชื่อ-สกุลบิดา"><TextInput value={form.father_name} onChange={e => set('father_name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="อายุ"><TextInput type="number" value={form.father_age} onChange={e => set('father_age', e.target.value)} /></Field>
                  <Field label="อาชีพ"><TextInput value={form.father_occupation} onChange={e => set('father_occupation', e.target.value)} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
                  <input type="checkbox" checked={form.father_alive} onChange={e => set('father_alive', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  บิดายังมีชีวิตอยู่
                </label>

                <Field label="ชื่อ-สกุลมารดา"><TextInput value={form.mother_name} onChange={e => set('mother_name', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="อายุ"><TextInput type="number" value={form.mother_age} onChange={e => set('mother_age', e.target.value)} /></Field>
                  <Field label="อาชีพ"><TextInput value={form.mother_occupation} onChange={e => set('mother_occupation', e.target.value)} /></Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 sm:col-span-2">
                  <input type="checkbox" checked={form.mother_alive} onChange={e => set('mother_alive', e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                  มารดายังมีชีวิตอยู่
                </label>

                <Field label="ชื่อคู่สมรส"><TextInput value={form.spouse_name} onChange={e => set('spouse_name', e.target.value)} /></Field>
                <Field label="สถานที่ทำงาน/ตำแหน่งคู่สมรส">
                  <div className="flex gap-2">
                    <TextInput placeholder="สถานที่ทำงาน" value={form.spouse_workplace} onChange={e => set('spouse_workplace', e.target.value)} />
                    <TextInput placeholder="ตำแหน่ง" value={form.spouse_position} onChange={e => set('spouse_position', e.target.value)} />
                  </div>
                </Field>

                <Field label="จำนวนบุตร"><TextInput type="number" value={form.children_count} onChange={e => set('children_count', e.target.value)} /></Field>
                <Field label="เป็นบุตรคนที่"><TextInput type="number" value={form.birth_order} onChange={e => set('birth_order', e.target.value)} /></Field>
                <Field label="จำนวนพี่น้องทั้งหมด"><TextInput type="number" value={form.siblings_total} onChange={e => set('siblings_total', e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="ชาย"><TextInput type="number" value={form.siblings_male} onChange={e => set('siblings_male', e.target.value)} /></Field>
                  <Field label="หญิง"><TextInput type="number" value={form.siblings_female} onChange={e => set('siblings_female', e.target.value)} /></Field>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-600">รายชื่อพี่น้อง (ถ้ามี)</p>
                  <button type="button" onClick={() => addRow('siblings', { name: '', age: '', occupation: '' })} className="text-xs text-blue-600 hover:underline">+ เพิ่มรายการ</button>
                </div>
                {form.siblings.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 mb-2">
                    <TextInput placeholder="ชื่อ" value={s.name} onChange={e => updateRow('siblings', i, { name: e.target.value })} />
                    <TextInput placeholder="อายุ" value={s.age} onChange={e => updateRow('siblings', i, { age: e.target.value })} />
                    <TextInput placeholder="อาชีพ" value={s.occupation} onChange={e => updateRow('siblings', i, { occupation: e.target.value })} />
                    <button type="button" onClick={() => removeRow('siblings', i)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-body space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">การศึกษา</h3>
              {form.education.map((e, i) => (
                <div key={e.level} className="grid sm:grid-cols-[1fr_1fr_1fr_90px_90px] gap-2 items-end">
                  <p className="text-xs text-gray-500 sm:col-span-1 self-center">{e.level}</p>
                  <TextInput placeholder="สถาบัน" value={e.institution} onChange={ev => updateRow('education', i, { institution: ev.target.value })} />
                  <TextInput placeholder="สาขาวิชา" value={e.major} onChange={ev => updateRow('education', i, { major: ev.target.value })} />
                  <TextInput placeholder="ตั้งแต่ปี" value={e.from} onChange={ev => updateRow('education', i, { from: ev.target.value })} />
                  <TextInput placeholder="ถึงปี" value={e.to} onChange={ev => updateRow('education', i, { to: ev.target.value })} />
                </div>
              ))}
            </div>

            <div className="card card-body space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">ประสบการณ์ทำงาน</h3>
                <button type="button" onClick={() => addRow('work_experience', { company: '', from: '', to: '', position: '', job_description: '', salary: '', reason: '' })}
                  className="text-xs text-blue-600 hover:underline">+ เพิ่มประสบการณ์</button>
              </div>
              {form.work_experience.map((w, i) => (
                <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 relative">
                  {form.work_experience.length > 1 && (
                    <button type="button" onClick={() => removeRow('work_experience', i)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  )}
                  <div className="grid sm:grid-cols-2 gap-2">
                    <TextInput placeholder="ชื่อบริษัท" value={w.company} onChange={e => updateRow('work_experience', i, { company: e.target.value })} />
                    <TextInput placeholder="ตำแหน่ง" value={w.position} onChange={e => updateRow('work_experience', i, { position: e.target.value })} />
                    <TextInput placeholder="เริ่ม (เดือน/ปี)" value={w.from} onChange={e => updateRow('work_experience', i, { from: e.target.value })} />
                    <TextInput placeholder="ถึง (เดือน/ปี)" value={w.to} onChange={e => updateRow('work_experience', i, { to: e.target.value })} />
                    <TextInput placeholder="ค่าจ้าง" value={w.salary} onChange={e => updateRow('work_experience', i, { salary: e.target.value })} />
                    <TextInput placeholder="เหตุที่ออก" value={w.reason} onChange={e => updateRow('work_experience', i, { reason: e.target.value })} />
                  </div>
                  <TextInput placeholder="ลักษณะงาน" value={w.job_description} onChange={e => updateRow('work_experience', i, { job_description: e.target.value })} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Step 2: Language + special ability + emergency ──── */}
        {step === 2 && (
          <>
            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ความสามารถทางภาษา</h3>
              {(['thai', 'english', 'japanese'] as const).map(lang => (
                <div key={lang} className="grid grid-cols-[70px_1fr] sm:grid-cols-[100px_1fr_1fr_1fr] gap-2 items-center">
                  <p className="text-sm text-gray-600">{{ thai: 'ไทย', english: 'อังกฤษ', japanese: 'ญี่ปุ่น' }[lang]}</p>
                  <div className="col-span-3 sm:contents">
                    <Pills value={form.language_ability[lang].speak} onChange={v => set('language_ability', { ...form.language_ability, [lang]: { ...form.language_ability[lang], speak: v } })} options={LANG_LEVEL_OPTS} />
                    <Pills value={form.language_ability[lang].write} onChange={v => set('language_ability', { ...form.language_ability, [lang]: { ...form.language_ability[lang], write: v } })} options={LANG_LEVEL_OPTS} />
                    <Pills value={form.language_ability[lang].read}  onChange={v => set('language_ability', { ...form.language_ability, [lang]: { ...form.language_ability[lang], read: v } })} options={LANG_LEVEL_OPTS} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-[70px_1fr] gap-2">
                <TextInput placeholder="ภาษาอื่นๆ" value={form.language_ability.other.name}
                  onChange={e => set('language_ability', { ...form.language_ability, other: { ...form.language_ability.other, name: e.target.value } })} />
              </div>
            </div>

            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ความสามารถพิเศษ</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="พิมพ์ดีดไทย (คำ/นาที)"><TextInput type="number" value={form.typing_thai_wpm} onChange={e => set('typing_thai_wpm', e.target.value)} /></Field>
                <Field label="พิมพ์ดีดอังกฤษ (คำ/นาที)"><TextInput type="number" value={form.typing_english_wpm} onChange={e => set('typing_english_wpm', e.target.value)} /></Field>
                <Field label="โปรแกรมคอมพิวเตอร์ที่ใช้ได้" className="sm:col-span-2"><TextInput value={form.computer_skill} onChange={e => set('computer_skill', e.target.value)} /></Field>
                <Field label="เลขที่ใบขับขี่"><TextInput value={form.driving_license_no} onChange={e => set('driving_license_no', e.target.value)} /></Field>
                <Field label="เครื่องใช้สำนักงาน"><TextInput value={form.office_machine_skill} onChange={e => set('office_machine_skill', e.target.value)} /></Field>
                <Field label="งานอดิเรก"><TextInput value={form.hobbies} onChange={e => set('hobbies', e.target.value)} /></Field>
                <Field label="กีฬาที่ชอบ"><TextInput value={form.favourite_sport} onChange={e => set('favourite_sport', e.target.value)} /></Field>
                <Field label="ความรู้พิเศษ"><TextInput value={form.special_knowledge} onChange={e => set('special_knowledge', e.target.value)} /></Field>
                <Field label="อื่นๆ"><TextInput value={form.other_ability} onChange={e => set('other_ability', e.target.value)} /></Field>
              </div>
              <Field label="สามารถไปปฏิบัติงานต่างจังหวัดได้หรือไม่">
                <Pills value={form.can_work_upcountry} onChange={v => set('can_work_upcountry', v)} options={[{ value: 'yes', label: 'ได้' }, { value: 'no', label: 'ไม่ได้' }]} />
              </Field>
            </div>

            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">บุคคลที่ติดต่อได้กรณีฉุกเฉิน</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="ชื่อ-นามสกุล"><TextInput value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} /></Field>
                <Field label="เกี่ยวข้องเป็น"><TextInput value={form.emergency_contact_relation} onChange={e => set('emergency_contact_relation', e.target.value)} /></Field>
                <Field label="โทรศัพท์"><TextInput value={form.emergency_contact_phone} onChange={e => set('emergency_contact_phone', e.target.value)} /></Field>
                <Field label="ที่อยู่"><TextInput value={form.emergency_contact_address} onChange={e => set('emergency_contact_address', e.target.value)} /></Field>
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Background / references / consent / submit ─ */}
        {step === 3 && (
          <>
            <div className="card card-body space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">ข้อมูลเพิ่มเติม</h3>
              <Field label="ทราบข่าวการรับสมัครจาก"><TextInput value={form.source_of_info} onChange={e => set('source_of_info', e.target.value)} /></Field>
              <Field label="เคยป่วยหนักหรือเป็นโรคติดต่อร้ายแรงมาก่อนหรือไม่">
                <Pills value={form.had_serious_illness} onChange={v => set('had_serious_illness', v)} options={[{ value: 'no', label: 'ไม่เคย' }, { value: 'yes', label: 'เคย' }]} />
              </Field>
              {form.had_serious_illness === 'yes' && <TextInput placeholder="ระบุชื่อโรค" value={form.serious_illness_detail} onChange={e => set('serious_illness_detail', e.target.value)} />}
              <Field label="เคยสมัครงานกับบริษัทนี้มาก่อนหรือไม่">
                <Pills value={form.applied_before} onChange={v => set('applied_before', v)} options={[{ value: 'no', label: 'ไม่เคย' }, { value: 'yes', label: 'เคย' }]} />
              </Field>
              {form.applied_before === 'yes' && <TextInput placeholder="เมื่อไร" value={form.applied_before_when} onChange={e => set('applied_before_when', e.target.value)} />}
              <Field label="ชื่อญาติ/เพื่อนที่ทำงานอยู่ในบริษัทนี้ (ถ้ามี)">
                <TextInput value={form.known_relatives_friends} onChange={e => set('known_relatives_friends', e.target.value)} />
              </Field>
            </div>

            <div className="card card-body space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">บุคคลอ้างอิง 2 ท่าน (ไม่ใช่ญาติ)</h3>
              {form.reference_contacts.map((r, i) => (
                <div key={i} className="grid sm:grid-cols-2 gap-2 border border-gray-200 rounded-lg p-3">
                  <TextInput placeholder="ชื่อ-นามสกุล" value={r.name} onChange={e => updateRow('reference_contacts', i, { name: e.target.value })} />
                  <TextInput placeholder="อาชีพ" value={r.occupation} onChange={e => updateRow('reference_contacts', i, { occupation: e.target.value })} />
                  <TextInput placeholder="โทรศัพท์" value={r.phone} onChange={e => updateRow('reference_contacts', i, { phone: e.target.value })} />
                  <TextInput placeholder="ที่อยู่" value={r.address} onChange={e => updateRow('reference_contacts', i, { address: e.target.value })} />
                </div>
              ))}
            </div>

            <div className="card card-body space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">แนะนำตัวท่านเอง</h3>
              <textarea rows={4} className="form-input resize-none" value={form.self_introduction} onChange={e => set('self_introduction', e.target.value)} />
            </div>

            <div className="card card-body space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">ลายมือชื่อผู้สมัคร</h3>
              <p className="text-xs text-gray-400">เซ็นในกรอบด้านล่างด้วยเมาส์หรือนิ้ว (ไม่บังคับ)</p>
              <canvas
                ref={canvasRef} width={600} height={150}
                className="w-full h-[150px] border border-gray-300 rounded-lg bg-white touch-none"
                onMouseDown={startDraw} onMouseMove={moveDraw} onMouseUp={endDraw} onMouseLeave={endDraw}
                onTouchStart={startDraw} onTouchMove={moveDraw} onTouchEnd={endDraw}
              />
              <button type="button" onClick={clearSig} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                <RotateCcw className="w-3.5 h-3.5" />ล้างลายเซ็น
              </button>
            </div>

            <div className="card card-body space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={form.consent_confirmed} onChange={e => set('consent_confirmed', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 mt-0.5" />
                <span className="text-sm text-gray-700">
                  ข้าพเจ้าขอรับรองว่าข้อความดังกล่าวทั้งหมดในใบสมัครนี้เป็นความจริงทุกประการ และยินยอมให้บริษัทเก็บรวบรวมและใช้ข้อมูลส่วนบุคคลนี้เพื่อการพิจารณาสมัครงาน
                </span>
              </label>
            </div>
          </>
        )}

        {/* Navigation */}
        <div className="flex gap-3 pb-8">
          {step > 0 && (
            <button type="button" onClick={back}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <ChevronLeft className="w-4 h-4" />ย้อนกลับ
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={next}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-blue-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-800">
              ถัดไป<ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting || !form.consent_confirmed}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-700 text-white px-4 py-2.5 text-sm font-medium hover:bg-green-800 disabled:opacity-60">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              ส่งใบสมัครงาน
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function FileDrop({ file, onFile, accept, label }: { file: File | null; onFile: (f: File | null) => void; accept: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      {file ? (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
          <span className="text-sm text-gray-700 truncate">{file.name}</span>
          <button type="button" onClick={() => onFile(null)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 hover:border-blue-400 hover:bg-blue-50">
          <Upload className="w-4 h-4" />แนบไฟล์
        </button>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}
