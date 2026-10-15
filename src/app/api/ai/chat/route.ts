// src/app/api/ai/chat/route.ts
// CONNEX AI — v1 "basic starter" chat endpoint.
//
// Scope, on purpose: general-purpose Q&A only. This does NOT read company
// data (no HR records, leave balances, payroll, policies, etc.) — it is a
// plain pass-through to an LLM API so the module can go live quickly. A
// follow-up version can ground answers in company data (policies,
// employee-facing docs) the same way /api/inquiries threads human HR
// questions, but that's a separate, bigger scoping task.
//
// Auth: same pattern as every other API route — session comes from headers
// middleware.ts injects (see getSessionFromHeaders), so this is already
// gated behind login; no role restriction (everyone can use it, same as
// CONNEX Biz once that ships).
//
// Provider (2026-10-16, updated): switched from Anthropic to Google's
// Gemini API — Gemini has a genuinely free tier (no billing required,
// unlike Anthropic/OpenAI which both require a payment method on file even
// for light use). Trade-off: free-tier requests are rate-limited per
// Google Cloud project, and free-tier content may be used by Google to
// improve their products — fine for this general-Q&A v1, but worth
// remembering before pointing this at anything sensitive later.
//
// Model (2026-10-16, corrected): started on gemini-2.5-flash and hit a 404
// on every request — turns out Google now restricts the whole 2.5 family to
// projects that already used it before; a brand-new API key/project 404s
// instead of getting a clean permission error. Their own docs (as of
// 2026-10-13) tell new projects to use 3.5 Flash-Lite or 3.8 Flash instead.
// Picked gemini-3.5-flash-lite — it's the one they describe as "fastest,
// most cost-effective," which matters most for a free-tier chat feature.
// No SDK dependency — calls the REST API directly via fetch (avoids adding
// a new package; this repo's node_modules install has been flaky in
// CI/sandbox).
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, ok, badRequest, unauthorized, serverError } from '@/lib/api-helpers'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_TURNS = 20 // cap conversation history sent per request

const SYSTEM_PROMPT =
  'คุณคือ CONNEX AI ผู้ช่วย AI ของระบบ CONNEX (แพลตฟอร์มภายในองค์กรของ SAFECON/HIGHCON) ' +
  'ตอบเป็นภาษาไทยอย่างกระชับ สุภาพ และเป็นมิตร หากคำถามเกี่ยวข้องกับข้อมูลเฉพาะของพนักงาน ' +
  'เงินเดือน วันลาคงเหลือ หรือข้อมูลบริษัทที่คุณไม่มีสิทธิ์เข้าถึง ให้แจ้งผู้ใช้อย่างตรงไปตรงมาว่า ' +
  'ยังไม่สามารถดึงข้อมูลเหล่านั้นได้ในเวอร์ชันนี้ และแนะนำให้ไปที่เมนู HR/Time/Leave หรือสอบถาม HR โดยตรง'

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return serverError(new Error('ยังไม่ได้ตั้งค่า GEMINI_API_KEY บนเซิร์ฟเวอร์ — กรุณาติดต่อผู้ดูแลระบบ'))
  }

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) return badRequest('messages ต้องไม่เว้นว่าง')

  // Gemini's "contents" format uses role 'model' instead of 'assistant',
  // and has no separate system-message slot in the messages array itself
  // (system prompt goes in its own top-level `systemInstruction` field).
  const contents = messages.slice(-MAX_TURNS).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content ?? '').slice(0, 8000) }],
  }))

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: 1024 },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[AI chat] Gemini API error', res.status, text)
      const friendly = res.status === 429
        ? 'ตอนนี้มีคนใช้งานเยอะเกินโควตาฟรีของระบบ กรุณาลองใหม่อีกสักครู่'
        : `AI service error (${res.status})`
      return serverError(new Error(friendly))
    }

    const data = await res.json()
    const reply: string =
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('') ?? ''

    return ok({ reply: reply || 'ขอโทษครับ ไม่สามารถสร้างคำตอบได้ กรุณาลองใหม่อีกครั้ง' })
  } catch (err) {
    return serverError(err)
  }
}
