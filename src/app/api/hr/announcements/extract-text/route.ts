// src/app/api/hr/announcements/extract-text/route.ts
// POST — best-effort text extraction from an already-uploaded announcement
// attachment, for the "ดึงข้อความจากไฟล์" button (2026-07-13, per user
// request "ดึงข้อมูลจากไฟล์แนบมาจัดเรียงในกล่องข้อความก่อนกดส่ง").
//
// Takes the Storage public_url of a file already uploaded via
// /api/hr/announcements/upload-url — never the raw file bytes — so this
// stays a small JSON request/response and can't run into the Vercel
// ~4.5MB serverless body-size cap that broke direct file uploads before
// (see upload-url/route.ts's own comment for that history).
//
// Scoped to .docx only for now (via mammoth, a mature pure-JS library with
// no native bindings — safe in Vercel's serverless runtime). PDF extraction
// was intentionally left out of this first pass to keep this change's
// deploy risk as low as possible; the text is always shown to the admin in
// an editable box before anything is published, so a failed/partial
// extraction here is never destructive — it just returns an empty string.
import { NextRequest } from 'next/server'
import {
  getSessionFromHeaders, ok, badRequest, unauthorized, forbidden,
} from '@/lib/api-helpers'

const SUPPORTED_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function POST(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  if (session.role !== 'hr' && session.role !== 'admin') return forbidden()

  const payload = await req.json().catch(() => null)
  const url  = typeof payload?.url  === 'string' ? payload.url  : ''
  const type = typeof payload?.type === 'string' ? payload.type : ''
  if (!url) return badRequest('ไม่พบไฟล์ที่จะดึงข้อความ')
  if (type !== SUPPORTED_TYPE) return ok({ text: '' })

  const fileRes = await fetch(url).catch(() => null)
  if (!fileRes || !fileRes.ok) return ok({ text: '' })

  let text = ''
  try {
    const buf = Buffer.from(await fileRes.arrayBuffer())
    // Dynamic import + untyped, so a missing/mismatched type declaration
    // for this one optional-convenience library can never fail the whole
    // app's TypeScript build — only this best-effort call.
    // @ts-ignore — mammoth's bundled types aren't pinned to a specific
    // version here on purpose, see comment above.
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: buf })
    text = String(result?.value ?? '')
  } catch (err) {
    console.error('[extract-text] mammoth parse failed:', err)
    text = '' // best-effort — the admin just won't get pre-filled text
  }

  return ok({ text: text.trim() })
}
