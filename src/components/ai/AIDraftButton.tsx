'use client'
// src/components/ai/AIDraftButton.tsx
// Small reusable "ให้ AI ช่วยร่าง" button for text fields where composing
// the wording is the hard part (2026-10-16, per request: HR's จัดการอัปเดต/
// สมัครงาน forms "ต้องการกรอกข้อมูล บางทีต้องคิดคำ"). Reuses the same
// backend as CONNEX AI (/api/ai/chat — see src/app/api/ai/chat/route.ts)
// rather than building a separate AI integration; this is just a one-shot
// "draft this for me" call instead of an open conversation.
//
// Deliberately dumb: the caller builds the prompt (so each form controls
// exactly what context/wording-style the draft should follow) and decides
// what to do with the result via onDraft — usually appending into a
// textarea, same pattern already used by the "ดึงข้อความจากไฟล์" button on
// the announcements page. Never overwrites silently; the caller is expected
// to let the admin/HR review and edit before submitting, same as every
// other AI-assisted text path in this app.
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/Toaster'

interface AIDraftButtonProps {
  // Returns the prompt to send, or null/empty to block the call (e.g. not
  // enough context yet — caller decides what "enough" means).
  buildPrompt: () => string
  onDraft: (text: string) => void
  label?: string
  className?: string
}

export function AIDraftButton({ buildPrompt, onDraft, label = 'ให้ AI ช่วยร่าง', className }: AIDraftButtonProps) {
  const [loading, setLoading] = useState(false)

  const run = async () => {
    const prompt = buildPrompt()
    if (!prompt.trim()) {
      toast.error('กรอกข้อมูลเบื้องต้นก่อน', 'ใส่หัวข้อหรือรายละเอียดคร่าวๆ ก่อน ให้ AI มีบริบทไปร่างต่อ')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || json?.error) throw new Error(json?.error || 'เกิดข้อผิดพลาด')
      const reply = String(json?.data?.reply ?? '').trim()
      if (!reply) throw new Error('AI ไม่ได้ส่งข้อความกลับมา ลองใหม่อีกครั้ง')
      onDraft(reply)
    } catch (e) {
      toast.error('ให้ AI ช่วยร่างไม่สำเร็จ', e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      className={className ?? 'flex items-center gap-1.5 text-xs text-indigo-700 hover:underline disabled:opacity-50'}
    >
      {loading
        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังให้ AI ร่าง...</>
        : <><Sparkles className="w-3.5 h-3.5" /> {label}</>}
    </button>
  )
}
