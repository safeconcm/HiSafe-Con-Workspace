// src/app/api/hr/probation-evaluations/route.ts
// GET  /api/hr/probation-evaluations?contract_id=xxx — list the 3 evaluator slots for a contract
// POST /api/hr/probation-evaluations — record/update one evaluator's result
//
// HR/Admin keys in results collected from the supervisor, department head,
// and MD (paper form or verbal report) — this avoids needing every evaluator
// to have their own login flow just for this one action.

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError, writeAuditLog, isHROrAdmin,
} from '@/lib/api-helpers'

// 'supervisor' was dropped per user request (too many evaluator tiers) —
// still allowed by the DB CHECK constraint (probation_evaluations_evaluator_role_check)
// for backward compatibility, but the app no longer offers or expects it.
const EVALUATOR_ROLES = ['dept_head', 'md']
const RESULTS = ['pass', 'fail', 'extend']

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const { searchParams } = new URL(req.url)
  const contractId = searchParams.get('contract_id')
  if (!contractId) return badRequest('contract_id required')

  const supabase = createAdminSupabaseClient()

  // Confirm the contract belongs to this company (and, for non-HR, is their own)
  const { data: contract } = await supabase
    .from('contracts').select('id, user_id, company_id')
    .eq('id', contractId).eq('company_id', session.company_id).single()
  if (!contract) return badRequest('ไม่พบสัญญาจ้างนี้')
  if (!isHROrAdmin(session) && contract.user_id !== session.id) return forbidden()

  const { data, error } = await supabase
    .from('probation_evaluations')
    .select(`
      *,
      evaluator:users!probation_evaluations_evaluator_id_fkey(id, first_name_th, last_name_th)
    `)
    .eq('contract_id', contractId)

  if (error) return serverError(error)
  return ok({ evaluations: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)              return unauthorized()
  if (!isHROrAdmin(session)) return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const { contract_id, evaluator_role, result, comments, evaluator_id } = body
  if (!contract_id || !evaluator_role || !result) {
    return badRequest('contract_id, evaluator_role, result required')
  }
  if (!EVALUATOR_ROLES.includes(evaluator_role)) {
    return badRequest(`evaluator_role ต้องเป็นหนึ่งใน: ${EVALUATOR_ROLES.join(', ')}`)
  }
  if (!RESULTS.includes(result)) {
    return badRequest(`result ต้องเป็นหนึ่งใน: ${RESULTS.join(', ')}`)
  }

  const supabase = createAdminSupabaseClient()

  const { data: contract } = await supabase
    .from('contracts').select('id, company_id')
    .eq('id', contract_id).eq('company_id', session.company_id).single()
  if (!contract) return badRequest('ไม่พบสัญญาจ้างนี้')

  const { data, error } = await supabase
    .from('probation_evaluations')
    .upsert({
      company_id:     session.company_id,
      contract_id,
      evaluator_role,
      evaluator_id:   evaluator_id ?? null,
      result,
      comments:       comments ?? null,
      evaluated_at:   new Date().toISOString(),
      created_by:     session.id,
    }, { onConflict: 'contract_id,evaluator_role' })
    .select()
    .single()

  if (error) return serverError(error)

  await writeAuditLog({
    session, action: 'probation_evaluation.recorded', entity_type: 'probation_evaluation',
    entity_id: data.id, new_data: data, req,
  })
  return created(data)
}
