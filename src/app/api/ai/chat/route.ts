// src/app/api/ai/chat/route.ts
// CONNEX AI — chat endpoint.
//
// v1 scope (superseded 2026-10-21c, see below): general-purpose Q&A only,
// no company data grounding — a plain pass-through to an LLM API so the
// module could go live quickly.
//
// 2026-10-21c: now grounded in company policy + system-usage reference text
// (see SYSTEM_PROMPT below) so it can answer regulation/how-to-use-the-app
// questions directly instead of deflecting to HR for everything. Still NOT
// grounded in per-user live data (leave balances, salary, personal records)
// — that would need an authenticated DB read per request, a separate,
// bigger scoping task, same as /api/inquiries for genuinely personal
// questions.
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
import { renderPolicyAsText } from '@/lib/company-policy-data'
import { renderSystemGuideAsText } from '@/lib/ai/system-guide-data'

const GEMINI_MODEL = 'gemini-3.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_TURNS = 20 // cap conversation history sent per request

// 2026-10-21c: "เทรน AI ให้เก่งเกี่ยวกับข้อกำหนดบริษัท และการใช้งานระบบ คนถามจะ
// ได้รู้มากกว่าถาม HR" — v1 (see comment block above the old SYSTEM_PROMPT
// string, now folded into this) was an intentionally bare pass-through with
// zero company grounding. This grounds it in two reference blocks built from
// real app content instead of the model's general knowledge:
//   - renderPolicyAsText(): the exact same section data that renders on
//     /company-policy (src/lib/company-policy-data.ts) — so answers about
//     work hours, leave entitlements, OT rates, severance, etc. match what's
//     posted in the app and stay in sync if that page is ever edited.
//   - renderSystemGuideAsText(): a menu-by-menu description of what the app
//     can do and where, built from Sidebar.tsx's real nav structure — so
//     "how do I request leave" gets a correct, specific answer instead of a
//     generic one.
// Still explicitly NOT grounded: any per-user live data (this employee's own
// leave balance, salary, approval status) — there's still no DB read here,
// so the prompt keeps the original instruction to be upfront about that and
// point to the real menu or HR for anything personal/private.
const SYSTEM_PROMPT =
  'คุณคือ CONNEX AI ผู้ช่วย AI ของระบบ CONNEX (แพลตฟอร์มภายในองค์กรของ SAFECON/HIGHCON) ' +
  'ตอบเป็นภาษาไทยอย่างกระชับ สุภาพ และเป็นมิตร\n\n' +
  'คุณมีความรู้เกี่ยวกับกฎระเบียบบริษัทและวิธีใช้งานระบบตามข้อมูลอ้างอิงด้านล่างนี้ ' +
  'ใช้ข้อมูลเหล่านี้ตอบคำถามพนักงานเกี่ยวกับสิทธิวันลา เวลาทำงาน ค่าล่วงเวลา วินัย การร้องทุกข์ ' +
  'ค่าชดเชย และวิธีใช้งานเมนูต่างๆ ในระบบได้โดยตรงและมั่นใจ โดยไม่ต้องบอกให้ไปถาม HR สำหรับคำถามประเภทนี้ ' +
  '(ยกเว้นกรณีที่ซับซ้อนจนข้อมูลด้านล่างไม่ครอบคลุม จึงแนะนำให้สอบถาม HR เพิ่มเติม)\n\n' +
  'ข้อจำกัดที่ยังมีอยู่: คุณยังไม่มีสิทธิ์เข้าถึงข้อมูลเฉพาะตัวของผู้ใช้แต่ละคน เช่น ยอดวันลาคงเหลือจริง ' +
  'เงินเดือน สถานะอนุมัติล่าสุด หรือข้อมูลส่วนตัวอื่นๆ — หากถูกถามเรื่องเหล่านี้ ให้แจ้งตรงไปตรงมาว่ายังดึง ' +
  'ข้อมูลเฉพาะตัวไม่ได้ในเวอร์ชันนี้ และแนะนำเมนูที่เกี่ยวข้องในระบบ หรือให้ติดต่อ HR โดยตรงแทน\n\n' +
  '=== ข้อมูลอ้างอิง: กฎระเบียบบริษัท ===\n' + renderPolicyAsText() + '\n\n' +
  '=== ข้อมูลอ้างอิง: วิธีใช้งานระบบ ===\n' + renderSystemGuideAsText()

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
