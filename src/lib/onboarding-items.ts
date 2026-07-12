// src/lib/onboarding-items.ts
// Default checklist templates for onboarding (new hires) and offboarding
// (resignation clearance). Kept as plain data — each item lives inside a
// jsonb array on the parent record (onboarding_checklists.items /
// resignations.clearance_items), so editing this template only affects
// checklists created after the change; existing checklists keep whatever
// items they were seeded with.

export interface ChecklistItem {
  key:     string
  label:   string
  category?: string
  done:    boolean
  done_by?: string | null
  done_at?: string | null
}

export function defaultOnboardingItems(): ChecklistItem[] {
  const template: { key: string; label: string; category: string }[] = [
    { key: 'id_copy',           label: 'สำเนาบัตรประชาชน',                          category: 'เอกสาร' },
    { key: 'house_reg',         label: 'สำเนาทะเบียนบ้าน',                          category: 'เอกสาร' },
    { key: 'education',         label: 'สำเนาวุฒิการศึกษา',                         category: 'เอกสาร' },
    { key: 'contract_signed',   label: 'สัญญาจ้างเซ็นเรียบร้อย',                     category: 'เอกสาร' },
    { key: 'bank_account',      label: 'เลขบัญชีธนาคารสำหรับโอนเงินเดือน',           category: 'เอกสาร' },
    { key: 'emergency_contact', label: 'ข้อมูลผู้ติดต่อฉุกเฉิน',                     category: 'เอกสาร' },
    { key: 'employee_card',     label: 'บัตรพนักงาน',                              category: 'อุปกรณ์' },
    { key: 'ppe',                label: 'อุปกรณ์ป้องกันภัยส่วนบุคคล (หมวก/เสื้อสะท้อนแสง ฯลฯ)', category: 'อุปกรณ์' },
    { key: 'uniform',           label: 'ชุดยูนิฟอร์ม',                              category: 'อุปกรณ์' },
    { key: 'system_account',    label: 'สร้างบัญชีในระบบ CONNEX',      category: 'สิทธิ์การเข้าระบบ' },
    { key: 'line_link',         label: 'เชื่อมต่อบัญชี LINE เพื่อรับการแจ้งเตือน',    category: 'สิทธิ์การเข้าระบบ' },
    { key: 'site_access',       label: 'สิทธิ์เข้าไซต์งาน/สำนักงาน',                 category: 'สิทธิ์การเข้าระบบ' },
  ]
  return template.map(t => ({ ...t, done: false, done_by: null, done_at: null }))
}

export function defaultClearanceItems(): ChecklistItem[] {
  const template: { key: string; label: string }[] = [
    { key: 'equipment_return',       label: 'คืนอุปกรณ์/PPE ครบถ้วน' },
    { key: 'employee_card_return',   label: 'คืนบัตรพนักงาน' },
    { key: 'expense_clearance',      label: 'เคลียร์ค่าใช้จ่าย/เงินเบิกล่วงหน้าคงค้าง' },
    { key: 'handover',               label: 'ส่งมอบงานให้ผู้สืบทอด/หัวหน้างาน' },
    { key: 'system_access_revoked',  label: 'ยกเลิกสิทธิ์เข้าระบบ CONNEX' },
    { key: 'site_access_revoked',    label: 'ยกเลิกสิทธิ์เข้าไซต์งาน/สำนักงาน' },
  ]
  return template.map(t => ({ ...t, done: false, done_by: null, done_at: null }))
}
