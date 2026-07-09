'use client'
// src/app/(dashboard)/hr/announcements/page.tsx
// HR/Admin: create and view company announcements (in-app + email + LINE).

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { Plus, Megaphone, Loader2, Image as ImageIcon } from 'lucide-react'
import { cn, formatDateTH } from '@/utils'

type Category = 'general' | 'policy' | 'event' | 'emergency'

const CATEGORY_LABEL: Record<Category, string> = {
  general:   'ทั่วไป',
  policy:    'นโยบาย',
  event:     'กิจกรรม',
  emergency: 'ฉุกเฉิน',
}
const CATEGORY_COLOR: Record<Category, string> = {
  general:   'bg-gray-100 text-gray-700',
  policy:    'bg-blue-100 text-blue-700',
  event:     'bg-purple-100 text-purple-700',
  emergency: 'bg-red-100 text-red-700',
}

type Company = { id: string; code: string; name_th: string }

async function fetchAnnouncements() {
  const res  = await fetch('/api/hr/announcements')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data?.announcements ?? []
}

async function fetchCompanies() {
  const res  = await fetch('/api/companies')
  const json = await res.json()
  if (!res.ok) throw new Error(json.error)
  return json.data?.companies ?? []
}

export default function HrAnnouncementsPage() {
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [imageFile, setImageFile]   = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['hr-announcements'],
    queryFn:  fetchAnnouncements,
  })

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn:  fetchCompanies,
  })

  const resetForm = () => {
    setTitle(''); setBody(''); setCategory('general'); setCompanyIds([])
    setImageFile(null); setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const create = useMutation({
    mutationFn: async () => {
      if (!imageFile) throw new Error('กรุณาแนบรูปภาพประกอบประกาศ')
      const form = new FormData()
      form.append('data', JSON.stringify({ title, body, category, company_ids: companyIds }))
      form.append('image', imageFile)
      const res  = await fetch('/api/hr/announcements', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      return json.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-announcements'] })
      toast.success('เผยแพร่ประกาศสำเร็จ')
      setShowForm(false)
      resetForm()
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const onImageChange = (file: File | null) => {
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : null)
  }

  const toggleCompany = (id: string) => {
    setCompanyIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const canSubmit = title.trim() && body.trim() && companyIds.length > 0 && imageFile

  return (
    <div className="page-container space-y-5">

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-gray-500" />
          <h1>ประกาศ / ข่าวสาร</h1>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
        >
          <Plus className="w-4 h-4" />
          สร้างประกาศ
        </button>
      </div>

      {showForm && (
        <div className="card card-body space-y-4">
          <h3 className="text-sm font-medium text-gray-700">สร้างประกาศใหม่</h3>

          <div>
            <label className="form-label">หัวข้อ *</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              className="form-input" placeholder="เช่น ปิดทำการวันหยุดพิเศษ"
            />
          </div>

          <div>
            <label className="form-label">เนื้อหา *</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              rows={4} className="form-input" placeholder="รายละเอียดประกาศ"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label">หมวดหมู่</label>
              <select
                value={category} onChange={e => setCategory(e.target.value as Category)}
                className="form-input"
              >
                {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label">บริษัทเป้าหมาย * (เลือก 1-2 บริษัท)</label>
              <div className="flex gap-4 pt-2">
                {(companies as Company[]).map(c => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={companyIds.includes(c.id)}
                      onChange={() => toggleCompany(c.id)}
                    />
                    {c.name_th}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="form-label">รูปภาพประกอบ * (สูงสุด 5MB)</label>
            <input
              ref={fileInputRef}
              type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={e => onImageChange(e.target.files?.[0] ?? null)}
              className="form-input"
            />
            {imagePreview && (
              <img src={imagePreview} alt="ตัวอย่างรูปภาพ" className="mt-3 rounded-lg max-h-48 object-cover border border-gray-200" />
            )}
            {!imagePreview && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                <ImageIcon className="w-4 h-4" /> ยังไม่ได้เลือกรูปภาพ
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setShowForm(false); resetForm() }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >ยกเลิก</button>
            <button
              onClick={() => create.mutate()}
              disabled={!canSubmit || create.isPending}
              className="rounded-lg bg-blue-700 text-white px-4 py-2 text-sm font-medium hover:bg-blue-800 disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}
              เผยแพร่ประกาศ
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {(announcements as any[]).map((a: any) => (
            <div key={a.id} className="card card-body flex gap-4">
              <img src={a.image_url} alt={a.title} className="w-24 h-24 rounded-lg object-cover shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('badge', CATEGORY_COLOR[a.category as Category])}>
                    {CATEGORY_LABEL[a.category as Category]}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateTH(a.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-1">{a.title}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{a.body}</p>
              </div>
            </div>
          ))}
          {!announcements.length && (
            <div className="card card-body text-center text-gray-400 py-12 text-sm">
              ยังไม่มีประกาศ
            </div>
          )}
        </div>
      )}
    </div>
  )
}
