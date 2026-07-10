'use client'
// src/app/(dashboard)/line/link/page.tsx
// Lets an employee link their LINE account so they can receive
// notifications (leave approvals, announcements, etc.) via LINE.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Loader2, CheckCircle2, Copy } from 'lucide-react'

// LINE OA Basic ID — the handle employees search/add by (different from
// the numeric "Channel ID" used for the Messaging API, which lives in
// ผู้ดูแล > ตั้งค่า and is not meant for employees). Shared by both
// companies (see the settings page badge), so hardcoded here rather than
// added as another per-company setting. Update this if the OA is ever
// recreated under a different Basic ID.
const LINE_OA_BASIC_ID  = '@721xnkpf'
const LINE_OA_ADD_URL   = `https://line.me/R/ti/p/${encodeURIComponent(LINE_OA_BASIC_ID)}`
const LINE_OA_QR_IMG    = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(LINE_OA_ADD_URL)}`

export default function LineLinkPage() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [copyErr, setCopyErr] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['line-link-status'],
    queryFn: async () => {
      const res = await fetch('/api/line/link')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดสถานะไม่สำเร็จ')
      return json.data as { linked: boolean }
    },
  })

  const requestCode = async () => {
    setRequesting(true)
    try {
      const res = await fetch('/api/line/link', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'ขอรหัสไม่สำเร็จ')
      setCode(json.data.code)
      setExpiresAt(json.data.expires_at)
    } finally {
      setRequesting(false)
    }
  }

  const copyCode = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      setCopyErr(true)
    }
  }

  return (
    <div className="page-container space-y-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-gray-500" />
        <h1>เชื่อมต่อ LINE</h1>
      </div>

      <div className="card card-body space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : data?.linked ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-4 py-3 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            บัญชี LINE ของคุณเชื่อมต่อกับระบบแล้ว จะได้รับการแจ้งเตือนผ่าน LINE โดยอัตโนมัติ
          </div>
        ) : (
          <>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>เพิ่มเพื่อน LINE Official Account ของบริษัท — สแกน QR ด้านล่าง (จากมือถือ) หรือค้นหา ID <span className="font-mono font-medium">{LINE_OA_BASIC_ID}</span></li>
              <li>กดปุ่ม &quot;ขอรหัสเชื่อมต่อ&quot; ด้านล่าง เพื่อรับรหัส 6 หลัก</li>
              <li>พิมพ์รหัสนั้นส่งเป็นข้อความในแชท LINE OA ภายใน 10 นาที</li>
            </ol>

            <div className="flex flex-col sm:flex-row items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4">
              <img
                src={LINE_OA_QR_IMG}
                alt={`QR code เพิ่มเพื่อน LINE ${LINE_OA_BASIC_ID}`}
                width={140} height={140}
                className="rounded-lg bg-white border border-gray-200 shrink-0"
              />
              <div className="text-center sm:text-left space-y-1.5">
                <p className="text-sm text-gray-700">สแกนด้วยกล้องมือถือ (หรือกล้อง LINE) เพื่อเพิ่มเพื่อนทันที</p>
                <p className="text-xs text-gray-400">ถ้าเปิดหน้านี้จากมือถืออยู่แล้ว กดปุ่มด้านล่างแทนการสแกนได้เลย</p>
                <a
                  href={LINE_OA_ADD_URL} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-green-700"
                >
                  <MessageCircle className="w-4 h-4" /> เพิ่มเพื่อน LINE
                </a>
              </div>
            </div>

            {code ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-6 py-5 text-center space-y-2">
                <p className="text-xs text-gray-500">รหัสเชื่อมต่อของคุณ</p>
                <div className="flex items-center justify-center gap-2">
                  <p className="text-3xl font-bold tracking-widest text-gray-900 font-mono">{code}</p>
                  <button onClick={copyCode} className="text-gray-400 hover:text-gray-600" title="คัดลอก">
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                {copyErr && <p className="text-xs text-red-500">คัดลอกไม่สำเร็จ กรุณาพิมพ์เอง</p>}
                {expiresAt && (
                  <p className="text-xs text-gray-400">
                    หมดอายุ {new Date(expiresAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            ) : null}

            <button
              onClick={requestCode}
              disabled={requesting}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {requesting && <Loader2 className="w-4 h-4 animate-spin inline mr-2" />}
              {code ? 'ขอรหัสใหม่' : 'ขอรหัสเชื่อมต่อ'}
            </button>

            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['line-link-status'] })}
              className="ml-2 text-sm text-gray-500 hover:text-gray-700 underline"
            >
              ตรวจสอบสถานะอีกครั้ง
            </button>
          </>
        )}
      </div>
    </div>
  )
}
