// src/lib/thai-holidays-data.ts
//
// Reference data + logic for auto-generating Thailand's national public
// holiday calendar for private-sector companies.
//
// Why this isn't a live API call: no free, zero-setup public API reliably
// covers Thailand (Nager.Date returns 204/empty for "TH" — verified directly
// by calling its endpoint, not just trusting search results). Calendarific/
// iApp do cover Thailand but require signing up for a new paid API key,
// which isn't something we can provision unilaterally. So instead we keep a
// small maintained reference table here — the same approach government and
// private HR calendars themselves use, since Thai holidays are officially
// gazetted by cabinet resolution each year anyway.
//
// Two kinds of holidays:
//   1. FIXED-DATE holidays — same solar calendar date every year. Computed
//      by formula, no maintenance needed as years change.
//   2. LUNAR BUDDHIST holidays — Makha Bucha, Visakha Bucha, Asarnha Bucha,
//      and the first day of Buddhist Lent (Khao Phansa) shift every year
//      because they follow the Thai lunar calendar. These CANNOT be
//      computed by formula — they must come from this per-year lookup
//      table, which needs a new entry added each year once the date is
//      confirmed (usually well known 1-2+ years ahead from Buddhist
//      calendars).
//
// Deliberately EXCLUDED:
//   - Royal Ploughing Day (วันพืชมงคล) — government/civil-servant holiday
//     only, not observed by private companies or banks.
//   - Ad-hoc cabinet-announced "special"/bridge holidays (e.g. a Friday
//     added to bridge a long weekend) — these are announced year-by-year
//     with no advance pattern and must still be entered manually via the
//     regular "เพิ่มวันหยุด" form when the government announces them.
//
// Substitute holidays (วันหยุดชดเชย): whenever a holiday below falls on a
// Saturday or Sunday, Thai convention grants a substitute holiday on the
// next working weekday (in practice, always the following Monday for a
// single-day holiday). computeThaiHolidaysForYear() adds these
// automatically.

export interface ThaiHolidayDef {
  name_th: string
  name_en: string
  /** Whether Sat/Sun substitute-holiday rules apply to this one. Almost
   *  always true for real public holidays; false only in edge cases. */
  substitute: boolean
}

// ---- 1. Fixed-date holidays (month/day identical every year) ----------
export const FIXED_HOLIDAYS: Array<ThaiHolidayDef & { month: number; day: number }> = [
  { month: 1,  day: 1,  name_th: 'วันขึ้นปีใหม่',              name_en: "New Year's Day",                substitute: true },
  { month: 4,  day: 6,  name_th: 'วันจักรี',                    name_en: 'Chakri Memorial Day',            substitute: true },
  { month: 4,  day: 13, name_th: 'วันสงกรานต์',                 name_en: 'Songkran Festival',              substitute: true },
  { month: 4,  day: 14, name_th: 'วันสงกรานต์',                 name_en: 'Songkran Festival',              substitute: true },
  { month: 4,  day: 15, name_th: 'วันสงกรานต์',                 name_en: 'Songkran Festival',              substitute: true },
  { month: 5,  day: 1,  name_th: 'วันแรงงานแห่งชาติ',           name_en: 'National Labour Day',            substitute: true },
  { month: 5,  day: 4,  name_th: 'วันฉัตรมงคล',                 name_en: 'Coronation Day',                 substitute: true },
  { month: 6,  day: 3,  name_th: 'วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี', name_en: "Queen Suthida's Birthday",  substitute: true },
  { month: 7,  day: 28, name_th: 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว', name_en: "King's Birthday", substitute: true },
  { month: 8,  day: 12, name_th: 'วันแม่แห่งชาติ',              name_en: "Mother's Day / Queen Mother's Birthday", substitute: true },
  { month: 10, day: 13, name_th: 'วันคล้ายวันสวรรคตรัชกาลที่ 9', name_en: 'King Bhumibol Memorial Day',    substitute: true },
  { month: 10, day: 23, name_th: 'วันปิยมหาราช',                name_en: 'Chulalongkorn Day',              substitute: true },
  { month: 12, day: 5,  name_th: 'วันพ่อแห่งชาติ',              name_en: "Father's Day / King Bhumibol's Birthday", substitute: true },
  { month: 12, day: 10, name_th: 'วันรัฐธรรมนูญ',                name_en: 'Constitution Day',               substitute: true },
  { month: 12, day: 31, name_th: 'วันสิ้นปี',                    name_en: "New Year's Eve",                 substitute: true },
]

// ---- 2. Lunar Buddhist holidays — per-year lookup table ----------------
// Confidence per year is tracked so the UI can warn HR when a year's lunar
// dates are estimates pending official confirmation rather than verified.
export interface LunarHolidayEntry {
  date: string // YYYY-MM-DD
  name_th: string
  name_en: string
}

export const LUNAR_HOLIDAYS: Record<number, { confidence: 'confirmed' | 'estimated'; holidays: LunarHolidayEntry[] }> = {
  2025: {
    confidence: 'confirmed',
    holidays: [
      { date: '2025-02-12', name_th: 'วันมาฆบูชา',   name_en: 'Makha Bucha Day' },
      { date: '2025-05-12', name_th: 'วันวิสาขบูชา', name_en: 'Visakha Bucha Day' },
      { date: '2025-07-10', name_th: 'วันอาสาฬหบูชา', name_en: 'Asarnha Bucha Day' },
      { date: '2025-07-11', name_th: 'วันเข้าพรรษา', name_en: 'Buddhist Lent Day' },
    ],
  },
  2026: {
    confidence: 'confirmed',
    holidays: [
      { date: '2026-03-03', name_th: 'วันมาฆบูชา',   name_en: 'Makha Bucha Day' },
      { date: '2026-05-31', name_th: 'วันวิสาขบูชา', name_en: 'Visakha Bucha Day' },
      { date: '2026-07-29', name_th: 'วันอาสาฬหบูชา', name_en: 'Asarnha Bucha Day' },
      { date: '2026-07-30', name_th: 'วันเข้าพรรษา', name_en: 'Buddhist Lent Day' },
    ],
  },
  2027: {
    // Secondary-source estimates only — NOT yet an official government
    // gazette confirmation. HR should double-check against the official
    // cabinet announcement (usually published ~1 year ahead) before
    // finalizing 2027 leave planning.
    confidence: 'estimated',
    holidays: [
      { date: '2027-02-21', name_th: 'วันมาฆบูชา',   name_en: 'Makha Bucha Day' },
      { date: '2027-05-20', name_th: 'วันวิสาขบูชา', name_en: 'Visakha Bucha Day' },
      { date: '2027-07-18', name_th: 'วันอาสาฬหบูชา', name_en: 'Asarnha Bucha Day' },
      { date: '2027-07-19', name_th: 'วันเข้าพรรษา', name_en: 'Buddhist Lent Day' },
    ],
  },
}

export interface ComputedHoliday {
  holiday_date: string // YYYY-MM-DD
  name_th: string
  name_en: string
  is_substitute: boolean
}

function pad(n: number) { return String(n).padStart(2, '0') }
function toISODate(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }

/** 0 = Sunday .. 6 = Saturday, using UTC to avoid local-timezone drift. */
function dayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay()
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

/**
 * Computes the full set of private-sector-observed Thai public holidays for
 * a given year, including automatically-derived ชดเชย (substitute) days for
 * any holiday that falls on a Saturday or Sunday.
 *
 * Returns `lunarConfidence: null` if no lunar holiday data exists yet for
 * this year (caller should warn the user rather than silently omitting
 * Makha/Visakha/Asarnha Bucha and Buddhist Lent Day).
 */
export function computeThaiHolidaysForYear(year: number): {
  holidays: ComputedHoliday[]
  lunarConfidence: 'confirmed' | 'estimated' | null
} {
  const base: ComputedHoliday[] = FIXED_HOLIDAYS.map(h => ({
    holiday_date: toISODate(year, h.month, h.day),
    name_th: h.name_th,
    name_en: h.name_en,
    is_substitute: false,
  }))

  const lunar = LUNAR_HOLIDAYS[year]
  if (lunar) {
    for (const h of lunar.holidays) {
      base.push({ holiday_date: h.date, name_th: h.name_th, name_en: h.name_en, is_substitute: false })
    }
  }

  base.sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))

  // Substitute-holiday pass: for each holiday landing on Sat(6)/Sun(0),
  // add a substitute on the next weekday that isn't itself already a
  // holiday in this set (walks forward day-by-day — handles the rare case
  // of back-to-back holidays like Songkran spilling into a weekend).
  const existingDates = new Set(base.map(h => h.holiday_date))
  const substitutes: ComputedHoliday[] = []

  for (const h of base) {
    const dow = dayOfWeek(h.holiday_date)
    if (dow !== 0 && dow !== 6) continue

    let candidate = addDays(h.holiday_date, 1)
    while (existingDates.has(candidate) || dayOfWeek(candidate) === 0 || dayOfWeek(candidate) === 6) {
      candidate = addDays(candidate, 1)
    }
    existingDates.add(candidate)
    substitutes.push({
      holiday_date: candidate,
      name_th: `วันหยุดชดเชย ${h.name_th}`,
      name_en: `Substitute for ${h.name_en}`,
      is_substitute: true,
    })
  }

  const all = [...base, ...substitutes].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))

  return { holidays: all, lunarConfidence: lunar?.confidence ?? null }
}
