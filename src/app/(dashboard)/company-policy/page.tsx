// src/app/(dashboard)/company-policy/page.tsx
// 2026-10-21: filled in the placeholder from ข้อ 3 (see git history) with the
// company's actual work regulations ("ข้อบังคับเกี่ยวกับการทำงาน"), per the
// user's uploaded documents:
//   - ข้อบังคับบริษัทHC 1-1-69.pdf — the official filed regulations document
//     for บริษัท ไฮคอน จำกัด (Highcon), effective 1 ม.ค. 2569, signed by
//     กรรมการผู้จัดการ นายมงคล สันติธรรมรักษ์.
//   - HIGHCON_Employee_Blueprint_(3).pdf — an infographic summary of the same
//     content, used here only for the quick-reference numbers strip at top.
// The user asked for this to be the shared regulations for both Safecon and
// Highcon ("ใช้ร่วมกัน") — this page is already company-agnostic (no
// company_id branching, see prior placeholder comment), so the content below
// applies to whoever is logged in, regardless of company. The full legal
// text is reproduced faithfully from the Highcon document; company-specific
// filing details (address/phone/signatory) are shown as a reference to which
// entity's document this transcribes, not asserted as Safecon's own filing.
//
// 2026-10-21c: the actual section data moved to src/lib/company-policy-data
// so src/app/api/ai/chat's system prompt can import the exact same content
// (see that file's header comment) — this page now just renders it.
import { Scale } from 'lucide-react'
import PolicyAccordion from './PolicyAccordion'
import { QUICK_FACTS, POLICY_SECTIONS } from '@/lib/company-policy-data'

export const metadata = { title: 'กฎระเบียบบริษัท' }

export default function CompanyPolicyPage() {
  return (
    <div className="page-container space-y-6">
      <div className="flex items-center gap-2">
        <Scale className="w-5 h-5 text-gray-500" />
        <h1>กฎระเบียบบริษัท</h1>
      </div>

      <div className="card p-5 space-y-1">
        <p className="text-sm font-medium text-gray-800">ข้อบังคับเกี่ยวกับการทำงาน</p>
        <p className="text-xs text-gray-500">
          ใช้ร่วมกันสำหรับพนักงานบริษัท เซฟคอน และ ไฮคอน · มีผลบังคับใช้ตั้งแต่วันที่ 1 มกราคม 2569
        </p>
      </div>

      {/* Quick-reference numbers, pulled from the infographic summary —
          the full legal text below (accordion) is the authoritative source;
          this strip is just a fast at-a-glance lookup. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {QUICK_FACTS.map(f => (
          <div key={f.label} className="card p-3.5">
            <p className="text-xs text-gray-400">{f.label}</p>
            <p className="text-sm font-semibold text-gray-800 mt-0.5">{f.value}</p>
          </div>
        ))}
      </div>

      <PolicyAccordion sections={POLICY_SECTIONS} />

      <p className="text-xs text-gray-400 text-center pt-2">
        เอกสารฉบับเต็มอ้างอิงจากข้อบังคับเกี่ยวกับการทำงาน บริษัท ไฮคอน จำกัด ประกาศ ณ วันที่ 1 มกราคม 2569
        — หากมีข้อสงสัยเกี่ยวกับการบังคับใช้เฉพาะบริษัท กรุณาติดต่อฝ่ายบุคคล
      </p>
    </div>
  )
}
