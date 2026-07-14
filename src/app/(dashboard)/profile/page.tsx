'use client'
// src/app/(dashboard)/profile/page.tsx
// Self-service profile: any employee can view their own info and edit
// phone + profile photo here. Everything else (name, position, department,
// role, email) is Admin-only — see /admin/users/[id].

import { useRef, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { User, Loader2, Camera, KeyRound, MessageCircle, FileText, PenLine, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { ROLE_LABEL, formatDateTH, formatDateTime, cn } from '@/utils'
import { SignatureCanvas } from '@/components/signature/SignatureCanvas'

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: 'ร่าง', active: 'ใช้งาน', expired: 'หมดอายุ', terminated: 'ยกเลิก',
}
const CONTRACT_STATUS_COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', active: 'bg-green-100 text-green-700',
  expired: 'bg-amber-100 text-amber-700', terminated: 'bg-red-100 text-red-700',
}

type ProfileUser = {
  id: string
  employee_code: string
  email: string
  first_name_th: string
  last_name_th: string
  position_th: string | null
  department: string | null
  role: string
  hire_date: string
  phone: string | null
  address: string | null
  avatar_url: string | null
  line_user_id: string | null
}

type ProfileData = {
  user: ProfileUser
  contracts: { id: string; contract_no: string; contract_type: string; status: string; start_date: string; position_th: string | null; department: string | null }[]
  certificates: { id: string; cert_no: string; cert_type: string; purpose: string | null; issued_date: string }[]
}

async function fetchProfile(): Promise<ProfileData> {
  const res  = await fetch('/api/profile')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data as ProfileData
}

type SignatureData = { has_signature: boolean; signature_url: string | null; updated_at: string | null }

async function fetchSignature(): Promise<SignatureData> {
  const res  = await fetch('/api/profile/signature')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data as SignatureData
}

async function saveSignature(dataUrl: string): Promise<SignatureData> {
  const res  = await fetch('/api/profile/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data_url: dataUrl }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data as SignatureData
}

export default function ProfilePage() {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: fetchProfile,
  })
  const user         = data?.user
  const contracts     = data?.contracts ?? []
  const certificates   = data?.certificates ?? []

  const phoneValue   = phone   ?? user?.phone   ?? ''
  const addressValue = address ?? user?.address ?? ''

  // Self-service e-signature — set up once here, reused automatically when
  // this person submits a leave request (as requester) or clicks "อนุมัติ"
  // on someone else's (as approver). See /api/profile/signature.
  const [showSigCanvas, setShowSigCanvas] = useState(false)
  const { data: signature, isLoading: sigLoading } = useQuery({
    queryKey: ['my-signature'],
    queryFn: fetchSignature,
  })
  const saveSig = useMutation({
    mutationFn: saveSignature,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-signature'] })
      setShowSigCanvas(false)
      toast.success('บันทึกลายเซ็นแล้ว', 'จะถูกใช้อัตโนมัติทุกครั้งที่ยื่นลาหรืออนุมัติ')
    },
    onError: (e: Error) => toast.error('บันทึกไม่สำเร็จ', e.message),
  })

  // 2026-07-14: saves phone + address together — both now double as the
  // leave form's "เบอร์โทร" / "ติดต่อได้ที่" fields, pulled live from here
  // at PDF-render time (see leave-official-form-template.ts) instead of
  // being typed per leave request.
  const saveContact = async () => {
    setSaving(true)
    try {
      const form = new FormData()
      form.append('phone', phoneValue)
      form.append('address', addressValue)
      const res  = await fetch('/api/profile', { method: 'PATCH', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      toast.success('บันทึกข้อมูลติดต่อแล้ว')
    } catch (e: any) {
      toast.error('บันทึกไม่สำเร็จ', e.message)
    } finally {
      setSaving(false)
    }
  }

  const onPhotoChange = async (file: File | null) => {
    if (!file) return
    setUploadingPhoto(true)
    try {
      const form = new FormData()
      form.append('avatar', file)
      const res  = await fetch('/api/profile', { method: 'PATCH', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      toast.success('เปลี่ยนรูปโปรไฟล์แล้ว')
    } catch (e: any) {
      toast.error('อัปโหลดไม่สำเร็จ', e.message)
    } finally {
      setUploadingPhoto(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (isLoading || !user) return (
    <div className="flex justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )

  return (
    <div className="page-container max-w-2xl space-y-5">
      <div className="flex items-center gap-2">
        <User className="w-5 h-5 text-gray-500" />
        <h1>โปรไฟล์ของฉัน</h1>
      </div>

      {/* Photo + read-only identity */}
      <div className="card card-body flex items-center gap-5">
        <div className="relative shrink-0">
          {user.avatar_url ? (
            <img src={user.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-2xl font-semibold">
              {user.first_name_th.charAt(0)}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPhoto}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-700 text-white flex items-center justify-center hover:bg-blue-800 disabled:opacity-60"
            title="เปลี่ยนรูปโปรไฟล์"
          >
            {uploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
          </button>
          <input
            ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp"
            className="hidden" onChange={e => onPhotoChange(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">{user.first_name_th} {user.last_name_th}</p>
          <p className="text-sm text-gray-500">{user.position_th ?? '—'} {user.department ? `· ${user.department}` : ''}</p>
          <p className="text-xs text-gray-400 mt-0.5">{user.employee_code} · {ROLE_LABEL[user.role as keyof typeof ROLE_LABEL] ?? user.role}</p>
        </div>
      </div>

      {/* Read-only work info */}
      <div className="card card-body space-y-3">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">ข้อมูลที่แก้ไขไม่ได้เอง</h3>
        <p className="text-xs text-gray-400">ต้องการแก้ไขข้อมูลด้านล่างนี้ กรุณาติดต่อ HR หรือ Admin</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-400">อีเมล (ใช้ login)</span><p className="text-gray-900">{user.email}</p></div>
          <div><span className="text-gray-400">วันเริ่มงาน</span><p className="text-gray-900">{formatDateTH(user.hire_date)}</p></div>
          <div><span className="text-gray-400">ตำแหน่ง</span><p className="text-gray-900">{user.position_th ?? '—'}</p></div>
          <div><span className="text-gray-400">แผนก</span><p className="text-gray-900">{user.department ?? '—'}</p></div>
        </div>
      </div>

      {/* Editable */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2">แก้ไขข้อมูลของฉัน</h3>
        <p className="text-xs text-gray-400 -mt-2">
          เบอร์โทรและที่อยู่นี้จะถูกใช้อัตโนมัติในช่อง "ติดต่อได้ที่" / "เบอร์โทร" ของใบลาทุกครั้ง — ไม่ต้องกรอกซ้ำตอนยื่นใบลา
        </p>
        <div>
          <label className="form-label">เบอร์โทร</label>
          <input
            value={phoneValue} onChange={e => setPhone(e.target.value)}
            className="form-input" placeholder="08x-xxx-xxxx"
          />
        </div>
        <div>
          <label className="form-label">ที่อยู่ปัจจุบัน</label>
          <textarea
            value={addressValue} onChange={e => setAddress(e.target.value)}
            rows={2} className="form-input resize-none"
            placeholder="ที่อยู่ที่ติดต่อได้ระหว่างลา"
          />
        </div>
        <button
          onClick={saveContact} disabled={saving}
          className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </div>

      {/* Self-service e-signature */}
      <div className="card card-body space-y-4">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2 flex items-center gap-2">
          <PenLine className="w-4 h-4 text-gray-400" /> ลายเซ็นดิจิทัลของฉัน
        </h3>
        <p className="text-xs text-gray-400">
          ตั้งค่าครั้งเดียว ระบบจะใช้ลายเซ็นนี้อัตโนมัติทุกครั้งที่คุณยื่นใบลา (ในฐานะผู้ขอลา)
          หรือกดอนุมัติใบลาของคนอื่น (ในฐานะผู้อนุมัติ) — ไม่ต้องเซ็นซ้ำทีละเอกสาร
        </p>

        {sigLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
        ) : showSigCanvas ? (
          <SignatureCanvas
            label=""
            height={140}
            onSave={dataUrl => saveSig.mutate(dataUrl)}
            onCancel={() => setShowSigCanvas(false)}
          />
        ) : signature?.has_signature ? (
          <div className="space-y-3">
            <div className="border border-gray-200 rounded-xl p-4 flex items-center justify-center bg-gray-50">
              <img src={signature.signature_url ?? ''} alt="ลายเซ็นของฉัน" className="max-h-16 object-contain" />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {signature.updated_at ? `บันทึกล่าสุด ${formatDateTime(signature.updated_at)}` : ''}
              </p>
              <button
                onClick={() => setShowSigCanvas(true)}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <RefreshCw className="w-3.5 h-3.5" /> เปลี่ยนลายเซ็น
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowSigCanvas(true)}
            className="w-full rounded-lg border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 py-8 text-sm"
          >
            <PenLine className="w-4 h-4 mx-auto mb-1" />
            คลิกเพื่อตั้งค่าลายเซ็นดิจิทัล
          </button>
        )}
      </div>

      {/* Read-only: own contracts + certificates */}
      <div className="card card-body space-y-3">
        <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-2 flex items-center gap-2">
          <FileText className="w-4 h-4 text-gray-400" /> สัญญาจ้างและใบรับรองของฉัน
        </h3>
        {contracts.length === 0 && certificates.length === 0 ? (
          <p className="text-xs text-gray-400">ยังไม่มีเอกสาร</p>
        ) : (
          <div className="space-y-2 text-sm">
            {contracts.map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-gray-700">{c.contract_no} — {c.position_th ?? '—'} {c.department ? `(${c.department})` : ''}</span>
                <span className={cn('badge', CONTRACT_STATUS_COLOR[c.status])}>{CONTRACT_STATUS_LABEL[c.status] ?? c.status}</span>
              </div>
            ))}
            {certificates.map(c => (
              <div key={c.id} className="flex items-center justify-between">
                <span className="text-gray-700">{c.cert_no} — {c.purpose ?? c.cert_type}</span>
                <span className="text-xs text-gray-400">{formatDateTH(c.issued_date)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400">ต้องการสำเนาเอกสาร กรุณาติดต่อ HR</p>
      </div>

      {/* Quick links */}
      <div className="card card-body space-y-2">
        <Link href="/change-password" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <KeyRound className="w-4 h-4" /> เปลี่ยนรหัสผ่าน
        </Link>
        <Link href="/line/link" className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
          <MessageCircle className="w-4 h-4" /> {user.line_user_id ? 'จัดการการเชื่อมต่อ LINE' : 'เชื่อมต่อ LINE'}
        </Link>
      </div>
    </div>
  )
}
