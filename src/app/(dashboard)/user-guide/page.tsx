// src/app/(dashboard)/user-guide/page.tsx
// ข้อ 4 — "คู่มือการใช้งาน" tab, separate from "กฎระเบียบบริษัท" per request.
// Built now (no content to wait on, unlike company-policy) as a simple
// step-by-step walkthrough with a friendly original mascot illustration per
// step (not any existing character/brand — plain shapes drawn for this
// page), per request for something "ง่ายๆ มีภาพอธิบายเป็นตัวการ์ตูน".
import {
  LogIn, LayoutDashboard, CalendarDays, Clock,
  ClipboardCheck, Bell, Bot, BookOpen,
} from 'lucide-react'

export const metadata = { title: 'คู่มือการใช้งาน' }

// One reusable mascot — a small rounded-square "assistant" character drawn
// from plain shapes (no face/character borrowed from anywhere) — just
// recolored + given a different held prop per step via the `badge` icon.
function Mascot({ color, badgeColor, Badge }: { color: string; badgeColor: string; Badge: React.ElementType }) {
  return (
    <div className="relative w-20 h-20 mx-auto">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* body */}
        <rect x="18" y="22" width="64" height="58" rx="20" fill={color} />
        {/* eyes */}
        <circle cx="38" cy="48" r="5.5" fill="white" />
        <circle cx="62" cy="48" r="5.5" fill="white" />
        <circle cx="38" cy="48" r="2.5" fill="#1f2937" />
        <circle cx="62" cy="48" r="2.5" fill="#1f2937" />
        {/* smile */}
        <path d="M40 62 Q50 70 60 62" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        {/* antenna */}
        <line x1="50" y1="22" x2="50" y2="10" stroke={color} strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="8" r="5" fill={color} />
        {/* arms */}
        <line x1="18" y1="55" x2="6" y2="45" stroke={color} strokeWidth="6" strokeLinecap="round" />
        <line x1="82" y1="55" x2="94" y2="45" stroke={color} strokeWidth="6" strokeLinecap="round" />
      </svg>
      {/* action badge */}
      <div
        className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full flex items-center justify-center shadow-md ring-2 ring-white"
        style={{ background: badgeColor }}
      >
        <Badge className="w-4 h-4 text-white" />
      </div>
    </div>
  )
}

const STEPS: { title: string; body: string; color: string; badgeColor: string; icon: React.ElementType }[] = [
  {
    title: '1. เข้าสู่ระบบ',
    body: 'เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ HR ตั้งให้ หากลืมรหัสผ่านให้กด "ลืมรหัสผ่าน" ที่หน้า Login',
    color: '#2563EB', badgeColor: '#1D4ED8', icon: LogIn,
  },
  {
    title: '2. หน้าหลัก (Dashboard)',
    body: 'หลังเข้าสู่ระบบจะเห็นสรุปวันลาคงเหลือ สถานะ Timesheet เดือนนี้ และรายการรออนุมัติ (ถ้ามี) ในหน้าเดียว',
    color: '#7C3AED', badgeColor: '#6D28D9', icon: LayoutDashboard,
  },
  {
    title: '3. ยื่นใบลา',
    body: 'ไปที่เมนู "การลา" → "ยื่นใบลาใหม่" เลือกประเภทการลา ช่วงวันที่ และเหตุผล แล้วกดส่ง ระบบจะส่งไปให้หัวหน้างานอนุมัติอัตโนมัติ',
    color: '#DB2777', badgeColor: '#BE185D', icon: CalendarDays,
  },
  {
    title: '4. กรอก Timesheet',
    body: 'ไปที่เมนู "Timesheet" เลือก Job ที่ทำในแต่ละวัน แล้วกรอกชั่วโมงทำงาน กดส่งก่อนวันที่ 25 ของทุกเดือน',
    color: '#D97706', badgeColor: '#B45309', icon: Clock,
  },
  {
    title: '5. อนุมัติรายการ (หัวหน้างาน/HR)',
    body: 'ถ้าคุณเป็นหัวหน้างาน จะเห็นเมนู "รออนุมัติ" สำหรับตรวจสอบและอนุมัติใบลา/Timesheet/OT/งานชดเชยของทีม',
    color: '#059669', badgeColor: '#047857', icon: ClipboardCheck,
  },
  {
    title: '6. การแจ้งเตือน',
    body: 'ทุกครั้งที่มีการอนุมัติ/ไม่อนุมัติ หรือมีประกาศใหม่ ระบบจะแจ้งเตือนในกระดิ่งด้านบน พร้อมส่งอีเมลและ LINE (ถ้าเชื่อมต่อไว้)',
    color: '#DC2626', badgeColor: '#B91C1C', icon: Bell,
  },
  {
    title: '7. ถาม Connex AI',
    body: 'มีคำถามอะไรก็ถามได้ที่ไอคอนแชทมุมบนขวาของทุกหน้า หรือที่หน้า /hub — ถามได้ทั้งเรื่องงานและเรื่องทั่วไป',
    color: '#4338CA', badgeColor: '#3730A3', icon: Bot,
  },
]

export default function UserGuidePage() {
  return (
    <div className="page-container space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-gray-500" />
        <h1>คู่มือการใช้งาน</h1>
      </div>
      <p className="text-sm text-gray-500">ขั้นตอนพื้นฐานในการใช้งานระบบ CONNEX สำหรับพนักงานทุกคน</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {STEPS.map(step => (
          <div key={step.title} className="card p-5 flex flex-col items-center text-center gap-3">
            <Mascot color={step.color} badgeColor={step.badgeColor} Badge={step.icon} />
            <h3 className="text-sm font-semibold text-gray-900">{step.title}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center pt-2">
        ติดใจสงสัยเพิ่มเติม ถาม Connex AI หรือไปที่เมนู &quot;ติดต่อ HR&quot; ได้เลย
      </p>
    </div>
  )
}
