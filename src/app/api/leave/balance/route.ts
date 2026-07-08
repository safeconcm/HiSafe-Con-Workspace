// src/app/api/leave/balance/route.ts
// GET /api/leave/balance  — current user's leave balances for a year

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, unauthorized, forbidden, serverError,
} from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const year = parseInt(
    new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear())
  )
  const userId = new URL(req.url).searchParams.get('user_id') ?? session.id

  // Only HR/Admin can query other users' balances
  if (userId !== session.id && !['hr', 'admin'].includes(session.role)) {
    return forbidden()
  }

  const supabase = createAdminSupabaseClient()

  const { data: balances, error } = await supabase
    .from('leave_balance_summary')
    .select('*')
    .eq('user_id', userId)
    .eq('year', year)
    .order('leave_type')

  if (error) return serverError(error)

  return ok({ balances: balances ?? [], year })
}
