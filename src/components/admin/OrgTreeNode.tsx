'use client'
// src/components/admin/OrgTreeNode.tsx
// Recursive tree node renderer for org chart

import { useState } from 'react'
import { cn, fullNameTH, ROLE_LABEL } from '@/utils'
import { ChevronDown, ChevronRight, UserPlus, Settings2, UserX } from 'lucide-react'
import type { UserRole } from '@/types/database'

const DEPTH_LABEL: Record<number, string> = {
  0: 'CEO', 1: 'MD / ผู้บริหาร', 2: 'Manager', 3: 'Supervisor', 4: 'พนักงาน',
}
const DEPTH_COLOR: Record<number, string> = {
  0: 'bg-purple-100 text-purple-800',
  1: 'bg-blue-100   text-blue-800',
  2: 'bg-indigo-100 text-indigo-800',
  3: 'bg-amber-100  text-amber-800',
  4: 'bg-gray-100   text-gray-700',
}

interface OrgNode {
  id: string
  parent_id: string | null
  depth: number
  acting_approver_id: string | null
  user: {
    id: string; employee_code: string
    first_name_th: string; last_name_th: string
    position_th: string | null; department: string | null
    role: UserRole; avatar_url: string | null; status: string
  }
  acting_approver?: { id: string; first_name_th: string; last_name_th: string } | null
  children?: OrgNode[]
}

interface Props {
  node:       OrgNode
  isAdmin:    boolean
  onEdit?:    (node: OrgNode) => void
  onAddChild?: (parentNode: OrgNode) => void
}

export function OrgTreeNode({ node, isAdmin, onEdit, onAddChild }: Props) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = (node.children?.length ?? 0) > 0
  const inactive    = node.user.status !== 'active'

  return (
    <div className="relative">
      {/* Node card */}
      <div className={cn(
        'flex items-center gap-3 rounded-xl border px-4 py-3 mb-2 bg-white transition-all',
        inactive ? 'opacity-50 border-gray-200' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      )}>
        {/* Expand toggle */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 hover:text-gray-700 shrink-0"
          >
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
            }
          </button>
        ) : (
          <div className="w-4 shrink-0" />
        )}

        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-semibold shrink-0">
          {node.user.first_name_th.charAt(0)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{fullNameTH(node.user)}</span>
            <span className={cn('badge text-[10px]', DEPTH_COLOR[node.depth] ?? 'bg-gray-100 text-gray-600')}>
              {DEPTH_LABEL[node.depth] ?? `ระดับ ${node.depth}`}
            </span>
          </div>
          <p className="text-xs text-gray-400 truncate">
            {node.user.employee_code}
            {node.user.position_th && ` · ${node.user.position_th}`}
            {node.user.department  && ` · ${node.user.department}`}
          </p>
          {node.acting_approver && (
            <p className="text-[10px] text-amber-600 mt-0.5">
              ผู้ทำหน้าที่แทน: {fullNameTH(node.acting_approver)}
            </p>
          )}
        </div>

        {/* Actions (admin only) */}
        {isAdmin && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit?.(node)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="แก้ไข"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onAddChild?.(node)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
              title="เพิ่มผู้ใต้บังคับบัญชา"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="ml-8 pl-4 border-l-2 border-gray-100 space-y-0">
          {node.children!.map(child => (
            <OrgTreeNode
              key={child.id}
              node={child}
              isAdmin={isAdmin}
              onEdit={onEdit}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}
