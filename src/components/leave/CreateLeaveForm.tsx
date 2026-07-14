'use client'
// src/components/leave/CreateLeaveForm.tsx
import { useState, useEffect } from 'react'
import { useRouter }     from 'next/navigation'
import { useForm }       from 'react-hook-form'
import { zodResolver }   from '@hookform/resolvers/zod'
import { z }             from 'zod'
import { useCreateLeave, useLeaveBalance } from '@/hooks/useLeave'
import { LEAVE_TYPE_LABEL, formatDateTH }  from '@/utils'
import type { LeaveType } from '@/types/database'
import { CalendarDays, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/utils'

// ── Validation schema ────────────────────────────────────────
const schema = z.object({
  leave_type:      z.enum(['annual', 'sick', 'personal', 'maternity', 'other']),
  start_date:      z.string().min(1, 'กรุณาเลือกวันที่เริ่มลา'),
  end_date:        z.string().min(1, 'กรุณาเลือกวันที่สิ้นสุดลา'),
  is_half_day:     z.boolean(),
  half_day_period: z.enum(['morning', 'afternoon']).optional(),
  reason:          z.string().optional(),
  // 2026-07-14: paper-form fields ("ใบลา") — all optional.
  place_written:          z.string().optional(),
  medical_cert_provided:  z.boolean().optional(),
  contact_during_leave:   z.string().optional(),
}).refine(d => new Date(d.end_date) >= new Date(d.start_date), {
  message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น',
  path: ['end_date'],
}).refine(d => !d.is_half_day || d.start_date === d.end_date, {
  message: 'การลาครึ่งวันต้องเป็นวันเดียวกัน',
  path: ['end_date'],
}).refine(d => !d.is_half_day || !!d.half_day_period, {
  message: 'กรุณาเลือกช่วงเวลา (เช้า/บ่าย)',
  path: ['half_day_period'],
})

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
  const today    = new Date().toISOString().split('T')[0]

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      leave_type:  'annual',
      start_date:  today,
      end_date:    today,
      is_half_day: false,
    },
  })

  const leaveType   = watch('leave_type')
  const startDate   = watch('start_date')
  const endDate     = watch('end_date')
  const isHalfDay   = watch('is_half_day')
  const year        = startDate ? new Date(startDate).getFullYear() : new Date().getFullYear()

  const { data: balanceData } = useLeaveBalance(year)
  const balances: any[] = balanceData?.balances ?? []
  const currentBalance   = balances.find(b => b.leave_type === leaveType)

  // When half-day toggled on, sync end to start
  useEffect(() => {
    if (isHalfDay) setValue('end_date', startDate)
  }, [isHalfDay, startDate, setValue])

  const onSubmit = async (values: FormValues) => {
    await create.mutateAsync(values)
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
          "ใบลา" paper form's "ใบรับรองแพทย์ มี/ไม่มี" checkbox. */}
      {leaveType === 'sick' && (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
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
      )}

      {/* เขียนที่ / ติดต่อได้ที่ระหว่างลา — 2026-07-14, paper-form fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="place_written" className="form-label">เขียนที่</label>
          <input
            id="place_written"
            type="text"
            {...register('place_written')}
            className="form-input"
            placeholder="เช่น สำนักงานใหญ่"
          />
        </div>
        <div>
          <label htmlFor="contact_during_leave" className="form-label">ติดต่อได้ที่ / เบอร์โทรระหว่างลา</label>
          <input
            id="contact_during_leave"
            type="text"
            {...register('contact_during_leave')}
            className="form-input"
            placeholder="ที่อยู่หรือเบอร์โทรติดต่อระหว่างลา (ถ้ามี)"
          />
        </div>
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
          disabled={create.isPending}
          className="flex-1 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60 transition-colors"
        >
          {create.isPending ? 'กำลังส่ง...' : 'ยื่นใบลา'}
        </button>
      </div>
    </form>
  )
}
