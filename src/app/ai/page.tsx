'use client'
// src/app/ai/page.tsx
// CONNEX AI — v1 "basic starter" chat page.
//
// Moved here (2026-10-16) from src/app/(dashboard)/ai/page.tsx per feedback:
// CONNEX AI is its own thing, not part of CONNEX EM, so it shouldn't inherit
// EM's sidebar/topbar (DashboardShell). This is a top-level route — same URL
// (/ai), no (dashboard) layout wrapping it, same pattern as src/app/hub/
// page.tsx. Still gated by src/middleware.ts (applies to every route not in
// PUBLIC_ROUTES, regardless of which route group it lives in), so removing
// the EM shell doesn't remove the login requirement. Since there's no
// sidebar here to navigate from, added a small back-to-hub link instead.
//
// Plain Q&A chat, not yet grounded in company data (see src/app/api/ai/chat/
// route.ts for the scope note) — reached from the hub launcher's "CONNEX AI"
// card (src/app/hub/page.tsx) or the floating chat widget on /hub itself
// (src/components/ai/FloatingAIChat.tsx).

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, User, Sparkles, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'สรุปขั้นตอนการลาพักร้อนโดยทั่วไปให้หน่อย',
  'ช่วยร่างอีเมลแจ้งลาป่วย 1 วัน',
  'อธิบายความแตกต่างระหว่าง OT กับ Flexible Time',
]

export default function AIPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (text: string) => {
    const content = text.trim()
    if (!content || loading) return

    const next = [...messages, { role: 'user', content } as ChatMessage]
    setMessages(next)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'เกิดข้อผิดพลาด')
      setMessages([...next, { role: 'assistant', content: json.data.reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/hub"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับไปหน้าเลือกระบบ</span>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-6 py-6 min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1>CONNEX AI</h1>
            <p className="text-xs text-gray-500">เวอร์ชันเริ่มต้น — ตอบคำถามทั่วไป ยังไม่เชื่อมข้อมูลพนักงาน/บริษัท</p>
          </div>
        </div>

        {/* Conversation */}
        <div className="flex-1 overflow-y-auto my-4 rounded-xl border border-gray-100 bg-white p-4 space-y-4 min-h-0">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 py-10">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm text-gray-500 max-w-sm">
                ลองถามอะไรก็ได้ เช่น ขอคำแนะนำ ร่างข้อความ หรือสรุปเรื่องทั่วไป
              </p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-gray-200 flex items-center justify-center text-gray-500 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-2.5 justify-start">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2.5">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            </div>
          )}

          {error && (
            <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <form
          onSubmit={(e) => { e.preventDefault(); send(input) }}
          className="flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="พิมพ์คำถาม..."
            rows={1}
            className="auth-input flex-1 resize-none"
          />
          <Button type="submit" disabled={!input.trim()} loading={loading} className="w-auto px-4 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
