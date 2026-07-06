'use client'
// src/app/(dashboard)/approvals/leave/page.tsx
import { useState }      from 'react'
import { useLeaves }     from '@/hooks/useLeave'
import { LeaveListTable } from '@/components/leave/LeaveListTable'
import { Loader2, ClipboardList } from 'lucide-react'

export default function ApprovalsLeavePage() {
  const [tab, setTab] = useState<'mine' | 'all'>('mine')

  // Pending items assigned to me
  const { data: myData, isLoading: myLoading } = useLeaves({
    status: 'pending',
    limit: 50,
  })

  const leaves = myData?.requests ?? []

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center gap-3">
        <ClipboardList className="w-5 h-5 text-gray-500" />
        <h1>รออนุมัติใบลา</h1>
        {leaves.length > 0 && (
          <span className="badge bg-amber-100 text-amber-800">{leaves.length} รายการ</span>
        )}
      </div>

      {myLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <LeaveListTable leaves={leaves} showUser />
      )}
    </div>
  )
}
