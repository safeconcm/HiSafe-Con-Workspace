// src/app/api/auth/me/route.ts
import { NextRequest } from 'next/server'
import { getSessionFromHeaders, ok, unauthorized } from '@/lib/api-helpers'

export async function GET(req: NextRequest) {
  const session = getSessionFromHeaders(req)
  if (!session) return unauthorized()
  return ok(session)
}
