'use client'
// src/app/(dashboard)/line/link/page.tsx
// Lets an employee link their LINE account so they can receive
// notifications (leave approvals, announcements, etc.) via LINE.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Loader2, CheckCircle2, Copy } from 'lucide-react'

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
              <li>เพิ่มเพื่อน LINE Official Account ของบริษัท (สแกน QR หรือค้นหาจากที่ HR แจ้งไว้)</li>
              <li>กดปุ่ม &quot;ขอรหัสเชื่อมต่อ&quot; ด้านล่าง เพื่อรับรหัส 6 หลัก</li>
              <li>พิมพ์รหัสนั้นส่งเป็นข้อความในแชท LINE OA ภายใน 10 นาที</li>
            </ol>

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
