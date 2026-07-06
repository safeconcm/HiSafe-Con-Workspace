// src/app/(dashboard)/leave/new/page.tsx
import type { Metadata } from 'next'
import { CreateLeaveForm } from '@/components/leave/CreateLeaveForm'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = { title: 'ยื่นใบลาใหม่' }

export default function NewLeavePage() {
  return (
    <div className="page-container max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/leave/my" className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1>ยื่นใบลาใหม่</h1>
      </div>
      <div className="card card-body">
        <CreateLeaveForm />
      </div>
    </div>
  )
}
