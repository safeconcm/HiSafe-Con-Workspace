'use client'
// src/app/(dashboard)/hr/announcements/page.tsx
// HR/Admin: create and view company announcements (in-app + email + LINE).

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { Plus, Megaphone, Loader2, ImageIcon, FileText, AlertTriangle } from 'lucide-react'
import { cn, formatDateTH } from '@/utils'
import { createClient } from '@/lib/supabase/client'

type Category = 'general' | 'policy' | 'event' | 'emergency'
type Tab = 'all' | 'must_ack'

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

// Accepted on the file picker — images plus common office document types.
// Kept in sync with the ALLOWED_MIME list in
// /api/hr/announcements/upload-url/route.ts and the "announcements" storage
// bucket's allowed_mime_types.
const ACCEPT_ATTR = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  '.doc', '.docx', '.xls', '.xlsx',
].join(',')

const isImageType = (type: string | null | undefined) => !!type && type.startsWith('image/')

// Client-side image compression before upload — user feedback 2026-07-12
// ("ถ้าไฟล์ที่แนบในประกาศมันใหญ่ ระบบสามารถบังคับบีบอัดได้ไหม"). Only
// applied to images: resizes anything wider/taller than 1920px down to fit,
// and re-encodes JPEG/WEBP at 80% quality. PNG is resized but stays PNG
// (lossless) since we can't tell if it needs its alpha channel. GIFs are
// left untouched — re-encoding through a canvas would flatten an animated
// GIF to a single frame. PDF/Word/Excel aren't touched at all: they're
// already-compressed container formats, so re-compressing them client-side
// would need a much heavier tool for very little size benefit.
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!isImageType(file.type) || file.type === 'image/gif') return file

  const MAX_DIM = 1920
  const QUALITY = 0.8

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file // unsupported/corrupt image — fall back to the original

  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)

  const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, outType, QUALITY))
  if (!blob || blob.size >= file.size) return file // compression didn't actually help — keep original

  const newName = outType === 'image/jpeg' && !/\.jpe?g$/i.test(file.name)
    ? file.name.replace(/\.[^.]+$/, '') + '.jpg'
    : file.name

  return new File([blob], newName, { type: outType })
}

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

type Company = { id: string; code: string; name_th: string }

// A response that isn't valid JSON (e.g. a plain-text 413 "Request Entity
// Too Large" from a platform-level body-size limit) used to crash the whole
// mutation with a cryptic "Unexpected token 'R'..." error. Parse
// defensively everywhere so a bad response just shows a readable message.
async function safeJson(res: Response): Promise<any> {
  try { return await res.json() } catch { return null }
}

async function fetchAnnouncements() {
  const res  = await fetch('/api/hr/announcements')
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `โหลดประกาศไม่สำเร็จ (${res.status})`)
  return json?.data?.announcements ?? []
}

async function fetchCompanies() {
  const res  = await fetch('/api/companies')
  const json = await safeJson(res)
  if (!res.ok) throw new Error(json?.error || `โหลดรายชื่อบริษัทไม่สำเร็จ (${res.status})`)
  return json?.data?.companies ?? []
}

// Uploads the attachment straight to Supabase Storage via a signed upload
// URL, bypassing our own API route entirely for the file bytes — see
// /api/hr/announcements/upload-url/route.ts for why (Vercel's serverless
// function body-size cap was silently breaking uploads near/over ~4.5MB).
async function uploadAttachment(file: File) {
  const urlRes = await fetch('/api/hr/announcements/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, content_type: file.type, size: file.size }),
  })
  const urlJson = await safeJson(urlRes)
  if (!urlRes.ok) throw new Error(urlJson?.error || `สร้างลิงก์อัปโหลดไม่สำเร็จ (${urlRes.status})`)

  const { signed_url, token, path, public_url } = urlJson.data
  const supabase = createClient()
  const { error: upErr } = await supabase.storage
    .from('announcements')
    .uploadToSignedUrl(path, token, file)
  if (upErr) throw new Error(`อัปโหลดไฟล์ไม่สำเร็จ: ${upErr.message}`)

  return { url: public_url as string, type: file.type, name: file.name }
}

// Small, consistent attachment preview used both in the create-form preview
// and each list row — fixed thumbnail size for images (per user feedback
// 2026-07-12: the old unconstrained preview rendered huge and "รำคาญ"),
// file-type chip for anything else.
function AttachmentThumb({ url, type, name, className }: { url: string; type: string | null; name?: string | null; className?: string }) {
  if (isImageType(type)) {
    return <img src={url} alt={name ?? ''} className={cn('rounded-lg object-cover border border-gray-200', className)} />
  }
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      title={name ?? 'ไฟล์แนบ'}
      className={cn('rounded-lg border border-gray-200 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-500 hover:bg-gray-100 transition-colors p-2', className)}
    >
      <FileText className="w-6 h-6" />
      <span className="text-[10px] leading-tight text-center line-clamp-2 break-all">{name ?? 'ไฟล์แนบ'}</span>
    </a>
  )
}

export default function HrAnnouncementsPage() {
  const [tab, setTab]           = useState<Tab>('all')
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle]       = useState('')
  const [body, setBody]         = useState('')
  const [category, setCategory] = useState<Category>('general')
  const [companyIds, setCompanyIds] = useState<string[]>([])
  const [requireAck, setRequireAck] = useState(false)
  const [attachFile, setAttachFile]       = useState<File | null>(null)
  const [attachPreview, setAttachPreview] = useState<string | null>(null)
  const [compressing, setCompressing]     = useState(false)
  const [sizeInfo, setSizeInfo] = useState<{ before: number; after: number } | null>(null)
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
    setTitle(''); setBody(''); setCategory('general'); setCompanyIds([]); setRequireAck(false)
    setAttachFile(null); setAttachPreview(null); setSizeInfo(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const create = useMutation({
    mutationFn: async () => {
      // Attachment is optional — a text-only announcement is fine (user
      // feedback 2026-07-12).
      const attachment = attachFile ? await uploadAttachment(attachFile) : null

      const res = await fetch('/api/hr/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body, category, company_ids: companyIds, require_ack: requireAck,
          attachment_url:  attachment?.url  ?? null,
          attachment_type: attachment?.type ?? null,
          attachment_name: attachment?.name ?? null,
        }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error || `เกิดข้อผิดพลาด (${res.status})`)
      return json?.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-announcements'] })
      toast.success('เผยแพร่ประกาศสำเร็จ')
      setShowForm(false)
      resetForm()
    },
    onError: (e: Error) => toast.error('เกิดข้อผิดพลาด', e.message),
  })

  const onFileChange = async (file: File | null) => {
    if (!file) {
      setAttachFile(null); setAttachPreview(null); setSizeInfo(null)
      return
    }
    setCompressing(true)
    try {
      const processed = await compressImageIfNeeded(file)
      setAttachFile(processed)
      setAttachPreview(URL.createObjectURL(processed))
      setSizeInfo(processed.size < file.size ? { before: file.size, after: processed.size } : null)
    } finally {
      setCompressing(false)
    }
  }

  const toggleCompany = (id: string) => {
    setCompanyIds(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  // Attachment is optional now — only title/body/target companies are required.
  const canSubmit = title.trim() && body.trim() && companyIds.length > 0

  const mustAckCount = (announcements as any[]).filter(a => a.require_ack).length
  const filtered = (announcements as any[]).filter(a => tab === 'all' || a.require_ack)

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

      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'all',      label: 'ทั้งหมด' },
          { key: 'must_ack', label: 'ต้องรับทราบ', count: mustAckCount },
        ] as { key: Tab; label: string; count?: number }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key
                ? 'border-blue-700 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {t.label}
            {!!t.count && (
              <span className={cn(
                'text-[11px] rounded-full px-1.5 py-0.5 leading-none',
                tab === t.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
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

          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <input
              type="checkbox" className="mt-0.5"
              checked={requireAck} onChange={e => setRequireAck(e.target.checked)}
            />
            <span>
              <span className="font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" /> บังคับให้ต้องอ่านและกดรับทราบ
              </span>
              <span className="block text-xs text-amber-700 mt-0.5">
                ประกาศนี้จะเด้งเป็นกล่องข้อความบังคับให้พนักงานอ่านและกดปุ่ม &quot;รับทราบแล้ว&quot; ก่อนใช้งานหน้าอื่นได้ — ใช้เฉพาะเรื่องสำคัญจริงๆ
              </span>
            </span>
          </label>

          <div>
            <label className="form-label">ไฟล์แนบ (ไม่บังคับ) — รูปภาพ, PDF, Word, Excel (สูงสุด 15MB)</label>
            <input
              ref={fileInputRef}
              type="file" accept={ACCEPT_ATTR}
              onChange={e => onFileChange(e.target.files?.[0] ?? null)}
              disabled={compressing}
              className="form-input"
            />
            {compressing && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> กำลังบีบอัดรูปภาพ...
              </div>
            )}
            {!compressing && attachPreview && attachFile && (
              <div className="mt-3">
                <AttachmentThumb
                  url={attachPreview} type={attachFile.type} name={attachFile.name}
                  className="w-32 h-32"
                />
                {sizeInfo && (
                  <p className="mt-1.5 text-xs text-emerald-600">
                    บีบอัดรูปจาก {formatBytes(sizeInfo.before)} เหลือ {formatBytes(sizeInfo.after)}
                  </p>
                )}
              </div>
            )}
            {!compressing && !attachPreview && (
              <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
                <ImageIcon className="w-4 h-4" /> ยังไม่ได้แนบไฟล์ (ไม่แนบก็เผยแพร่ได้)
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
              disabled={!canSubmit || create.isPending || compressing}
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
          {filtered.map((a: any) => (
            <div key={a.id} className="card card-body flex gap-4">
              {a.attachment_url && (
                <AttachmentThumb
                  url={a.attachment_url} type={a.attachment_type} name={a.attachment_name}
                  className="w-16 h-16 shrink-0"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn('badge', CATEGORY_COLOR[a.category as Category])}>
                    {CATEGORY_LABEL[a.category as Category]}
                  </span>
                  {a.require_ack && (
                    <span className="badge bg-amber-100 text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> ต้องรับทราบ
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDateTH(a.created_at)}</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-1">{a.title}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{a.body}</p>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div className="card card-body text-center text-gray-400 py-12 text-sm">
              {tab === 'must_ack' ? 'ไม่มีประกาศที่ต้องรับทราบ' : 'ยังไม่มีประกาศ'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
