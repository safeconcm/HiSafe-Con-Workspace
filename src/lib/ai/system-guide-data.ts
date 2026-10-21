// src/lib/ai/system-guide-data.ts
// 2026-10-21c: reference knowledge for Connex AI on how to USE the CONNEX
// system itself (which menu does what), separate from company-policy-data.ts
// (which is the work regulations). Built from the same menu structure as
// src/components/layout/Sidebar.tsx and the step list already written for
// src/app/(dashboard)/user-guide/page.tsx, so the AI's answers describe the
// real, current navigation rather than a guess.
export function renderSystemGuideAsText(): string {
  return `วิธีใช้งานระบบ CONNEX — เมนูหลักและสิ่งที่แต่ละเมนูใช้ทำ:

- หน้าหลัก (/dashboard): สรุปวันลาคงเหลือ สถานะ Timesheet เดือนนี้ และรายการรออนุมัติ (ถ้ามี)
- โปรไฟล์ของฉัน (/profile): ข้อมูลส่วนตัว ลายเซ็นดิจิทัล
- การลา (/leave/my, /leave/new, /leave/team): ดูใบลาของตัวเอง, ยื่นใบลาใหม่ (เลือกประเภทการลา ช่วงวันที่ เหตุผล แล้วกดส่งให้หัวหน้างานอนุมัติ), ดูปฏิทินวันลาของทีม
- Timesheet (/timesheet): กรอกชั่วโมงทำงานแยกตาม Job ในแต่ละวัน ต้องส่งก่อนเที่ยงวันที่ 25 ของทุกเดือน (ระบบจะล็อกการส่งหลังจากนั้น) มีปุ่มดาวน์โหลด PDF และพิมพ์แบบฟอร์มทางการได้
- OT / ทำงานชดเชยวันหยุด (/approvals/ot, /approvals/comp-work): ยื่นและดูคำขอทำงานล่วงเวลา หรือทำงานชดเชยวันหยุด
- รออนุมัติ (/approvals/leave, /approvals/timesheet, /approvals/ot, /approvals/comp-work): สำหรับหัวหน้างาน/ผู้มีสิทธิอนุมัติ ใช้ตรวจสอบและอนุมัติ/ไม่อนุมัติใบลา, Timesheet, OT, งานชดเชยของทีม
- การแจ้งเตือน (/notifications): แจ้งเตือนทุกครั้งที่มีการอนุมัติ/ไม่อนุมัติ หรือประกาศใหม่ (ส่งอีเมลและ LINE ด้วยถ้าเชื่อมต่อไว้)
- ติดต่อ HR (/inquiries): ตั้งกระทู้ถามฝ่ายบุคคลโดยตรง สำหรับเรื่องที่ระบบตอบให้ไม่ได้ (ข้อมูลส่วนตัว เงินเดือน ฯลฯ)
- อัปเดต (/announcements): ประกาศจากบริษัท
- เชื่อมต่อ LINE (/line/link): ผูกบัญชี LINE เพื่อรับแจ้งเตือน
- กฎระเบียบบริษัท (/company-policy): ข้อบังคับเกี่ยวกับการทำงานฉบับเต็ม (ใช้ร่วมกันทั้งเซฟคอนและไฮคอน)
- คู่มือการใช้งาน (/user-guide): สอนขั้นตอนพื้นฐานทีละขั้น

เมนูฝ่ายบุคคล (HR) — /hr/*: ภาพรวม HR, คำถามจากพนักงาน, จัดการใบลา, นโยบายการลา, Timesheet ทั้งหมดของพนักงานทุกคน, วันหยุดประจำปี, ตารางวันทำงาน, รายงาน, Audit Log, สัญญาจ้าง, ทดลองงาน, เช็คลิสต์ onboarding, ใบรับรองการทำงาน, การลาออก, สมัครงาน/ใบสมัครออนไลน์, เงินเดือน, Payroll พนักงานประจำ, ข้อมูลพนักงานทั้งหมด
เมนู Job Cost / Cost Centers — /payroll, /payroll/cost-centers: ต้นทุนแรงงานตาม Job และตาม Activity Code (สำหรับ HR/ผู้บริหาร)

ขั้นตอนพื้นฐานสำหรับพนักงานทั่วไป:
1. เข้าสู่ระบบด้วยอีเมล/รหัสผ่านที่ HR ตั้งให้ (กด "ลืมรหัสผ่าน" ถ้าจำไม่ได้)
2. ดูสรุปวันลาคงเหลือและสถานะงานที่หน้าหลัก
3. ยื่นใบลาที่เมนู "การลา" → "ยื่นใบลาใหม่"
4. กรอก Timesheet ทุกวันทำงานที่เมนู "Timesheet" และส่งก่อนวันที่ 25 ของเดือน
5. หัวหน้างาน/HR อนุมัติรายการต่างๆ ที่เมนู "รออนุมัติ"
6. ติดตามผลผ่านกระดิ่งแจ้งเตือนด้านบน
7. ถาม Connex AI ได้ทุกเมื่อที่ไอคอนแชทมุมบนขวา`
}
