'use client'
// src/app/(auth)/login/page.tsx
// Email/Password + Google OAuth + Remember Me
// Split-screen, interactive art panel on the left (brand/parallax/cursor
// spotlight) + clean form panel on the right.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail, HardHat, ShieldCheck } from 'lucide-react'

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

/** Abstract blueprint line-art of a construction crane + framed structure. */
function BlueprintArt({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 360" fill="none" className={className}>
      <g stroke="rgba(251,191,36,0.55)" strokeWidth="1.4" strokeLinecap="round">
        <path className="animate-dash" d="M60 330 L60 60 L280 60" />
        <path className="animate-dash" style={{ animationDelay: '.15s' }} d="M60 90 L420 90" />
        <path className="animate-dash" style={{ animationDelay: '.3s' }} d="M280 60 L280 330" />
        <path className="animate-dash" style={{ animationDelay: '.45s' }} d="M120 330 L120 140 L230 140 L230 330" />
        <path className="animate-dash" style={{ animationDelay: '.6s' }} d="M300 330 L300 180 L400 180 L400 330" />
      </g>
      <g stroke="rgba(148,163,184,0.35)" strokeWidth="1">
        <line x1="60" y1="330" x2="420" y2="330" />
        <circle cx="280" cy="60" r="4" fill="rgba(251,191,36,0.6)" />
      </g>
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

  const panelRef = useRef<HTMLDivElement>(null)
  const [mouse, setMouse] = useState({ x: 50, y: 30 })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const el = panelRef.current
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
    <div className="min-h-screen flex bg-[#0a0f1a]">

      {/* ── Left: interactive brand panel ─────────────────────────── */}
      <div
        ref={panelRef}
        className="hidden lg:flex lg:w-[56%] relative overflow-hidden blueprint-grid"
        style={{ '--mx': `${mouse.x}%`, '--my': `${mouse.y}%` } as React.CSSProperties}
      >
        <div className="cursor-spotlight absolute inset-0 pointer-events-none" />

        {/* floating parallax color blobs */}
        <div
          className="absolute -top-20 -left-10 w-96 h-96 rounded-full bg-[#0C447C]/30 blur-3xl animate-blob pointer-events-none"
          style={{ transform: `translate(${(mouse.x - 50) * 0.15}px, ${(mouse.y - 50) * 0.1}px)` }}
        />
        <div
          className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-amber-400/10 blur-3xl animate-blob pointer-events-none"
          style={{ animationDelay: '-7s', transform: `translate(${(mouse.x - 50) * -0.1}px, ${(mouse.y - 50) * -0.08}px)` }}
        />

        <BlueprintArt
          className="absolute inset-0 w-full h-full opacity-70 pointer-events-none"
        />

        <div className="relative z-10 flex flex-col justify-between h-full w-full p-12 xl:p-16">
          <div className="flex items-center gap-2 text-amber-400 animate-fade-in-up">
            <HardHat className="w-4 h-4" />
            <span className="text-[11px] font-mono tracking-[0.3em] uppercase">Site Access Portal</span>
          </div>

          <div className="animate-fade-in-up" style={{ animationDelay: '.1s' }}>
            <h1 className="text-4xl xl:text-5xl font-bold text-white leading-[1.15] tracking-tight">
              มาตรฐานความปลอดภัย<br />
              ที่ไว้ใจได้ในทุกไซต์งาน
            </h1>
            <p className="text-slate-400 mt-5 max-w-md text-sm leading-relaxed">
              ระบบบริหารงานบุคคล การลา และ Timesheet สำหรับทีมงานก่อสร้าง
              เซฟคอนและไฮคอน — เชื่อมทุกไซต์งานไว้ในที่เดียว
            </p>
          </div>

          <div
            className="flex items-center gap-6 bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-xl px-6 py-4 w-fit animate-fade-in-up"
            style={{ animationDelay: '.2s' }}
          >
            <Image src="/logos/safecon.png" alt="Safecon" width={80} height={40} className="object-contain" />
            <div className="w-px h-10 bg-white/20" />
            <Image src="/logos/highcon.png" alt="Highcon" width={60} height={40} className="object-contain" />
          </div>
        </div>
      </div>

      {/* ── Right: form panel ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-white relative">
        <div className="h-1.5 bg-gradient-to-r from-[#0C447C] via-amber-400 to-[#CC1F1A] shrink-0" />

        {/* Mobile-only compact header */}
        <div className="lg:hidden blueprint-grid px-6 py-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-1.5 text-amber-400">
            <HardHat className="w-3.5 h-3.5" />
            <span className="text-[10px] font-mono tracking-[0.25em] uppercase">Site Access Portal</span>
          </div>
          <div className="flex items-center gap-4 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5">
            <Image src="/logos/safecon.png" alt="Safecon" width={60} height={30} className="object-contain" />
            <div className="w-px h-7 bg-white/20" />
            <Image src="/logos/highcon.png" alt="Highcon" width={45} height={30} className="object-contain" />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '.15s' }}>
            <div className="mb-7">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                HiSafe-CON WorkSpace
              </div>
              <h2 className="text-2xl font-semibold text-gray-900">เข้าสู่ระบบ</h2>
              <p className="text-sm text-gray-500 mt-1">กรอกข้อมูลเพื่อเข้าใช้งานระบบ</p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-fade-in-up">
                {error}
              </div>
            )}

            <button
              onClick={handleGoogle}
              disabled={!!loading}
              className="btn-lift w-full flex items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 shadow-sm mb-5"
            >
              {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
              เข้าสู่ระบบด้วย Google
            </button>

            <div className="relative mb-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-mono tracking-widest">OR</span></div>
            </div>

            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="form-label">อีเมล</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="email" required autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)} className="auth-input pl-9" placeholder="your@email.com" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">รหัสผ่าน</label>
                  <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">ลืมรหัสผ่าน?</Link>
                </div>
                <div className="relative">
                  <input type={showPwd ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="auth-input pr-10" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPwd(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-600">จดจำการเข้าสู่ระบบ</span>
              </label>
              <button type="submit" disabled={!!loading}
                className="btn-lift w-full flex items-center justify-center gap-2 rounded-xl bg-[#0C447C] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0a3865] disabled:opacity-60">
                {loading === 'email' && <Loader2 className="w-4 h-4 animate-spin" />}
                เข้าสู่ระบบ
              </button>
            </form>

            <p className="text-center text-[11px] text-gray-400 mt-8 font-mono tracking-widest uppercase">
              HiSafe-CON // WorkSpace &middot; Safecon &amp; Highcon
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
