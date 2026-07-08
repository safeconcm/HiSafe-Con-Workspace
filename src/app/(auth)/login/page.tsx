'use client'
// src/app/(auth)/login/page.tsx
// Email/Password + Google OAuth + Remember Me
// Single full-bleed hero scene (city skyline + crane, cursor-follow spotlight,
// parallax glow) with the login form floating as a card on top — reflows to
// one column on mobile/tablet instead of a hard 50/50 split.
//
// Redesign notes (2026-07): visual-only pass (Option B — "Modern SaaS").
// Auth logic below (handleEmailLogin, handleGoogle, error-code mapping,
// remember-me, redirect handling) is byte-for-byte the same behavior as
// before — only markup/classes changed, plus extraction into Button/Input/
// Card primitives and a standalone CitySkyline component.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { CitySkyline } from '@/components/auth/CitySkyline'

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const next         = searchParams.get('next') ?? '/dashboard'
  const supabase     = createClient()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState<string|null>(null)
  const [error,    setError]    = useState('')

  const sceneRef = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState({ x: 50, y: 30 })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = sceneRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setMouse({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      })
    }
    window.addEventListener('mousemove', handler)
    return () => window.removeEventListener('mousemove', handler)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('hsc_remember_email')
    if (saved) setEmail(saved)
  }, [])

  useEffect(() => {
    const code = searchParams.get('error')
    if (!code) return
    const messages: Record<string, string> = {
      no_profile:       'ไม่พบบัญชีผู้ใช้งานนี้ในระบบ กรุณาติดต่อผู้ดูแลระบบ',
      callback:         'เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง',
      account_inactive: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ',
      no_auth_user:     'ไม่พบบัญชีสำหรับเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ',
      session_failed:   'ไม่สามารถสร้างเซสชันการเข้าสู่ระบบได้ กรุณาลองใหม่อีกครั้ง',
    }
    setError(messages[code] ?? 'เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง')
  }, [searchParams])

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading('email'); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    })
    if (err) { setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); setLoading(null); return }
    if (remember) localStorage.setItem('hsc_remember_email', email.trim().toLowerCase())
    else          localStorage.removeItem('hsc_remember_email')
    router.push(next); router.refresh()
  }

  const handleGoogle = async () => {
    setLoading('google'); setError('')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(next)}` },
    })
  }

  return (
    <div
      ref={sceneRef}
      className="min-h-screen relative overflow-hidden bg-[#0a0f1a] blueprint-grid"
      style={{ '--mx': `${mouse.x}%`, '--my': `${mouse.y}%` } as React.CSSProperties}
    >
      {/* ── Background scene (full-bleed, shared across all breakpoints) ── */}
      <div className="cursor-spotlight absolute inset-0 pointer-events-none" />
      <div className="hero-horizon-glow absolute inset-0 pointer-events-none" />

      {/* Two brand-color glows — Highcon blue (top-left) and Safecon green
          (bottom-right) — so the background reads as "both companies," not
          a generic amber accent unrelated to either brand. Amber is kept
          only as a small highlight (crane lights, badge) elsewhere. */}
      <div
        className="absolute -top-24 -left-16 w-[28rem] h-[28rem] rounded-full bg-[#0C447C]/25 blur-3xl animate-blob pointer-events-none"
        style={{ transform: `translate(${(mouse.x - 50) * 0.15}px, ${(mouse.y - 50) * 0.1}px)` }}
      />
      <div
        className="absolute -bottom-16 -right-10 w-[28rem] h-[28rem] rounded-full bg-[#3B6D11]/20 blur-3xl animate-blob pointer-events-none"
        style={{ animationDelay: '-7s', transform: `translate(${(mouse.x - 50) * -0.1}px, ${(mouse.y - 50) * -0.08}px)` }}
      />

      <CitySkyline className="absolute bottom-0 inset-x-0 w-full h-[38%] sm:h-[42%] lg:h-[46%] opacity-90 pointer-events-none" />

      {/* ── Foreground content: brand block + form card ────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20 max-w-6xl mx-auto px-6 py-14 lg:py-10">

        {/* Brand block */}
        <div className="w-full max-w-md text-center lg:text-left animate-fade-in-up">
          <div className="flex items-center justify-center lg:justify-start gap-3 mx-auto lg:mx-0 mb-6 w-fit">
            <div className="flex items-center justify-center bg-white rounded-xl h-16 px-5 shadow-lg shadow-black/20">
              <Image src="/logos/safecon.png" alt="Safecon" width={120} height={48} className="object-contain h-8 w-auto" />
            </div>
            <div className="flex items-center justify-center bg-white rounded-xl h-16 px-5 shadow-lg shadow-black/20">
              <Image src="/logos/highcon.png" alt="Highcon" width={80} height={80} className="object-contain h-11 w-auto" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
            HiSafe-CON <span className="text-amber-400">WorkSpace</span>
          </h1>
          <p className="text-slate-300 mt-4 text-sm sm:text-base leading-relaxed max-w-sm mx-auto lg:mx-0">
            HR Platform สำหรับทีม Highcon และ Safecon
            ระบบจัดการงานบุคคล เอกสาร และการอนุมัติ
          </p>
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '.15s' }}>
          <Card accent className="p-7 sm:p-8">
            <div className="mb-7">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-2">
                <Users className="w-3.5 h-3.5" aria-hidden="true" />
                HiSafe-CON WorkSpace
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">เข้าสู่ระบบ</h2>
              <p className="text-sm text-gray-500 mt-1">กรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fade-in-up">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              onClick={handleGoogle}
              disabled={!!loading}
              loading={loading === 'google'}
              leftIcon={<GoogleIcon />}
              className="mb-5"
            >
              เข้าสู่ระบบด้วย Google
            </Button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-mono tracking-widest">OR</span></div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <Input
                label="อีเมล"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                icon={<Mail className="w-4 h-4" aria-hidden="true" />}
                placeholder="your@email.com"
              />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="login-password" className="form-label mb-0">รหัสผ่าน</label>
                  <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline focus-visible:outline-none focus-visible:underline">ลืมรหัสผ่าน?</Link>
                </div>
                <Input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  rightElement={
                    <button
                      type="button"
                      onClick={() => setShowPwd(s => !s)}
                      aria-label={showPwd ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      aria-pressed={showPwd}
                      className="text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:text-gray-700 transition-colors"
                    >
                      {showPwd ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  }
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-amber-400/50"
                />
                <span className="text-sm text-gray-600">จดจำการเข้าสู่ระบบ</span>
              </label>

              <Button type="submit" disabled={!!loading} loading={loading === 'email'}>
                เข้าสู่ระบบ
              </Button>
            </form>

            <p className="text-center text-[11px] text-gray-400 mt-8 font-mono tracking-widest uppercase">
              &copy; 2026 Highcon Co., Ltd. &amp; Safecon Co., Ltd.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
