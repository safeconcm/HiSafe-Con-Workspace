'use client'
// src/components/timesheet/TimesheetGrid.tsx
// The main monthly timesheet entry grid.
// Layout: Job (rows) x Date (columns) matrix — matches the Excel/PDF export
// layout exactly (src/app/api/timesheet/[id]/export/route.ts,
// src/lib/pdf/timesheet-template.ts), per user request ("ปรับ วันที่เป็นแกนนอน
// ส่วนงาน Job ควรเป็นแกนตั้ง ... จะได้เหมือนไฟล์ที่ export ออกไป"). Previously this
// was one row per date with a single job selector per row (so an employee
// working 2 jobs the same day couldn't enter both) — the backend
// (PATCH /api/timesheet/:id) already accepted an arbitrary flat list of
// {work_date, job_id, hours, remark} lines and validated the per-date 8h
// total across all of them, so this redesign is frontend-only.
//
// Per-date remark was dropped from the old per-row design; it's not shown
// anywhere downstream (not in the PDF, not in the Excel export, not in the
// approval screen) and cramming a text box into a ~30px-wide date cell isn't
// workable. It's replaced with one optional remark per job-row, applied to
// every line saved for that job this month.

import { useState, useCallback, useMemo, useEffect } from 'react'
import { getDaysInMonth, isWeekend, toISODate, LEAVE_TYPE_LABEL, monthName, cn } from '@/utils'
import { AlertCircle, Plus, Trash2 } from 'lucide-react'
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
  activity_code?:  string | null
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
  onChange:   (lines: { work_date: string; job_id: string; hours: number; remark?: string; activity_code?: string }[]) => void
}

const TH_DAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const NO_JOB = '' // sentinel for "not yet selected" in the trailing blank row

// 2026-07-16: "Activity Code" — Section B classification on the official
// paper Timesheet form (Staff Monthly Attendance Time Allocation Record),
// transcribed verbatim (incl. the form's own "Bussiness"/"Planing" spelling)
// so the printed official-form PDF matches the source 100%. One value per
// job-row per month — same storage pattern as the existing `remark` field.
const ACTIVITY_CODES = [
  { value: '01', label: '01 - Pre-tendering/Tendering' },
  { value: '02', label: '02 - Design/Engineering' },
  { value: '03', label: '03 - Bussiness Development' },
  { value: '04', label: '04 - Project/Site Supervision' },
  { value: '05', label: '05 - Project/Site Administration' },
  { value: '06', label: '06 - Project/Site Management' },
  { value: '07', label: '07 - Project/Site Support and Planing' },
  { value: '08', label: '08 - Plant' },
  { value: '09', label: '09 - Safety' },
  { value: '10', label: '10 - General Administration Work' },
  { value: '11', label: '11 - Other Work' },
] as const

function cellKey(jobId: string, dateStr: string) {
  return `${jobId}::${dateStr}`
}

export function TimesheetGrid({ year, month, jobs, holidays, leaves, workingDays, savedLines, disabled, onChange }: Props) {

  const days = useMemo(() => getDaysInMonth(year, month), [year, month])

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

  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs])

  // ── Row (job) list — initialized from saved work lines' distinct jobs,
  //    sorted by job code (same order as the Excel export), plus a trailing
  //    blank row so the user can always add another job. Skipped when
  //    disabled (read-only views, e.g. the approver's "ดูรายละเอียด" page) —
  //    an empty "— เลือก Job —" row inviting a new entry makes no sense on a
  //    view nobody can edit. ──
  const initialRowJobIds = useMemo(() => {
    const ids = Array.from(new Set(
      savedLines.filter(l => l.line_type === 'work').map(l => l.job_id)
    ))
    ids.sort((a, b) => (jobById.get(a)?.job_code ?? '').localeCompare(jobById.get(b)?.job_code ?? ''))
    return disabled ? ids : [...ids, NO_JOB]
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [rowJobIds, setRowJobIds] = useState<string[]>(initialRowJobIds)

  const [cells, setCells] = useState<Map<string, number>>(() => {
    const m = new Map<string, number>()
    for (const l of savedLines) {
      if (l.line_type === 'work') m.set(cellKey(l.job_id, l.work_date), l.hours)
    }
    return m
  })

  const [rowRemarks, setRowRemarks] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const l of savedLines) {
      if (l.line_type === 'work' && l.remark) m.set(l.job_id, l.remark)
    }
    return m
  })

  const [rowActivityCode, setRowActivityCode] = useState<Map<string, string>>(() => {
    const m = new Map<string, string>()
    for (const l of savedLines) {
      if (l.line_type === 'work' && l.activity_code) m.set(l.job_id, l.activity_code)
    }
    return m
  })

  const [errors, setErrors] = useState<Map<string, string>>(new Map())

  // Recompute per-date over-8-hours errors whenever cell data changes
  useEffect(() => {
    const dailyTotals = new Map<string, number>()
    cells.forEach((hours, key) => {
      const dateStr = key.split('::')[1]
      dailyTotals.set(dateStr, (dailyTotals.get(dateStr) ?? 0) + hours)
    })
    const next = new Map<string, string>()
    dailyTotals.forEach((total, dateStr) => {
      const locked = leaveLockedMap.get(dateStr) ?? 0
      if (locked + total > 8) {
        next.set(dateStr, `รวม ${locked + total} ชม. เกิน 8 ชม./วัน`)
      }
    })
    setErrors(next)
  }, [cells, leaveLockedMap])

  // Emit the flat lines array to the parent whenever anything changes
  useEffect(() => {
    const out: { work_date: string; job_id: string; hours: number; remark?: string; activity_code?: string }[] = []
    cells.forEach((hours, key) => {
      if (hours <= 0) return
      const [jobId, dateStr] = key.split('::')
      if (!jobId) return
      out.push({
        work_date: dateStr, job_id: jobId, hours,
        remark:        rowRemarks.get(jobId) ?? undefined,
        activity_code: rowActivityCode.get(jobId) ?? undefined,
      })
    })
    onChange(out)
  }, [cells, rowRemarks, rowActivityCode, onChange])

  const updateCell = useCallback((jobId: string, dateStr: string, hours: number) => {
    setCells(prev => {
      const next = new Map(prev)
      if (hours > 0) next.set(cellKey(jobId, dateStr), hours)
      else next.delete(cellKey(jobId, dateStr))
      return next
    })
  }, [])

  const changeRowJob = useCallback((rowIndex: number, newJobId: string) => {
    setRowJobIds(prev => {
      const oldJobId = prev[rowIndex]
      const next = [...prev]
      next[rowIndex] = newJobId
      // Was this the trailing blank row? Add a fresh blank row after it.
      if (oldJobId === NO_JOB && rowIndex === prev.length - 1 && newJobId !== NO_JOB) {
        next.push(NO_JOB)
      }
      return next
    })
    // Remap any cells already entered under the old job id (rare — only
    // possible if the row previously had a job and the user picked a
    // different one) to the new job id.
    setCells(prev => {
      const oldJobId = rowJobIds[rowIndex]
      if (!oldJobId || oldJobId === newJobId) return prev
      const next = new Map<string, number>()
      prev.forEach((hours, key) => {
        const [jobId, dateStr] = key.split('::')
        next.set(jobId === oldJobId ? cellKey(newJobId, dateStr) : key, hours)
      })
      return next
    })
    setRowRemarks(prev => {
      const oldJobId = rowJobIds[rowIndex]
      if (!oldJobId || !prev.has(oldJobId)) return prev
      const next = new Map(prev)
      const val = next.get(oldJobId)!
      next.delete(oldJobId)
      next.set(newJobId, val)
      return next
    })
    setRowActivityCode(prev => {
      const oldJobId = rowJobIds[rowIndex]
      if (!oldJobId || !prev.has(oldJobId)) return prev
      const next = new Map(prev)
      const val = next.get(oldJobId)!
      next.delete(oldJobId)
      next.set(newJobId, val)
      return next
    })
  }, [rowJobIds])

  const removeRow = useCallback((rowIndex: number) => {
    const jobId = rowJobIds[rowIndex]
    setRowJobIds(prev => prev.filter((_, i) => i !== rowIndex))
    if (jobId) {
      setCells(prev => {
        const next = new Map(prev)
        Array.from(next.keys()).forEach(key => {
          if (key.startsWith(`${jobId}::`)) next.delete(key)
        })
        return next
      })
      setRowRemarks(prev => {
        if (!prev.has(jobId)) return prev
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
      setRowActivityCode(prev => {
        if (!prev.has(jobId)) return prev
        const next = new Map(prev)
        next.delete(jobId)
        return next
      })
    }
  }, [rowJobIds])

  const addBlankRow = useCallback(() => {
    setRowJobIds(prev => prev[prev.length - 1] === NO_JOB ? prev : [...prev, NO_JOB])
  }, [])

  // Per-date lock flags (weekend / holiday / full-day leave) — independent
  // of which job row a cell belongs to.
  const dateInfo = useMemo(() => {
    return days.map(day => {
      const dateStr  = toISODate(day)
      const dow      = day.getDay()
      const dayDate  = day.getDate()
      const weekend  = workingDays ? workingDays[dayDate] === false : isWeekend(day)
      const holiday  = holidayMap.get(dateStr)
      const leave    = leaveMap.get(dateStr)
      const locked   = leaveLockedMap.get(dateStr) ?? 0
      const isFullyLocked = weekend || !!holiday || (!!leave && !leave.isHalf)
      const maxHours = Math.max(0, 8 - locked)
      return { dateStr, dow, dayDate, weekend, holiday, leave, locked, isFullyLocked, maxHours }
    })
  }, [days, workingDays, holidayMap, leaveMap, leaveLockedMap])

  const totalWorkHours = useMemo(() => {
    let t = 0
    cells.forEach(h => { t += h })
    return t
  }, [cells])

  const dayTotals = useMemo(() => {
    const m = new Map<string, number>()
    cells.forEach((hours, key) => {
      const dateStr = key.split('::')[1]
      m.set(dateStr, (m.get(dateStr) ?? 0) + hours)
    })
    return m
  }, [cells])

  const rowTotal = useCallback((jobId: string) => {
    if (!jobId) return 0
    let t = 0
    cells.forEach((hours, key) => { if (key.startsWith(`${jobId}::`)) t += hours })
    return t
  }, [cells])

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

      {/* Grid — Job (rows) x Date (columns), matching the Excel/PDF export */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-[190px] sticky left-0 bg-gray-50 z-10">Job / Activity Code</th>
                {dateInfo.map(d => (
                  <th
                    key={d.dateStr}
                    title={d.holiday ?? undefined}
                    className={cn(
                      'px-0.5 py-2 text-center font-medium w-8 whitespace-nowrap',
                      d.holiday ? 'bg-red-100 text-red-700' : d.weekend ? 'bg-gray-100 text-gray-400' : 'text-gray-600'
                    )}
                  >
                    <div>{d.dayDate}</div>
                    <div className="text-[9px] font-normal">{TH_DAYS[d.dow]}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-left font-medium text-gray-600 min-w-[100px]">หมายเหตุ</th>
                <th className="px-2 py-2 text-center font-medium text-gray-600 w-14">รวม</th>
                <th className="px-1 py-2 w-7"></th>
              </tr>
            </thead>
            <tbody>
              {rowJobIds.map((jobId, rowIndex) => {
                const isBlankRow = jobId === NO_JOB
                const usedElsewhere = new Set(rowJobIds.filter((id, i) => id && i !== rowIndex))
                const options = jobs.filter(j => !usedElsewhere.has(j.id))

                return (
                  <tr key={rowIndex} className={cn('border-b border-gray-100', isBlankRow && 'bg-gray-50/40')}>
                    <td className="px-2 py-1 sticky left-0 bg-white z-10 space-y-1">
                      <select
                        value={jobId}
                        onChange={e => changeRowJob(rowIndex, e.target.value)}
                        disabled={disabled}
                        className="w-full text-xs rounded border border-gray-200 px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">— เลือก Job —</option>
                        {options.map(j => (
                          <option key={j.id} value={j.id}>{j.job_code} · {j.name_th}</option>
                        ))}
                      </select>
                      {!isBlankRow && (
                        <select
                          value={rowActivityCode.get(jobId) ?? ''}
                          onChange={e => setRowActivityCode(prev => {
                            const next = new Map(prev)
                            if (e.target.value) next.set(jobId, e.target.value)
                            else next.delete(jobId)
                            return next
                          })}
                          disabled={disabled}
                          title="Activity Code (สำหรับแบบฟอร์มทางการ)"
                          className="w-full text-[10px] rounded border border-gray-200 px-1.5 py-0.5 bg-white text-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                        >
                          <option value="">— Activity Code —</option>
                          {ACTIVITY_CODES.map(a => (
                            <option key={a.value} value={a.value}>{a.label}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {dateInfo.map(d => {
                      const key = cellKey(jobId, d.dateStr)
                      const value = cells.get(key) ?? ''
                      const err = errors.get(d.dateStr)
                      const cellDisabled = disabled || isBlankRow || d.isFullyLocked

                      const bg = d.holiday ? 'bg-red-50' : d.weekend ? 'bg-gray-50' : d.leave?.isHalf ? 'bg-green-50/40' : ''

                      const lockedTitle = d.holiday ?? (d.leave && !d.leave.isHalf ? `ลา${LEAVE_TYPE_LABEL[d.leave.type]}` : undefined)

                      return (
                        <td key={d.dateStr} className={cn('p-0.5 text-center', bg)}>
                          {d.isFullyLocked ? (
                            <span className="text-gray-300 text-[10px]" title={lockedTitle}>—</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={d.maxHours}
                              step={0.5}
                              value={value}
                              onChange={e => updateCell(jobId, d.dateStr, parseFloat(e.target.value) || 0)}
                              disabled={cellDisabled}
                              placeholder="-"
                              title={err}
                              className={cn(
                                'w-8 text-center text-[11px] rounded border px-0.5 py-1',
                                'focus:outline-none focus:ring-1',
                                err ? 'border-red-400 focus:ring-red-400 bg-red-50' : 'border-gray-200 focus:ring-blue-400',
                                'disabled:bg-gray-50 disabled:text-gray-300'
                              )}
                            />
                          )}
                        </td>
                      )
                    })}

                    <td className="px-2 py-1">
                      {!isBlankRow && (
                        <input
                          type="text"
                          value={rowRemarks.get(jobId) ?? ''}
                          onChange={e => setRowRemarks(prev => {
                            const next = new Map(prev)
                            if (e.target.value) next.set(jobId, e.target.value)
                            else next.delete(jobId)
                            return next
                          })}
                          disabled={disabled}
                          placeholder="หมายเหตุ (ทั้งเดือน)"
                          className="w-full text-[11px] rounded border border-gray-200 px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50"
                        />
                      )}
                    </td>

                    <td className="px-2 py-1 text-center font-medium text-blue-700">
                      {!isBlankRow && rowTotal(jobId) > 0 ? rowTotal(jobId) : ''}
                    </td>

                    <td className="px-1 py-1 text-center">
                      {!isBlankRow && !disabled && (
                        <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="text-gray-300 hover:text-red-500"
                          title="ลบแถวนี้"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Leave row — informational, matches the Excel "ลา" row */}
              {leaveLockedMap.size > 0 && (
                <tr className="border-b border-gray-100 bg-green-50/40">
                  <td className="px-2 py-1.5 text-gray-500 sticky left-0 bg-green-50/40 z-10">ลา</td>
                  {dateInfo.map(d => (
                    <td key={d.dateStr} className="px-0.5 py-1.5 text-center text-green-700">
                      {d.locked > 0 ? d.locked : ''}
                    </td>
                  ))}
                  <td />
                  <td className="px-2 py-1.5 text-center font-medium text-green-700">
                    {Array.from(leaveLockedMap.values()).reduce((a, b) => a + b, 0)}
                  </td>
                  <td />
                </tr>
              )}
            </tbody>

            {/* Footer totals */}
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-medium">
                <td className="px-2 py-2.5 text-gray-700 sticky left-0 bg-gray-50 z-10">รวม/วัน</td>
                {dateInfo.map(d => {
                  const total = (dayTotals.get(d.dateStr) ?? 0) + d.locked
                  return (
                    <td key={d.dateStr} className="px-0.5 py-2.5 text-center text-blue-700">
                      {total > 0 ? total : ''}
                    </td>
                  )
                })}
                <td />
                <td className="px-2 py-2.5 text-center text-blue-700 font-bold">
                  {totalWorkHours + Array.from(leaveLockedMap.values()).reduce((a, b) => a + b, 0)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {!disabled && (
          <div className="px-3 py-2 border-t border-gray-100">
            <button
              type="button"
              onClick={addBlankRow}
              className="flex items-center gap-1.5 text-xs text-blue-700 hover:text-blue-800 font-medium"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มงาน
            </button>
          </div>
        )}
      </div>

      {/* Validation error summary — only actionable while editing a draft.
          On a read-only (disabled) view, e.g. the approver's "ดูรายละเอียด"
          detail page, this over-8h check can still fire against already
          historical/approved data (a work line and a leave line landing on
          the same date), and showing a "พบข้อผิดพลาด" banner on an already-
          approved timesheet reads as an active problem when there's nothing
          to fix — reported 2026-07-11. */}
      {!disabled && errors.size > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm font-medium text-red-700 mb-1 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> พบข้อผิดพลาด:
          </p>
          {Array.from(errors.entries()).map(([date, msg]) => (
            <p key={date} className="text-xs text-red-600">• {date}: {msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}
