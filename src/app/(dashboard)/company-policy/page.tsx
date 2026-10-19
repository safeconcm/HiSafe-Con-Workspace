// src/app/(dashboard)/company-policy/page.tsx
// ข้อ 3 — separate tab from the user guide (src/app/(dashboard)/user-guide),
// per request. Content placeholder: the actual regulations/policy document
// will be sent later and uploaded here — see Sidebar.tsx for the nav entry.
// Deliberately a plain server component (no data fetching yet) until the
// real content format (uploaded PDF vs. editable text) is decided.
import { Scale } from 'lucide-react'

export const metadata = { title: 'กฎระเบียบบริษัท' }

export default function CompanyPolicyPage() {
  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-2">
        <Scale className="w-5 h-5 text-gray-500" />
        <h1>กฎระเบียบบริษัท</h1>
      </div>

      <div className="card p-10 text-center">
        <div className="inline-flex p-3 rounded-full bg-gray-100 mb-4">
          <Scale className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-700">ยังไม่มีเนื้อหาในขณะนี้</p>
        <p className="text-sm text-gray-400 mt-1.5 max-w-md mx-auto">
          ฝ่ายบุคคลจะนำกฎระเบียบและข้อบังคับการทำงานของบริษัทมาเผยแพร่ที่หน้านี้ในเร็วๆ นี้
        </p>
      </div>
    </div>
  )
}
