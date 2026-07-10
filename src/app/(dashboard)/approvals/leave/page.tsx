'use client'
// src/app/(dashboard)/approvals/leave/page.tsx
import { useState }      from 'react'
import { useLeaves }     from '@/hooks/useLeave'
import { LeaveListTable } from '@/components/leave/LeaveListTable'
import { Loader2, ClipboardList } from 'lucide-react'
import { cn } from '@/utils'

export default function ApprovalsLeavePage() {
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const isPending = tab === 'pending'

  // Server-side scoping (in /api/leave) already handles both statuses
  // correctly per role: supervisors get items assigned to them
  // (current_approver_id) for "รออนุมัติ" and items they personally
  // decided on (approved_by_id) for "อนุมัติแล้ว"; HR/Admin get the
  // whole company either way.
  const { data, isLoading } = useLeaves({
    status: isPending ? 'pending' : 'approved',
    limit: 50,
  })

  const leaves = data?.requests ?? []

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-3 flex-wrap">
        <ClipboardList className="w-5 h-5 text-gray-500" />
        <h1>อนุมัติใบลา</h1>
        {isPending && leaves.length > 0 && (
          <span className="badge bg-amber-100 text-amber-800">{leaves.length} รายการ</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('pending')}
          className={cn('px-4 py-1.5 rounded-md text-sm transition-colors',
            isPending ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
        >
          รออนุมัติ
        </button>
        <button
          onClick={() => setTab('approved')}
          className={cn('px-4 py-1.5 rounded-md text-sm transition-colors',
            !isPending ? 'bg-blue-700 text-white font-medium' : 'text-gray-600 hover:bg-gray-100')}
        >
          อนุมัติแล้ว
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !leaves.length ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
          <p className="text-sm text-gray-400">
            {isPending ? 'ไม่มีรายการรออนุมัติ' : 'ยังไม่มีรายการที่อนุมัติแล้ว'}
          </p>
        </div>
      ) : (
        <LeaveListTable leaves={leaves} showUser />
      )}
    </div>
  )
}
