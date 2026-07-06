// src/app/api/admin/org/route.ts
// GET  /api/admin/org  — full org tree
// POST /api/admin/org  — add node (link user to org)

import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, createAdminSupabaseClient,
  ok, created, badRequest, unauthorized, forbidden,
  serverError,
} from '@/lib/api-helpers'

// ── GET: Full org tree ───────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const supabase = createAdminSupabaseClient()

  const { data: nodes, error } = await supabase
    .from('organization_nodes')
    .select(`
      id, parent_id, depth, acting_approver_id, is_active,
      user:users!organization_nodes_user_id_fkey(
        id, employee_code, first_name_th, last_name_th,
        position_th, department, role, avatar_url, status
      ),
      acting_approver:users!organization_nodes_acting_approver_id_fkey(
        id, first_name_th, last_name_th
      )
    `)
    .eq('company_id', session.company_id)
    .eq('is_active', true)
    .order('depth')

  if (error) return serverError(error)

  // Build tree structure
  const nodeMap = new Map<string, any>()
  const roots:   any[] = []

  ;(nodes ?? []).forEach((n: any) => {
    nodeMap.set(n.id, { ...n, children: [] })
  })

  nodeMap.forEach(node => {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(node)
    } else {
      roots.push(node)
    }
  })

  return ok({ tree: roots, flat: nodes ?? [] })
}

// ── POST: Add org node ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session)                return unauthorized()
  if (session.role !== 'admin') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body?.user_id) return badRequest('user_id required')

  const supabase = createAdminSupabaseClient()

  // Check user belongs to company
  const { data: user } = await supabase
    .from('users').select('id').eq('id', body.user_id).eq('company_id', session.company_id).single()
  if (!user) return badRequest('User not found in your company')

  // Calculate depth from parent
  let depth = 0
  if (body.parent_id) {
    const { data: parent } = await supabase
      .from('organization_nodes').select('depth').eq('id', body.parent_id).single()
    depth = (parent?.depth ?? -1) + 1
  }

  const { data: node, error } = await supabase
    .from('organization_nodes')
    .upsert({
      company_id:         session.company_id,
      user_id:            body.user_id,
      parent_id:          body.parent_id  ?? null,
      depth,
      acting_approver_id: body.acting_approver_id ?? null,
      is_active:          true,
      effective_from:     body.effective_from ?? new Date().toISOString().split('T')[0],
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) return serverError(error)
  return created(node)
}
