// src/app/api/ai/chat/route.ts
// CONNEX AI — v1 "basic starter" chat endpoint (2026-10-16).
//
// Scope, on purpose: general-purpose Q&A only. This does NOT read company
// data (no HR records, leave balances, payroll, policies, etc.) — it is a
// plain pass-through to the Anthropic Messages API so the module can go
// live quickly. A follow-up version can ground answers in company data
// (policies, employee-facing docs) the same way /api/inquiries threads
// human HR questions, but that's a separate, bigger scoping task.
//
// Auth: same pattern as every other API route — session comes from headers
// middleware.ts injects (see getSessionFromHeaders), so this is already
// gated behind login; no role restriction (everyone can use it, same as
// CONNEX Biz once that ships).
//
// No @anthropic-ai/sdk dependency — calls the REST API directly via fetch
// to avoid adding a new package (this repo's node_modules install has been
// flaky in CI/sandbox; a plain fetch call needs nothing extra).
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, ok, badRequest, unauthorized, serverError } from '@/lib/api-helpers'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TURNS = 20 // cap conversation history sent per request

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return serverError(new Error('ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY บนเซิร์ฟเวอร์ — กรุณาติดต่อผู้ดูแลระบบ'))
  }

  const body = await req.json().catch(() => null)
  if (!body) return badRequest('Invalid JSON')

  const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : []
  if (messages.length === 0) return badRequest('messages ต้องไม่เว้นว่าง')

  const trimmed = messages.slice(-MAX_TURNS).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content ?? '').slice(0, 8000),
  }))

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system:
          'คุณคือ CONNEX AI ผู้ช่วย AI ของระบบ CONNEX (แพลตฟอร์มภายในองค์กรของ SAFECON/HIGHCON) ' +
          'ตอบเป็นภาษาไทยอย่างกระชับ สุภาพ และเป็นมิตร หากคำถามเกี่ยวข้องกับข้อมูลเฉพาะของพนักงาน ' +
          'เงินเดือน วันลาคงเหลือ หรือข้อมูลบริษัทที่คุณไม่มีสิทธิ์เข้าถึง ให้แจ้งผู้ใช้อย่างตรงไปตรงมาว่า ' +
          'ยังไม่สามารถดึงข้อมูลเหล่านั้นได้ในเวอร์ชันนี้ และแนะนำให้ไปที่เมนู HR/Time/Leave หรือสอบถาม HR โดยตรง',
        messages: trimmed,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[AI chat] Anthropic API error', res.status, text)
      return serverError(new Error(`AI service error (${res.status})`))
    }

    const data = await res.json()
    const reply = Array.isArray(data.content)
      ? data.content.map((block: { type: string; text?: string }) => block.text ?? '').join('')
      : ''

    return ok({ reply })
  } catch (err) {
    return serverError(err)
  }
}
