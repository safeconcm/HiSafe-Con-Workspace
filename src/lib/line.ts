// src/lib/line.ts
// Sends LINE messages via the LINE Messaging API, using the company's
// Channel Access Token (Admin → Settings → LINE OA). The OA is currently
// shared across both companies (only one company row has the token saved —
// see the "ใช้ร่วมกันทั้ง 2 บริษัท" note in the settings UI), so lookups
// fall back to whichever company row has a token configured if the given
// company_id doesn't have one of its own.

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function adminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false }, db: { schema: 'public' } }
  )
}

async function getAccessToken(company_id: string): Promise<string | null> {
  const supabase = adminClient()

  const { data: own } = await supabase
    .from('companies')
    .select('line_oa_access_token')
    .eq('id', company_id)
    .single()
  if (own?.line_oa_access_token) return own.line_oa_access_token

  const { data: shared } = await supabase
    .from('companies')
    .select('line_oa_access_token')
    .not('line_oa_access_token', 'is', null)
    .limit(1)
    .maybeSingle()
  return shared?.line_oa_access_token ?? null
}

// Push message — for notifications triggered by app events (leave approved,
// announcements, etc). Counts against the LINE OA's monthly free push quota.
//
// `richCard` renders a LINE "Buttons" template (thumbnail image + title +
// short text + one link button) instead of a plain text bubble. Originally
// added for announcements only (they have a real attachment image to show).
// Per follow-up user request 2026-07-12 ("ใบลา/OT/Timesheet อยากให้รูปให้
// โชว์ ใส่ thumbnail ได้ไหม... เพราะมันมีแต่ลิ้งดู ไม่สวย" — purely
// decorative, no functional need), leave/OT/timesheet cards also now use
// richCard, with the company logo as a generic thumbnail (see
// dispatchNotifications in api-helpers.ts) since those events have no
// per-record image of their own. inquiry_reply still has no card and stays
// plain text + inline link.
export async function sendLineMessage(params: {
  company_id: string
  line_user_id: string
  text: string
  richCard?: {
    imageUrl: string
    title: string
    linkUrl: string
    linkLabel?: string
    // 'cover' crops to fill the frame (right for photo attachments,
    // e.g. announcements). 'contain' letterboxes instead of cropping —
    // used for logo thumbnails (leave/OT/timesheet cards) since safecon.png
    // /highcon.png aren't the 1.51:1 "rectangle" aspect ratio and cropping
    // would cut off part of the logo. Defaults to 'cover'.
    imageSize?: 'cover' | 'contain'
    // The short line shown under the card title (<=60 chars total with
    // title present — see below). Defaults to `text` (truncated) if not
    // given, but callers should pass this explicitly whenever `text` also
    // repeats the card's own title — that was wasting most of the budget
    // and cutting off mid-string (e.g. a leave date range). See
    // dispatchNotifications in api-helpers.ts.
    cardText?: string
  }
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken(params.company_id)
  if (!token) return { ok: false, error: 'LINE OA ยังไม่ได้ตั้งค่า (Admin > ตั้งค่า > LINE OA)' }

  // Buttons template constraints: title <=40 chars, text <=60 chars when a
  // thumbnail+title are both present, altText (shown in chat list/push
  // notification preview) <=400 chars. A zero-width space keeps `text` from
  // ever being sent empty, which LINE rejects.
  const message = params.richCard
    ? {
        type: 'template',
        altText: params.text.slice(0, 400),
        template: {
          type: 'buttons',
          thumbnailImageUrl: params.richCard.imageUrl,
          imageAspectRatio: 'rectangle',
          imageSize: params.richCard.imageSize ?? 'cover',
          title: params.richCard.title.slice(0, 40),
          text: ((params.richCard.cardText ?? params.text).slice(0, 59) || '​'),
          actions: [
            { type: 'uri', label: (params.richCard.linkLabel ?? 'เปิดดู').slice(0, 20), uri: params.richCard.linkUrl },
          ],
        },
      }
    : { type: 'text', text: params.text.slice(0, 4900) }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: params.line_user_id, messages: [message] }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `LINE push API ${res.status}: ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ส่ง LINE ไม่สำเร็จ (ไม่ทราบสาเหตุ)' }
  }
}

// Reply message — used only by the webhook, in direct response to an
// incoming user message (e.g. confirming a link code). Cheaper than push:
// doesn't count against the monthly free-message quota.
export async function replyLineMessage(params: {
  company_id: string
  reply_token: string
  text: string
}): Promise<{ ok: boolean; error?: string }> {
  const token = await getAccessToken(params.company_id)
  if (!token) return { ok: false, error: 'LINE OA ยังไม่ได้ตั้งค่า' }

  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken: params.reply_token, messages: [{ type: 'text', text: params.text.slice(0, 4900) }] }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return { ok: false, error: `LINE reply API ${res.status}: ${body.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'ตอบกลับ LINE ไม่สำเร็จ (ไม่ทราบสาเหตุ)' }
  }
}
