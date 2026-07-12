// src/app/api/line/webhook/route.ts
// Receives events from the LINE Messaging API webhook (configure this URL
// in the LINE Developers console → Messaging API → Webhook URL).
//
// Currently handles only the account-linking flow: a user opens the
// company's LINE OA chat and sends the 6-digit code shown on /line/link as
// a plain text message. This endpoint verifies the request came from LINE
// (HMAC signature check using the channel secret), matches the code
// against a pending line_link_codes row, and saves the sender's LINE user
// id onto their profile.

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminSupabaseClient } from '@/lib/api-helpers'
import { replyLineMessage } from '@/lib/line'

type LineEvent = {
  type: string
  replyToken?: string
  source?: { userId?: string }
  message?: { type: string; text?: string }
}

// The LINE OA is currently shared across both companies with only one
// channel secret saved (see the "ใช้ร่วมกันทั้ง 2 บริษัท" note in Admin >
// Settings) — find whichever company row has one configured.
async function findSharedChannel(supabase: ReturnType<typeof createAdminSupabaseClient>) {
  const { data } = await supabase
    .from('companies')
    .select('id, line_oa_channel_secret')
    .not('line_oa_channel_secret', 'is', null)
    .limit(1)
    .maybeSingle()
  return data
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const supabase = createAdminSupabaseClient()

  const channel = await findSharedChannel(supabase)
  if (!channel?.line_oa_channel_secret) {
    // Not configured yet — respond 200 so LINE doesn't keep retrying, but
    // do nothing since we can't verify the signature.
    return NextResponse.json({ ok: true })
  }

  const signature = req.headers.get('x-line-signature') ?? ''
  const expected = crypto.createHmac('sha256', channel.line_oa_channel_secret).update(raw).digest('base64')
  if (signature !== expected) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: { events?: LineEvent[] }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: true })
  }

  for (const event of body.events ?? []) {
    if (event.type !== 'message' || event.message?.type !== 'text') continue
    const text = String(event.message.text ?? '').trim()
    const lineUserId = event.source?.userId
    const replyToken = event.replyToken
    if (!lineUserId || !replyToken) continue

    if (/^\d{6}$/.test(text)) {
      const { data: pending } = await supabase
        .from('line_link_codes')
        .select('id, user_id, expires_at')
        .eq('code', text)
        .is('used_at', null)
        .maybeSingle()

      if (!pending || new Date(pending.expires_at) < new Date()) {
        await replyLineMessage({
          company_id: channel.id, reply_token: replyToken,
          text: 'รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอรหัสใหม่จากหน้า "เชื่อมต่อ LINE" ในระบบ',
        })
        continue
      }

      await supabase.from('users').update({ line_user_id: lineUserId }).eq('id', pending.user_id)
      await supabase.from('line_link_codes').update({ used_at: new Date().toISOString() }).eq('id', pending.id)
      await replyLineMessage({
        company_id: channel.id, reply_token: replyToken,
        text: 'เชื่อมต่อบัญชี LINE กับ CONNEX สำเร็จแล้ว',
      })
    } else {
      await replyLineMessage({
        company_id: channel.id, reply_token: replyToken,
        text: 'พิมพ์รหัส 6 หลักจากหน้า "เชื่อมต่อ LINE" ในระบบ เพื่อเชื่อมบัญชีของคุณ',
      })
    }
  }

  return NextResponse.json({ ok: true })
}
