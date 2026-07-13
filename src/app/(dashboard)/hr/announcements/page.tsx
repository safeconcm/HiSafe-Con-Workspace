'use client'
// src/app/(dashboard)/hr/announcements/page.tsx
// HR/Admin: create and view company announcements (in-app + email + LINE).

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/Toaster'
import { Plus, Megaphone, Loader2, ImageIcon, FileText, AlertTriangle, Trash2, X } from 'lucide-react'
import { cn, formatDateTH, stripAnnouncementMarkdown } from '@/utils'
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

// Which attachment MIME types the "ดึงข้อความจากไฟล์" button supports.
// Scoped to .docx only for this ship — mammoth (docx→text) is a mature,
// pure-JS library safe to run in Vercel's serverless functions. PDF
// extraction (pdf-parse or similar) was deliberately left out of this round
// specifically to keep the build/deploy risk on this change as low as
// possible per the pre-implementation code review — can be added as a
// follow-up once this path is confirmed stable in production. Legacy .doc
// (application/msword) is also excluded — mammoth doesn't parse the old
// binary format, only .docx.
const EXTRACTABLE_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

// Sub-category "patterns" (2026-07-13, per user request) — a pure UI
// convenience layer, NOT stored in the database. Picking one just inserts a
// ready-made opening/closing line into the existing เนื้อหา textarea (still
// fully editable) and pre-selects the closest matching `category` enum
// value. Deliberately does not add any new DB column: the category enum
// (general/policy/event/emergency) is unchanged, and these patterns are
// only ever a starting point for the same title/body fields that already
// exist — see the "จัดการอัปเดต" consultation thread for why this scope was
// chosen (skips the department/location targeting and the confidential
// per-person hidden-document ideas from the original spec — those were
// explicitly declined as separate, higher-risk projects).
type Pattern = { key: string; group: 'ประกาศ' | 'ประชาสัมพันธ์'; label: string; category: Category; opening: string; closing: string }
const PATTERNS: Pattern[] = [
  { key: 'holiday',    group: 'ประกาศ', label: 'วันหยุด/เวลาทำการ', category: 'general',
    opening: 'ประกาศเรื่อง วันหยุดเนื่องในวัน... (หรือ แจ้งการปรับเปลี่ยนเวลาทำการช่วง...)\n\n',
    closing: '\n\nจึงเรียนมาเพื่อทราบและวางแผนการดำเนินงานร่วมกัน' },
  { key: 'policy',     group: 'ประกาศ', label: 'นโยบาย/ข้อบังคับ/ระเบียบการทำงาน', category: 'policy',
    opening: 'ประกาศข้อบังคับเรื่อง... (หรือ นโยบายการทำงานเกี่ยวกับการ...)\n\n',
    closing: '\n\nจึงเรียนมาเพื่อทราบและถือปฏิบัติอย่างเคร่งครัด ตั้งแต่วันที่... เป็นต้นไป' },
  { key: 'appoint',    group: 'ประกาศ', label: 'การแต่งตั้ง/โยกย้าย/ปรับโครงสร้างองค์กร', category: 'general',
    opening: 'ประกาศคำสั่งแต่งตั้งบุคลากรตำแหน่ง... (หรือ คำสั่งปรับโครงสร้างส่วนงาน...)\n\n',
    closing: '\n\nขอให้ทุกท่านร่วมแสดงความยินดีและให้ความร่วมมือในการปฏิบัติงานกับเพื่อนร่วมงานใหม่' },
  { key: 'emergency',  group: 'ประกาศ', label: 'มาตรการฉุกเฉิน/ความปลอดภัย', category: 'emergency',
    opening: 'ประกาศด่วนที่สุด! มาตรการรับมือกรณี [ภัยพิบัติ/โรคระบาด/เหตุฉุกเฉิน]...\n\n',
    closing: '\n\nโปรดติดตามสถานการณ์อย่างใกล้ชิดและปฏิบัติตามคู่มือความปลอดภัยอย่างเคร่งครัด' },
  { key: 'termination', group: 'ประกาศ', label: 'การพ้นสภาพของพนักงาน', category: 'general',
    opening: 'ประกาศแจ้งเรื่อง พนักงานพ้นสภาพการเป็นบุคลากร เรียน ทุกท่าน...\n\n',
    closing: '\n\nการกระทำใดๆ ของบุคคลดังกล่าวหลังจากนี้ ไม่มีส่วนเกี่ยวข้องกับบริษัทฯ ทั้งสิ้น' },
  { key: 'event',      group: 'ประชาสัมพันธ์', label: 'กิจกรรมภายใน/งานสังสรรค์/CSR', category: 'event',
    opening: 'ขอเชิญชวนเพื่อนๆ ร่วมสนุกในงาน... (หรือ เคลียร์คิวให้พร้อม! กับกิจกรรม...)\n\n',
    closing: '\n\nแล้วพบกันในงานนะครับ/ค่ะ! กดลงชื่อร่วมงานได้ที่ลิงก์ด้านล่าง' },
  { key: 'benefit',    group: 'ประชาสัมพันธ์', label: 'สิทธิประโยชน์/สวัสดิการพนักงาน/ประกันกลุ่ม', category: 'general',
    opening: 'ข่าวดี! แจ้งสิทธิประโยชน์เพิ่มเติมเรื่อง... (หรือ เปิดลงทะเบียนรับสิทธิ์...)\n\n',
    closing: '\n\nสามารถตรวจสอบเงื่อนไขการใช้งานและการเคลมสิทธิ์ของคุณได้ที่คู่มือแนบ' },
  { key: 'celebrate',  group: 'ประชาสัมพันธ์', label: 'ความสำเร็จ/เรื่องยินดี/วันเกิด', category: 'event',
    opening: 'ร่วมยินดีกับความสำเร็จ!... (หรือ สุขสันต์วันเกิดแด่พนักงานที่เกิดในเดือน...)\n\n',
    closing: '\n\nขอบคุณทุกแรงกายแรงใจที่เป็นส่วนหนึ่งของความสำเร็จและการเติบโตนี้' },
  { key: 'knowledge',  group: 'ประชาสัมพันธ์', label: 'สาระน่ารู้/บทความ/เทรนด์ความรู้', category: 'general',
    opening: 'สาระความรู้คู่คนทำงานวันนี้ เสนอเรื่อง... (หรือ รู้หรือไม่? เทรนด์ปีนี้...)\n\n',
    closing: '\n\nติดตามสาระดีๆ แบบนี้ได้ใหม่ในอัปเดตถัดไป' },
  { key: 'pr',         group: 'ประชาสัมพันธ์', label: 'ประชาสัมพันธ์ภายนอก/ข่าวสารแบรนด์', category: 'general',
    opening: 'แจ้งข่าวสารประชาสัมพันธ์: แบรนด์ของเราได้ทำการเปิดตัว... (หรือ ข่าวอัปเดตสู่สาธารณะ...)\n\n',
    closing: '\n\nช่วยกันแชร์และร่วมสนับสนุนแบรนด์ของเราได้ตามช่องทางที่ระบุ' },
  { key: 'market',     group: 'ประชาสัมพันธ์', label: 'ประกาศซื้อ-ขาย/ของหาย/พื้นที่ฝากร้าน', category: 'general',
    opening: 'พื้นที่ฝากข่าว: พบสิ่งของสูญหายบริเวณ... (หรือ เปิดตลาดชาวออฟฟิศ:...)\n\n',
    closing: '\n\nหากใครเป็นเจ้าของหรือสนใจ สามารถติดต่อได้ที่เบอร์/ไลน์ที่ระบุไว้' },
]

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

  // Sub-category pattern picker (2026-07-13) — see PATTERNS above.
  const [patternKey, setPatternKey] = useState('')

  // Extract-text-from-attachment (2026-07-13, per user request "ดึงข้อมูล
  // จากไฟล์แนบมาจัดเรียงในกล่องข้อความก่อนกดส่ง"). `uploadedAttachment`
  // caches the Storage upload so clicking "ดึงข้อความ" doesn't force a
  // second upload of the same file when the form is submitted afterwards —
  // both the extract button and handleSubmit check this cache first.
  const [uploadedAttachment, setUploadedAttachment] = useState<{ file: File; url: string; type: string; name: string } | null>(null)
  const [extracting, setExtracting] = useState(false)

  // Checkbox multi-select + delete-confirm modal (2026-07-13, per user
  // request for bulk delete). `pendingDelete` holds the id(s) awaiting
  // confirmation — null when the modal is closed.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<{ ids: string[]; titles: string[] } | null>(null)
  const [retractForAll, setRetractForAll] = useState(false)

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
    setPatternKey(''); setUploadedAttachment(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Applies a pattern's opening/closing text into the body box and
  // pre-selects the matching category. Never fires silently over content
  // the admin already typed — same confirm() pattern already used
  // elsewhere in this app (e.g. the employee-side hide button).
  const applyPattern = (key: string) => {
    if (!key) { setPatternKey(''); return }
    const p = PATTERNS.find(x => x.key === key)
    if (!p) return
    if (body.trim() && !confirm('แทนที่เนื้อหาปัจจุบันในกล่องข้อความด้วยรูปแบบนี้?')) return
    setPatternKey(key)
    setCategory(p.category)
    setBody(`${p.opening}[รายละเอียด...]${p.closing}`)
  }

  const create = useMutation({
    mutationFn: async () => {
      // Attachment is optional — a text-only announcement is fine (user
      // feedback 2026-07-12). Reuse the cached upload from "ดึงข้อความจาก
      // ไฟล์" if the admin already used it for this exact file, instead of
      // uploading the same file to Storage a second time.
      const attachment = uploadedAttachment && uploadedAttachment.file === attachFile
        ? { url: uploadedAttachment.url, type: uploadedAttachment.type, name: uploadedAttachment.name }
        : attachFile ? await uploadAttachment(attachFile) : null

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

  // Default = hide from the acting admin's own list only (does not touch
  // deleted_at, employees/other admins unaffected). retractForAll=true
  // also sets deleted_at — a real, global retraction. See the route's own
  // comment for the full reasoning (2026-07-13 revision). Does not touch
  // each user's already-received in-app/email/LINE notification history
  // either way.
  const removeAnnouncement = useMutation({
    mutationFn: async ({ id, retractForAll }: { id: string; retractForAll: boolean }) => {
      const res = await fetch(`/api/hr/announcements/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retract_for_all: retractForAll }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error || `ลบไม่สำเร็จ (${res.status})`)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-announcements'] })
      setSelectedIds(new Set())
      toast.success(vars.retractForAll ? 'ถอนประกาศแล้ว (พนักงานทุกคนไม่เห็นแล้ว)' : 'ลบออกจากรายการของคุณแล้ว')
    },
    onError: (e: Error) => toast.error('ลบไม่สำเร็จ', e.message),
  })

  // Bulk version of the same mutation — powers the checkbox multi-select.
  const bulkRemoveAnnouncements = useMutation({
    mutationFn: async ({ ids, retractForAll }: { ids: string[]; retractForAll: boolean }) => {
      const res = await fetch('/api/hr/announcements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, retract_for_all: retractForAll }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error || `ลบไม่สำเร็จ (${res.status})`)
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hr-announcements'] })
      setSelectedIds(new Set())
      toast.success(vars.retractForAll
        ? `ถอนประกาศแล้ว ${vars.ids.length} รายการ (พนักงานทุกคนไม่เห็นแล้ว)`
        : `ลบออกจากรายการของคุณแล้ว ${vars.ids.length} รายการ`)
    },
    onError: (e: Error) => toast.error('ลบไม่สำเร็จ', e.message),
  })

  const onFileChange = async (file: File | null) => {
    // A new/removed file invalidates any cached upload from a previous
    // "ดึงข้อความจากไฟล์" click — otherwise submit could silently attach the
    // OLD file's already-uploaded URL instead of the newly picked file.
    setUploadedAttachment(null)
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

  // Extract-text-from-attachment: uploads the file (reusing the cache if
  // already uploaded) then asks the server to pull its text content, which
  // lands in the เนื้อหา box for the admin to review/edit — never sent
  // automatically. .docx extracts reliably; PDF only works if it's a real
  // text PDF, not a scanned image (best-effort, per user approval "ต้องตรวจ
  // อยู่ก่อนกดส่ง").
  const extractText = async () => {
    if (!attachFile) return
    setExtracting(true)
    try {
      let uploaded = uploadedAttachment && uploadedAttachment.file === attachFile ? uploadedAttachment : null
      if (!uploaded) {
        const att = await uploadAttachment(attachFile)
        uploaded = { file: attachFile, ...att }
        setUploadedAttachment(uploaded)
      }
      const res = await fetch('/api/hr/announcements/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: uploaded.url, type: uploaded.type }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json?.error || `ดึงข้อความไม่สำเร็จ (${res.status})`)
      const text = String(json?.data?.text ?? '').trim()
      if (!text) {
        toast.error('ไม่พบข้อความในไฟล์นี้', 'ไฟล์อาจเป็น PDF ที่สแกนจากกระดาษ (รูปภาพ) ลองพิมพ์เองแทน')
        return
      }
      setBody(prev => prev.trim() ? `${prev}\n\n---\n${text}` : text)
      toast.success('ดึงข้อความจากไฟล์แล้ว', 'กรุณาตรวจสอบและแก้ไขเนื้อหาก่อนเผยแพร่')
    } catch (e) {
      toast.error('ดึงข้อความไม่สำเร็จ', e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setExtracting(false)
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
          <h1>อัปเดต</h1>
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
            <label className="form-label">รูปแบบสำเร็จรูป (ไม่บังคับ)</label>
            <select
              value={patternKey}
              onChange={e => applyPattern(e.target.value)}
              className="form-input"
            >
              <option value="">-- เลือกเพื่อเติมคำขึ้นต้น/ลงท้ายให้อัตโนมัติ --</option>
              <optgroup label="ประกาศ (ทางการ)">
                {PATTERNS.filter(p => p.group === 'ประกาศ').map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </optgroup>
              <optgroup label="ประชาสัมพันธ์">
                {PATTERNS.filter(p => p.group === 'ประชาสัมพันธ์').map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </optgroup>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              เลือกแล้วแก้ไขข้อความต่อได้ตามปกติ — ไม่ได้บังคับใช้ ไม่มีผลต่อการบันทึก
            </p>
          </div>

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
            <p className="text-xs text-gray-400 mt-1">
              จัดรูปแบบได้: **ตัวหนา**, ==ไฮไลต์==, ขึ้นบรรทัดด้วย &quot;- &quot; ทำ bullet list หรือ &quot;1. &quot; ทำลิสต์ลำดับเลข (แสดงในอีเมลและหน้าประกาศ ยกเว้นการ์ด LINE ที่ยังเป็นข้อความล้วน)
            </p>
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
                {EXTRACTABLE_TYPES.has(attachFile.type) && (
                  <button
                    type="button"
                    onClick={extractText}
                    disabled={extracting}
                    className="mt-2 flex items-center gap-1.5 text-xs text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {extracting
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังดึงข้อความจากไฟล์...</>
                      : <><FileText className="w-3.5 h-3.5" /> ดึงข้อความจากไฟล์นี้มาใส่ในเนื้อหา</>}
                  </button>
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
          {/* Select-all + bulk delete toolbar (2026-07-13) — only shown
              when there's something to select. */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.size > 0 && filtered.every((a: any) => selectedIds.has(a.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedIds(new Set(filtered.map((a: any) => a.id)))
                    else setSelectedIds(new Set())
                  }}
                />
                เลือกทั้งหมด
              </label>
              {selectedIds.size > 0 && (
                <button
                  onClick={() => setPendingDelete({
                    ids: Array.from(selectedIds),
                    titles: filtered.filter((a: any) => selectedIds.has(a.id)).map((a: any) => a.title),
                  })}
                  className="flex items-center gap-1.5 text-sm text-red-600 hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" /> ลบที่เลือก ({selectedIds.size})
                </button>
              )}
            </div>
          )}

          {filtered.map((a: any) => (
            <div key={a.id} className="card card-body flex gap-4">
              <label className="flex items-start pt-1 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={e => {
                    setSelectedIds(prev => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(a.id); else next.delete(a.id)
                      return next
                    })
                  }}
                />
              </label>
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
                  <button
                    onClick={() => setPendingDelete({ ids: [a.id], titles: [a.title] })}
                    disabled={removeAnnouncement.isPending}
                    className="ml-auto p-1 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                    title="ลบประกาศ"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-1">{a.title}</p>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2 whitespace-pre-line">{stripAnnouncementMarkdown(a.body)}</p>
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

      {/* Delete confirmation modal (2026-07-13) — replaces the old native
          confirm() so we can offer the "retract for everyone" checkbox.
          Default (unchecked) only hides from this admin's own list. */}
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="card w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                ลบประกาศ {pendingDelete.ids.length > 1 ? `${pendingDelete.ids.length} รายการ` : ''}
              </h3>
              <button onClick={() => { setPendingDelete(null); setRetractForAll(false) }} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-gray-600 max-h-32 overflow-y-auto space-y-1">
              {pendingDelete.titles.map((t, i) => <p key={i} className="line-clamp-1">&quot;{t}&quot;</p>)}
            </div>

            <p className="text-xs text-gray-400">
              ค่าเริ่มต้น: ลบออกจากรายการของคุณเท่านั้น พนักงานยังเห็นประกาศนี้ตามปกติ
            </p>

            <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 cursor-pointer">
              <input
                type="checkbox" className="mt-0.5"
                checked={retractForAll} onChange={e => setRetractForAll(e.target.checked)}
              />
              <span>ลบสำหรับพนักงานทุกคนด้วย (ถอนประกาศถาวร ทุกคนจะไม่เห็นอีกต่อไป)</span>
            </label>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setPendingDelete(null); setRetractForAll(false) }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >ยกเลิก</button>
              <button
                onClick={() => {
                  if (!pendingDelete) return
                  if (pendingDelete.ids.length > 1) {
                    bulkRemoveAnnouncements.mutate({ ids: pendingDelete.ids, retractForAll })
                  } else {
                    removeAnnouncement.mutate({ id: pendingDelete.ids[0], retractForAll })
                  }
                  setPendingDelete(null)
                  setRetractForAll(false)
                }}
                disabled={removeAnnouncement.isPending || bulkRemoveAnnouncements.isPending}
                className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-60"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
