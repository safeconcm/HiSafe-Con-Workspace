'use client'
// src/components/ai/FloatingAIChat.tsx
// Floating chat widget for the /hub launcher page (2026-10-16), per
// feedback: CONNEX AI shouldn't feel tucked away inside a module — there
// should be a chat box right on the hub page itself, the way a lot of
// consumer apps put a chat bubble on their home screen. This renders a
// round button fixed at the bottom-right of the (dark) hub background,
// which expands into a compact chat panel in place. Full-page chat with
// more room still lives at /ai (src/app/ai/page.tsx) for longer
// conversations — same backend (/api/ai/chat), so history doesn't carry
// over between the widget and the full page (kept simple for this v1).
//
// Client component imported into the server-component hub page
// (src/app/hub/page.tsx) — Next.js allows this directly, no wrapper needed.

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Loader2, X, Sparkles, Maximize2 } from 'lucide-react'
import Link from 'next/link'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'สรุปขั้นตอนการลาพักร้อนโดยทั่วไปให้หน่อย',
  'ช่วยร่างอีเมลแจ้งลาป่วย 1 วัน',
]

export function FloatingAIChat() {
  const [open, setOpen]         = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, open])

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
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 w-[22rem] max-w-[calc(100vw-2.5rem)] h-[28rem] max-h-[70vh] rounded-2xl bg-white shadow-2xl shadow-black/40 flex flex-col overflow-hidden border border-gray-100 animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-tight">CONNEX AI</p>
                <p className="text-[11px] text-gray-400 leading-tight">ถามคำถามทั่วไปได้เลย</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link
                href="/ai"
                title="เปิดแบบเต็มหน้าจอ"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="ปิด"
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Conversation */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white">
                  <Sparkles className="w-5 h-5" />
                </div>
                <p className="text-xs text-gray-500">ลองถามอะไรก็ได้ เช่น ขอคำแนะนำ หรือร่างข้อความ</p>
                <div className="flex flex-col gap-1.5 w-full">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center text-white shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => { e.preventDefault(); send(input) }}
            className="flex items-end gap-1.5 p-2.5 border-t border-gray-100 shrink-0"
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
              className="auth-input flex-1 resize-none text-xs py-2"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="shrink-0 w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center disabled:opacity-50 hover:bg-blue-700 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'ปิดแชท CONNEX AI' : 'เปิดแชท CONNEX AI'}
        className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-600 text-white shadow-2xl shadow-black/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>
    </div>
  )
}
