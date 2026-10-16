// src/app/access/page.tsx
// Landing route for CONNEX Access (/access) — redirects straight to the
// user list, same entry point the old EM sidebar's "ผู้ดูแลระบบ" nav item
// used (href: '/admin/users'). No index UI of its own needed yet; revisit
// if this module grows enough to want its own overview/dashboard.
import { redirect } from 'next/navigation'

export default function AccessIndexPage() {
  redirect('/access/users')
}
