// src/lib/company-context.ts
// Shared helper for multi-company accounts.
//
// A single Supabase Auth user (auth_user_id) can now be linked to more than
// one row in `users` — one per company — so that one admin login can operate
// on behalf of both Safecon and Highcon. This module resolves which of those
// rows is "active" for the current request, based on the connex_active_company
// cookie, and is shared by middleware.ts, the dashboard layout, and the
// dashboard page so all three stay in sync.

export const ACTIVE_COMPANY_COOKIE = 'connex_active_company'

export interface CompanyRef {
  id: string
  code: string
  name_th: string
  logo_url: string | null
}

export function pickActiveRow<T extends { company_id: string }>(
  rows: T[] | null | undefined,
  activeCompanyId?: string | null
): T | null {
  if (!rows || rows.length === 0) return null
  if (activeCompanyId) {
    const match = rows.find(r => r.company_id === activeCompanyId)
    if (match) return match
  }
  return rows[0]
}
