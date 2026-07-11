'use client'
// src/app/(dashboard)/admin/settings/page.tsx
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { Settings, Save, Eye, EyeOff, Loader2 } from 'lucide-react'
import Image from 'next/image'

async function fetchSettings() {
  const res  = await fetch('/api/admin/settings')
  const json = await res.json()
  return json.data
}

async function saveSettings(body: any) {
  const res  = await fetch('/api/admin/settings', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data
}

function MaskInput({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="form-input pr-10"
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function AdminSettingsPage() {
  const qc = useQueryClient()
  const { data: company, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: fetchSettings })

  const [letterhead, setLetterhead] = useState({
    legal_name_th: '', address_th: '', tax_id: '', phone: '', contact_email: '',
  })
  const [smtp, setSmtp] = useState({
    smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '',
    smtp_from: '', smtp_from_name: '',
  })
  const [line, setLine] = useState({
    line_oa_channel_id: '', line_oa_channel_secret: '', line_oa_access_token: '',
  })

  useEffect(() => {
    if (!company) return
    setLetterhead({
      legal_name_th: company.legal_name_th ?? '',
      address_th:    company.address_th    ?? '',
      tax_id:        company.tax_id        ?? '',
      phone:         company.phone         ?? '',
      contact_email: company.contact_email ?? '',
    })
    setSmtp({
      smtp_host:      company.smtp_host      ?? '',
      smtp_port:      String(company.smtp_port ?? 587),
      smtp_user:      company.smtp_user      ?? '',
      smtp_password:  company.smtp_password  ?? '',
      smtp_from:      company.smtp_from      ?? '',
      smtp_from_name: company.smtp_from_name ?? '',
    })
    setLine({
      line_oa_channel_id:     company.line_oa_channel_id     ?? '',
      line_oa_channel_secret: company.line_oa_channel_secret ?? '',
      line_oa_access_token:   company.line_oa_access_token   ?? '',
    })
  }, [company])

  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      toast.success('บันทึกการตั้งค่าแล้ว')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  const handleSave = () => {
    save.mutate({
      ...letterhead,
      ...smtp,
      smtp_port: parseInt(smtp.smtp_port),
      ...line,
    })
  }

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="page-container max-w-2xl space-y-6">

      <div className="flex items-center gap-3">
        <Settings className="w-5 h-5 text-gray-500" />
        <h1>ตั้งค่าระบบ</h1>
      </div>

      {/* Company Info */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลบริษัท</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
            {company?.code === 'HIGHCON' ? (
              <Image src="/logos/highcon.png" alt="Highcon" width={64} height={64} className="object-contain" />
            ) : (
              <Image src="/logos/safecon.png" alt="Safecon" width={64} height={64} className="object-contain" />
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">{company?.name_th}</p>
            <p className="text-sm text-gray-500">{company?.name_en}</p>
            <p className="text-xs text-gray-400 mt-0.5">รหัสบริษัท: {company?.code}</p>
          </div>
        </div>

        {/* Letterhead — shown on every PDF document (Timesheet, ใบลา,
            หนังสือรับรอง, สัญญาจ้าง, สรุปข้อมูลพนักงาน) via
            src/lib/pdf/company-letterhead.ts. See conversation 2026-07-11. */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          <p className="text-xs font-medium text-gray-500">ข้อมูลหัวกระดาษเอกสาร (PDF)</p>
          <div>
            <label className="form-label">ชื่อบริษัทเต็ม (ที่ใช้ในเอกสาร)</label>
            <input value={letterhead.legal_name_th}
              onChange={e => setLetterhead(l => ({ ...l, legal_name_th: e.target.value }))}
              className="form-input" placeholder="บริษัท เซฟคอน จำกัด" />
          </div>
          <div>
            <label className="form-label">ที่อยู่บริษัท</label>
            <input value={letterhead.address_th}
              onChange={e => setLetterhead(l => ({ ...l, address_th: e.target.value }))}
              className="form-input" placeholder="82/22 หมู่ที่ 1 ตำบลบางเลน อำเภอบางใหญ่ จังหวัดนนทบุรี 11140" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">เลขประจำตัวผู้เสียภาษี</label>
              <input value={letterhead.tax_id}
                onChange={e => setLetterhead(l => ({ ...l, tax_id: e.target.value }))}
                className="form-input" placeholder="0125567035461" />
            </div>
            <div>
              <label className="form-label">เบอร์โทร</label>
              <input value={letterhead.phone}
                onChange={e => setLetterhead(l => ({ ...l, phone: e.target.value }))}
                className="form-input" placeholder="081-665-6521" />
            </div>
          </div>
          <div>
            <label className="form-label">อีเมลติดต่อ</label>
            <input value={letterhead.contact_email}
              onChange={e => setLetterhead(l => ({ ...l, contact_email: e.target.value }))}
              className="form-input" placeholder="Safecon.sc@gmail.com" />
          </div>
        </div>
      </div>

      {/* SMTP Settings */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">
          การตั้งค่า Email (SMTP)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="form-label">SMTP Host</label>
            <input value={smtp.smtp_host} onChange={e => setSmtp(s => ({ ...s, smtp_host: e.target.value }))}
              className="form-input" placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="form-label">SMTP Port</label>
            <input value={smtp.smtp_port} onChange={e => setSmtp(s => ({ ...s, smtp_port: e.target.value }))}
              className="form-input" placeholder="587" type="number" />
          </div>
          <div>
            <label className="form-label">SMTP Username</label>
            <input value={smtp.smtp_user} onChange={e => setSmtp(s => ({ ...s, smtp_user: e.target.value }))}
              className="form-input" placeholder="noreply@company.com" />
          </div>
          <MaskInput label="SMTP Password" value={smtp.smtp_password}
            onChange={v => setSmtp(s => ({ ...s, smtp_password: v }))} placeholder="••••••••" />
          <div>
            <label className="form-label">From Email</label>
            <input value={smtp.smtp_from} onChange={e => setSmtp(s => ({ ...s, smtp_from: e.target.value }))}
              className="form-input" placeholder="noreply@company.com" />
          </div>
          <div>
            <label className="form-label">From Name</label>
            <input value={smtp.smtp_from_name} onChange={e => setSmtp(s => ({ ...s, smtp_from_name: e.target.value }))}
              className="form-input" placeholder="HiSafe-CON WorkSpace" />
          </div>
        </div>
      </div>

      {/* LINE OA Settings */}
      <div className="card card-body space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <h3 className="text-sm font-medium text-gray-700">LINE OA (Messaging API)</h3>
          <span className="badge bg-green-100 text-green-700">ใช้ร่วมกันทั้ง 2 บริษัท</span>
        </div>
        <p className="text-xs text-gray-500">
          LINE OA ใช้ Channel เดียวสำหรับ Safecon และ Highcon
          พนักงานต้อง Link LINE Account ผ่านหน้าโปรไฟล์ก่อนจึงจะรับแจ้งเตือนได้
        </p>
        <div className="space-y-4">
          <div>
            <label className="form-label">Channel ID</label>
            <input value={line.line_oa_channel_id}
              onChange={e => setLine(l => ({ ...l, line_oa_channel_id: e.target.value }))}
              className="form-input font-mono" placeholder="1234567890" />
          </div>
          <MaskInput label="Channel Secret" value={line.line_oa_channel_secret}
            onChange={v => setLine(l => ({ ...l, line_oa_channel_secret: v }))} placeholder="abcdef..." />
          <MaskInput label="Channel Access Token" value={line.line_oa_access_token}
            onChange={v => setLine(l => ({ ...l, line_oa_access_token: v }))} placeholder="eyJ..." />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={save.isPending}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-700 text-white px-4 py-3 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
      >
        {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        บันทึกการตั้งค่า
      </button>
    </div>
  )
}
