// src/app/access/page.tsx
// Landing route for CONNEX Access (/access) — redirects straight to the
// user list, same entry point the old EM sidebar's "ผู้ดูแลระบบ" nav item
// used (href: '/admin/users'). No index UI of its own needed yet; revisit
// if this module grows enough to want its own overview/dashboard.
//
// Briefly role-aware (2026-10-20) while Cost Centers lived at
// /access/cost-centers and HR needed somewhere other than /access/users to
// land. That page moved out to src/app/(dashboard)/payroll/cost-centers the
// same day (follow-up: "ย้าย Cost Centers ให้ HR ดู Tab HR ... เพราะ
// Payroll job cost จะอยู่ด้วยกัน"), and this module is Admin-only again —
// see src/app/access/layout.tsx — so this is back to a plain redirect with
// no session lookup needed.
import { redirect } from 'next/navigation'

export default function AccessIndexPage() {
  redirect('/access/users')
}
