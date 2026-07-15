'use client'
// src/components/leave/CreateLeaveForm.tsx
import { useState, useEffect } from 'react'
import { useRouter }     from 'next/navigation'
import { useForm }       from 'react-hook-form'
import { zodResolver }   from '@hookform/resolvers/zod'
import { z }             from 'zod'
import Link               from 'next/link'
import { useCreateLeave, useLeaveBalance, useUploadMedicalCert } from '@/hooks/useLeave'
import { LEAVE_TYPE_LABEL, formatDateTH }  from '@/utils'
import type { LeaveType } from '@/types/database'
import { CalendarDays, AlertCircle, Info, Paperclip, X } from 'lucide-react'
import { cn } from '@/utils'

// 2026-07-14: "เขียนที่" as a dropdown instead of free text (item 1.1) —
// สำนักงานสนาม/อื่นๆ need a follow-up detail text, the other two don't.
const PLACE_OPTIONS = [
  { value: 'hq',    label: 'สำนักงานใหญ่', needsDetail: false },
  { value: 'field',  label: 'สำนักงานสนาม', needsDetail: true },
  { value: 'home',  label: 'ที่พัก',        needsDetail: false },
  { value: 'other', label: 'อื่นๆ',        needsDetail: true },
] as const

// 2026-07-16: sub-classification for leave_type='other', used only by the
// Timesheet official-form PDF to pick the right absence letter code
// (T=Training/Seminar, I=Work injury, M=Other authorized e.g. Examination).
// Optional — HR can also set/adjust this later; it never affects approval
// or balance logic.
const OTHER_SUBTYPE_OPTIONS = [
  { value: 'training',   label: 'ฝึกอบรม / สัมมนา (T)' },
  { value: 'injury',     label: 'บาดเจ็บจากการทำงาน (I)' },
  { value: 'authorized', label: 'อื่นๆ ที่ได้รับอนุมัติ เช่น สอบ (M)' },
] as const

const MAX_CERT_BYTES = 2 * 1024 * 1024

// Images over the 2MB cap get compressed client-side (re-encoded as JPEG,
// scaled down + quality reduced until under the cap or attempts run out).
// PDFs can't be compressed this way, so those stay hard-capped at 2MB —
// enforced by the API route as a backstop either way.
async function compressImageIfNeeded(file: File): Promise<File> {
  if (file.size <= MAX_CERT_BYTES || !file.type.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  const maxDim = 1600
  const scale  = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width  = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  let quality = 0.85
  for (let i = 0; i < 6; i++) {
    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) break
    if (blob.size <= MAX_CERT_BYTES || quality <= 0.35) {
      return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
    }
    quality -= 0.15
  }
  return file
}

// ── Validation schema ────────────────────────────────────────
const schema = z.object({
  leave_type:      z.enum(['annual', 'sick', 'personal', 'maternity', 'other']),
  start_date:      z.string().min(1, 'กรุณาเลือกวันที่เริ่มลา'),
  end_date:        z.string().min(1, 'กรุณาเลือกวันที่สิ้นสุดลา'),
  is_half_day:     z.boolean(),
  half_day_period: z.enum(['morning', 'afternoon']).optional(),
  reason:          z.string().optional(),
  // 2026-07-14: paper-form fields ("ใบลา") — all optional.
  place_type:             z.enum(['hq', 'field', 'home', 'other']).optional(),
  place_detail:           z.string().optional(),
  medical_cert_provided:  z.boolean().optional(),
  other_subtype:          z.enum(['training', 'injury', 'authorized']).optional(),
}).refine(d => new Date(d.end_date) >= new Date(d.start_date), {
  message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น',
  path: ['end_date'],
}).refine(d => !d.is_half_day || d.start_date === d.end_date, {
  message: 'การลาครึ่งวันต้องเป็นวันเดียวกัน',
  path: ['end_date'],
}).refine(d => !d.is_half_day || !!d.half_day_period, {
  message: 'กรุณาเลือกช่วงเวลา (เช้า/บ่าย)',
  path: ['half_day_period'],
}).refine(d => {
  const opt = PLACE_OPTIONS.find(o => o.value === d.place_type)
  return !opt?.needsDetail || !!d.place_detail?.trim()
}, { message: 'กรุณาระบุรายละเอียดสถานที่', path: ['place_detail'] })

type FormValues = z.infer<typeof schema>

const LEAVE_TYPES: { value: LeaveType; label: string; color: string }[] = [
  { value: 'annual',    label: 'พักร้อน',  color: 'border-blue-300 bg-blue-50 text-blue-800'  },
  { value: 'sick',      label: 'ลาป่วย',   color: 'border-red-300 bg-red-50 text-red-800'     },
  { value: 'personal',  label: 'ลากิจ',    color: 'border-amber-300 bg-amber-50 text-amber-800' },
  { value: 'maternity', label: 'ลาคลอด',  color: 'border-pink-300 bg-pink-50 text-pink-800'  },
  { value: 'other',     label: 'อื่นๆ',    color: 'border-gray-300 bg-gray-50 text-gray-800'  },
]

export function CreateLeaveForm() {
  const router   = useRouter()
  const create   = useCreateLeave()
  const uploadCert = useUploadMedicalCert()
  const today    = new Date().toISOString().split('T')[0]

  const [certFile, setCertFile]   = useState<File | null>(null)
  const [certError, setCertError] = useState<string | null>(null)
  const [uploadingCert, setUploadingCert] = useState(false)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leave_type:  'annual',
      start_date:  today,
      end_date:    today,
      is_half_day: false,
      place_type:  'hq',
    },
  })

  const leaveType   = watch('leave_type')
  const startDate   = watch('start_date')
  const endDate     = watch('end_date')
  const isHalfDay   = watch('is_half_day')
  const placeType   = watch('place_type')
  const medCertProvided = watch('medical_cert_provided')
  const year        = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear()
  const placeNeedsDetail = PLACE_OPTIONS.find(o => o.value === placeType)?.needsDetail ?? false

  const { data: balanceData } = useLeaveBalance(year)
  const balances: any[] = balanceData?.balances ?? []
  const currentBalance   = balances.find(b => b.leave_type === leaveType)

  // When half-day toggled on, sync end to start
  useEffect(() => {
    if (isHalfDay) setValue('end_date', startDate)
  }, [isHalfDay, startDate, setValue])

  const onCertFileChange = async (file: File | null) => {
    setCertError(null)
    if (!file) { setCertFile(null); return }
    if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) {
      setCertError('ไฟล์ต้องเป็น JPG, PNG หรือ PDF เท่านั้น')
      return
    }
    const processed = await compressImageIfNeeded(file)
    if (processed.size > MAX_CERT_BYTES) {
      setCertError('ไฟล์ใหญ่เกิน 2MB (PDF ไม่สามารถบีบอัดอัตโนมัติได้ กรุณาลดขนาดไฟล์)')
      return
    }
    setCertFile(processed)
  }

  const onSubmit = async (values: FormValues) => {
    const opt = PLACE_OPTIONS.find(o => o.value === values.place_type)
    const place_written = opt
      ? (opt.needsDetail ? `${opt.label}: ${values.place_detail?.trim()}` : opt.label)
      : undefined

    const leave = await create.mutateAsync({
      leave_type:             values.leave_type,
      start_date:              values.start_date,
      end_date:                values.end_date,
      is_half_day:             values.is_half_day,
      half_day_period:         values.half_day_period,
      reason:                  values.reason,
      place_written,
      medical_cert_provided:   values.medical_cert_provided,
      other_subtype:           values.other_subtype,
    })

    if (certFile && leave?.id) {
      setUploadingCert(true)
      await uploadCert.mutateAsync({ id: leave.id, file: certFile }).catch(() => {})
      setUploadingCert(false)
    }
    router.push('/leave/my')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

      {/* Leave type selector */}
      <div>
        <label className="form-label">ประเภทการลา <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-1">
          {LEAVE_TYPES.map(lt => (
            <label
              key={lt.value}
              className={cn(
                'flex items-center justify-center px-3 py-2.5 rounded-lg border-2 cursor-pointer text-sm font-medium transition-all',
                leaveType === lt.value
                  ? lt.color + ' ring-2 ring-offset-1 ring-blue-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              )}
            >
              <input type="radio" {...register('leave_type')} value={lt.value} className="sr-only" />
              {lt.label}
            </label>
          ))}
        </div>
        {errors.leave_type && <p className="mt-1 text-xs text-red-600">{errors.leave_type.message}</p>}
      </div>

      {/* Balance info */}
      {currentBalance && !['maternity','other'].includes(leaveType) && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">
            วันลาคงเหลือ{LEAVE_TYPE_LABEL[leaveType as LeaveType]}:&nbsp;
            <span className="font-semibold">{currentBalance.available_days} วัน</span>
            {currentBalance.pending_days > 0 && (
              <span className="ml-2 text-blue-600">(รออนุมัติ {currentBalance.pending_days} วัน)</span>
            )}
          </p>
        </div>
      )}

      {/* Date range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="start_date" className="form-label">
            วันที่เริ่มลา <span className="text-red-500">*</span>
          </label>
          <input
            id="start_date"
            type="date"
            {...register('start_date')}
            min={today}
            className="form-input"
          />
          {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date.message}</p>}
        </div>

        <div>
          <label htmlFor="end_date" className="form-label">
            วันที่สิ้นสุดลา <span className="text-red-500">*</span>
          </label>
          <input
            id="end_date"
            type="date"
            {...register('end_date')}
            min={startDate || today}
            disabled={isHalfDay}
            className={cn('form-input', isHalfDay && 'opacity-50')}
          />
          {errors.end_date && <p className="mt-1 text-xs text-red-600">{errors.end_date.message}</p>}
        </div>
      </div>

      {/* Half-day option */}
      <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <input
          id="is_half_day"
          type="checkbox"
          {...register('is_half_day')}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div className="flex-1">
          <label htmlFor="is_half_day" className="text-sm font-medium text-gray-700 cursor-pointer">
            ลาครึ่งวัน
          </label>
          {isHalfDay && (
            <div className="mt-2 flex gap-3">
              {(['morning', 'afternoon'] as const).map(period => (
                <label key={period} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    {...register('half_day_period')}
                    value={period}
                    className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    {period === 'morning' ? 'ช่วงเช้า' : 'ช่วงบ่าย'}
                  </span>
                </label>
              ))}
            </div>
          )}
          {errors.half_day_period && (
            <p className="mt-1 text-xs text-red-600">{errors.half_day_period.message}</p>
          )}
        </div>
      </div>

      {/* Reason */}
      <div>
        <label htmlFor="reason" className="form-label">
          เหตุผลการลา
          {leaveType === 'sick' && <span className="ml-1 text-xs text-gray-400">(กรณีลาเกิน 3 วัน ต้องมีใบรับรองแพทย์)</span>}
        </label>
        <textarea
          id="reason"
          {...register('reason')}
          rows={3}
          className="form-input resize-none"
          placeholder="ระบุเหตุผลการลา (ถ้ามี)"
        />
      </div>

      {/* Medical certificate — sick leave only. 2026-07-14, per official
          "ใบลา" paper form's "ใบรับรองแพทย์ มี/ไม่มี" checkbox. If checked,
          the actual file gets attached below and appended as an extra page
          on the "พิมพ์แบบฟอร์มทางการ" PDF. */}
      {leaveType === 'sick' && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">
          <div className="flex items-center gap-3">
            <input
              id="medical_cert_provided"
              type="checkbox"
              {...register('medical_cert_provided')}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="medical_cert_provided" className="text-sm font-medium text-gray-700 cursor-pointer">
              มีใบรับรองแพทย์แนบมาด้วย
            </label>
          </div>
          {medCertProvided && (
            <div className="pl-7">
              {certFile ? (
                <div className="flex items-center gap-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="truncate flex-1">{certFile.name}</span>
                  <span className="text-xs text-gray-400 shrink-0">{(certFile.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => onCertFileChange(null)} className="text-gray-400 hover:text-red-600 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm text-gray-500 cursor-pointer hover:border-blue-300 hover:text-blue-600">
                  <Paperclip className="w-4 h-4" />
                  แนบไฟล์ใบรับรองแพทย์ (JPG, PNG หรือ PDF ไม่เกิน 2MB)
                  <input
                    type="file" accept="image/jpeg,image/png,application/pdf"
                    className="hidden"
                    onChange={e => onCertFileChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
              {certError && <p className="mt-1 text-xs text-red-600">{certError}</p>}
            </div>
          )}
        </div>
      )}

      {/* ประเภทย่อยของ "อื่นๆ" — 2026-07-16, ใช้เลือกรหัส T/I/M บนแบบฟอร์ม
          Timesheet ทางการเท่านั้น ไม่กระทบการอนุมัติ/ยอดวันลา */}
      {leaveType === 'other' && (
        <div>
          <label htmlFor="other_subtype" className="form-label">ประเภทย่อย (สำหรับแบบฟอร์ม Timesheet)</label>
          <select id="other_subtype" {...register('other_subtype')} className="form-input">
            <option value="">— ไม่ระบุ (HR สามารถระบุภายหลังได้) —</option>
            {OTHER_SUBTYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* เขียนที่ — 2026-07-14, paper-form field (item 1.1: dropdown instead
          of free text). "ติดต่อได้ที่"/"เบอร์โทร" no longer entered here —
          pulled automatically from Profile at print time (see note below). */}
      <div>
        <label htmlFor="place_type" className="form-label">เขียนที่</label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select id="place_type" {...register('place_type')} className="form-input">
            {PLACE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {placeNeedsDetail && (
            <input
              type="text"
              {...register('place_detail')}
              className="form-input"
              placeholder={placeType === 'field' ? 'ระบุสถานที่ เช่น หน้างานราชบุรี' : 'ระบุสถานที่'}
            />
          )}
        </div>
        {errors.place_detail && <p className="mt-1 text-xs text-red-600">{errors.place_detail.message}</p>}
        <p className="mt-1.5 text-xs text-gray-400">
          "ติดต่อได้ที่" และ "เบอร์โทร" ในใบลาจะดึงจากหน้า{' '}
          <Link href="/profile" className="text-blue-600 hover:underline">โปรไฟล์ของฉัน</Link> โดยอัตโนมัติ
        </p>
      </div>

      {/* Error */}
      {create.isError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{(create.error as Error)?.message}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={create.isPending || uploadingCert}
          className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
        >
          {create.isPending ? 'กำลังส่ง...' : uploadingCert ? 'กำลังแนบไฟล์...' : 'ยื่นใบลา'}
        </button>
      </div>
    </form>
  )
}
