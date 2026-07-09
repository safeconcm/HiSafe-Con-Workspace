'use client'
// src/components/timesheet/TimesheetGrid.tsx
// The main monthly timesheet entry grid
// Columns: date | day | job selector | hours | remark | status indicator

import { useState, useCallback, useMemo } from 'react'
import { getDaysInMonth, isWeekend, toISODate, LEAVE_TYPE_LABEL, monthName, cn } from '@/utils'
import { Lock, AlertCircle } from 'lucide-react'
import type { LeaveType } from '@/types/database'

interface Job {
  id:      string
  job_code: string
  name_th: string
}

interface Holiday {
  holiday_date: string
  name_th:      string
}

interface LeaveRecord {
  id:              string
  leave_type:      LeaveType
  start_date:      string
  end_date:        string
  is_half_day:     boolean
  half_day_period: 'morning' | 'afternoon' | null
  total_days:      number
}

interface TimesheetLine {
  id?:             string
  work_date:       string
  job_id:          string
  hours:           number
  line_type:       'work' | 'leave'
  leave_request_id?: string | null
  remark?:         string | null
}

interface DayState {
  work_date: string
  job_id:    string
  hours:     number
  remark:    string
}

interface Props {
  year:       number
  month:      number
  jobs:       Job[]
  holidays:   Holiday[]
  leaves:     LeaveRecord[]
  // This company's working-day pattern for the month, keyed by
  // day-of-month (1..31) -> is this a working day. Comes from
  // /api/timesheet's workingDays field (see src/lib/work-schedule.ts).
  // Falls back to the old Sat/Sun assumption if not provided, so nothing
  // breaks if an older cached response lacks the field.
  workingDays?: Record<number, boolean>
  savedLines: TimesheetLine[]
  disabled:   boolean           // true when submitted/approved
  onChange:   (lines: DayState[]) => void
}

const TH_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

export function TimesheetGrid({ year, month, jobs, holidays, leaves, workingDays, savedLines, disabled, onChange }: Props) {

  // Build lookup maps
  const holidayMap = useMemo(() =>
    new Map(holidays.map(h => [h.holiday_date, h.name_th])), [holidays])

  const leaveMap = useMemo(() => {
    const m = new Map<string, { type: LeaveType; isHalf: boolean; period: string | null }>()
    for (const lv of leaves) {
      const start = new Date(lv.start_date)
      const end   = new Date(lv.end_date)
      const cur   = new Date(start)
      while (cur <= end) {
        const key = toISODate(cur)
        m.set(key, { type: lv.leave_type, isHalf: lv.is_half_day, period: lv.half_day_period })
        cur.setDate(cur.getDate() + 1)
      }
    }
    return m
  }, [leaves])

  // Leave-locked hours per date (from saved lines of type 'leave')
  const leaveLockedMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of savedLines) {
      if (l.line_type === 'leave') {
        m.set(l.work_date, (m.get(l.work_date) ?? 0) + l.hours)
      }
    }
    return m
  }, [savedLines])

  // Initialize editable state from saved work lines
  const initLines = useCallback((): Map<string, DayState> => {
    const m = new Map<string, DayState>()
    for (const l of savedLines) {
      if (l.line_type === 'work') {
        m.set(l.work_date, {
          work_date: l.work_date,
          job_id:    l.job_id,
          hours:     l.hours,
          remark:    l.remark ?? '',
        })
      }
    }
    return m
  }, [savedLines])

  const [lines, setLines] = useState<Map<string, DayState>>(initLines)
  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  const days = useMemo(() => getDaysInMonth(year, month), [year, month])

  // Update a single day's entry
  const updateLine = useCallback((date: string, field: keyof DayState, value: string | number) => {
    setLines(prev => {
      const next = new Map(prev)
      const existing = next.get(date) ?? { work_date: date, job_id: '', hours: 0, remark: '' }
      next.set(date, { ...existing, [field]: value })

      // Emit all non-empty lines to parent
      const allLines = Array.from(next.values()).filter(l => l.hours > 0 || l.job_id)
      onChange(allLines)
      return next
    })

    // Validate hours
    if (field === 'hours') {
      const locked = leaveLockedMap.get(date) ?? 0
      const total  = locked + Number(value)
      setErrors(prev => {
        const next = new Map(prev)
        if (total > 8) {
          next.set(date, `รวม ${total} ชม. เกิน 8 ชม./วัน`)
        } else {
          next.delete(date)
        }
        return next
      })
    }
  }, [leaveLockedMap, onChange])

  // Total work hours this month
  const totalWorkHours = useMemo(() => {
    let t = 0
    lines.forEach(l => { t += l.hours })
    return t
  }, [lines])

  const defaultJobId = jobs[0]?.id ?? ''

  return (
    <div className="space-y-3">
      {/* Month header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          {monthName(month)} {year}
        </h3>
        <div className="text-sm text-gray-600">
          รวม{' '}
          <span className="font-semibold text-blue-700">{totalWorkHours}</span>
          {' '}ชั่วโมง
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block"/>&nbsp;วันหยุด</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block"/>&nbsp;วันลา</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block"/>&nbsp;วันหยุดประจำสัปดาห์</span>
      </div>

      {/* Grid */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-20">วัน</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-600 w-10">วันที่</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-600 min-w-[180px]">Job</th>
                <th className="px-3 py-2.5 text-center font-medium text-gray-600 w-20">ชั่วโมง</th>
                <th className="px-3 py-2.5 text-left font-medium text-gray-600 min-w-[120px]">หมายเหตุ</th>
                <th className="px-2 py-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {days.map(day => {
                const dateStr    = toISODate(day)
                const dow        = day.getDay()
                const dayDate    = day.getDate()
                // Use this company's actual work schedule when provided;
                // fall back to the old Sat/Sun assumption otherwise (see
                // Props.workingDays doc comment above).
                const weekend    = workingDays ? workingDays[dayDate] === false : isWeekend(day)
                const holiday    = holidayMap.get(dateStr)
                const leave      = leaveMap.get(dateStr)
                const locked     = leaveLockedMap.get(dateStr) ?? 0
                const isLocked   = weekend || !!holiday
                const isLeaveDay = !!leave
                const maxHours   = Math.max(0, 8 - locked)
                const line       = lines.get(dateStr)
                const err        = errors.get(dateStr)

                // Row background
                const rowBg = weekend
                  ? 'bg-gray-50 opacity-60'
                  : holiday
                  ? 'bg-red-50'
                  : isLeaveDay && !leave?.isHalf
                  ? 'bg-green-50'
                  : leave?.isHalf
                  ? 'bg-green-50/50'
                  : 'bg-white hover:bg-blue-50/30'

                return (
                  <tr key={dateStr} className={cn('border-b border-gray-100 transition-colors', rowBg)}>
                    {/* Day name */}
                    <td className={cn('px-3 py-2 text-xs', weekend ? 'text-gray-400' : 'text-gray-600')}>
                      {TH_DAYS[dow]}
                    </td>

                    {/* Date number */}
                    <td className="px-3 py-2 font-medium text-gray-700 text-center">
                      {dayDate}
                    </td>

                    {/* Job selector */}
                    <td className="px-2 py-1.5">
                      {isLocked || (isLeaveDay && !leave?.isHalf) ? (
                        <span className="text-xs text-gray-400 italic">
                          {holiday ?? (leave ? `ลา${LEAVE_TYPE_LABEL[leave.type]}` : '—')}
                        </span>
                      ) : (
                        <div>
                          <select
                            value={line?.job_id ?? ''}
                            onChange={e => updateLine(dateStr, 'job_id', e.target.value)}
                            disabled={disabled || maxHours === 0}
                            className={cn(
                              'w-full text-xs rounded border border-gray-200 px-2 py-1.5 bg-white',
                              'focus:outline-none focus:ring-1 focus:ring-blue-400',
                              'disabled:bg-gray-50 disabled:text-gray-400'
                            )}
                          >
                            <option value="">— เลือก Job —</option>
                            {jobs.map(j => (
                              <option key={j.id} value={j.id}>
                                {j.job_code} · {j.name_th}
                              </option>
                            ))}
                          </select>
                          {isLeaveDay && leave?.isHalf && (
                            <p className="text-[10px] text-green-600 mt-0.5">
                              ลา{leave.period === 'morning' ? 'เช้า' : 'บ่าย'} 4 ชม. · งานได้อีก {maxHours} ชม.
                            </p>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Hours input */}
                    <td className="px-2 py-1.5 text-center">
                      {isLocked || (isLeaveDay && !leave?.isHalf) ? (
                        <span className="text-xs text-gray-400">
                          {locked > 0 ? `${locked} ชม.` : '—'}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={maxHours}
                          step={0.5}
                          value={line?.hours ?? ''}
                          onChange={e => updateLine(dateStr, 'hours', parseFloat(e.target.value) || 0)}
                          disabled={disabled || !line?.job_id}
                          placeholder="0"
                          className={cn(
                            'w-16 text-center text-xs rounded border px-2 py-1.5',
                            'focus:outline-none focus:ring-1',
                            err
                              ? 'border-red-400 focus:ring-red-400 bg-red-50'
                              : 'border-gray-200 focus:ring-blue-400 bg-white',
                            'disabled:bg-gray-50 disabled:text-gray-400'
                          )}
                        />
                      )}
                    </td>

                    {/* Remark */}
                    <td className="px-2 py-1.5">
                      {!isLocked && !(isLeaveDay && !leave?.isHalf) && (
                        <input
                          type="text"
                          value={line?.remark ?? ''}
                          onChange={e => updateLine(dateStr, 'remark', e.target.value)}
                          disabled={disabled}
                          placeholder="หมายเหตุ"
                          className="w-full text-xs rounded border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                        />
                      )}
                    </td>

                    {/* Error indicator */}
                    <td className="px-2 py-1.5">
                      {err && (
                        <div title={err}>
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        </div>
                      )}
                      {(isLocked || (isLeaveDay && !leave?.isHalf)) && (
                        <Lock className="w-3 h-3 text-gray-300" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>

            {/* Footer totals */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-medium">
                <td colSpan={3} className="px-3 py-3 text-sm text-gray-700">รวมชั่วโมงทั้งเดือน</td>
                <td className="px-2 py-3 text-center text-sm text-blue-700 font-bold">{totalWorkHours}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Validation error summary */}
      {errors.size > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1">พบข้อผิดพลาด:</p>
          {Array.from(errors.entries()).map(([date, msg]) => (
            <p key={date} className="text-xs text-red-600">• {date}: {msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}
