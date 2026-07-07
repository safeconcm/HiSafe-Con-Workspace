'use client'
// src/app/(auth)/login/page.tsx
// Email/Password + Google OAuth + Remember Me
// Single full-bleed hero scene (city skyline + crane, cursor-follow spotlight,
// parallax glows) with the login form floating as a card on top — reflows to
// one column on mobile/tablet instead of a hard 50/50 split.

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail, Users } from 'lucide-react'

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

/** Layered city skyline + tower crane silhouette — sits along the bottom of
 *  the hero, fading into the dark background so it reads as an illustration
 *  rather than a literal photo cutout. */
function CitySkyline({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1000 320" preserveAspectRatio="xMidYMax slice" fill="none" className={className}>
      {/* back layer — faint, distant buildings */}
      <g fill="rgba(99,130,180,0.22)">
        <rect x="0"   y="150" width="70"  height="170" />
        <rect x="80"  y="110" width="55"  height="210" />
        <rect x="150" y="170" width="90"  height="150" />
        <rect x="640" y="130" width="60"  height="190" />
        <rect x="715" y="165" width="100" height="155" />
        <rect x="830" y="100" width="65"  height="220" />
        <rect x="905" y="160" width="95"  height="160" />
      </g>
      {/* mid layer */}
      <g fill="rgba(45,66,102,0.55)">
        <rect x="30"  y="190" width="80"  height="130" />
        <rect x="120" y="140" width="50"  height="180" />
        <rect x="185" y="205" width="65"  height="115" />
        <rect x="600" y="175" width="70"  height="145" />
        <rect x="690" y="120" width="55"  height="200" />
        <rect x="765" y="200" width="80"  height="120" />
        <rect x="860" y="150" width="60"  height="170" />
      </g>
      {/* front layer — near-black, largest shapes, blends into bg */}
      <g fill="#0a0f1a">
        <rect x="0"   y="230" width="120" height="90" />
        <rect x="140" y="255" width="80"  height="65" />
        <rect x="240" y="215" width="60"  height="105" rx="2" />
        <rect x="256" y="195" width="28"  height="24" />
        <polygon points="256,195 270,175 284,195" />
        <rect x="560" y="240" width="100" height="80" />
        <rect x="720" y="260" width="90"  height="60" />
        <rect x="840" y="220" width="70"  height="100" />
        <rect x="900" y="250" width="100" height="70" />
      </g>
      {/* windows on front-layer buildings */}
      <g fill="rgba(251,191,36,0.35)">
        {Array.from({ length: 5 }).map((_, r) =>
          Array.from({ length: 6 }).map((_, c) => (
            <rect key={`${r}-${c}`} x={12 + c * 17} y={244 + r * 14} width="6" height="8" />
          ))
        )}
      </g>
      {/* tower crane, right of center — amber accent, drawn on */}
      <g stroke="rgba(251,191,36,0.75)" strokeWidth="2.5" strokeLinecap="round">
        <path className="animate-dash" d="M430 320 L430 60" />
        <path className="animate-dash" style={{ animationDelay: '.15s' }} d="M430 70 L340 70" />
        <path className="animate-dash" style={{ animationDelay: '.3s' }} d="M430 70 L520 78" />
        <path className="animate-dash" style={{ animationDelay: '.45s' }} d="M430 100 L400 60 L460 60 Z" />
        <path d="M355 70 L355 95" strokeWidth="1.8" opacity="0.6" />
      </g>
      <circle cx="430" cy="70" r="4" fill="rgba(251,191,36,0.8)" />
      <g stroke="rgba(148,163,184,0.3)" strokeWidth="1">
        <line x1="0" y1="320" x2="1000" y2="320" />
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

      <div
        className="absolute -top-24 -left-16 w-[28rem] h-[28rem] rounded-full bg-[#0C447C]/25 blur-3xl animate-blob pointer-events-none"
        style={{ transform: `translate(${(mouse.x - 50) * 0.15}px, ${(mouse.y - 50) * 0.1}px)` }}
      />
      <div
        className="absolute -bottom-16 -right-10 w-96 h-96 rounded-full bg-amber-400/10 blur-3xl animate-blob pointer-events-none"
        style={{ animationDelay: '-7s', transform: `translate(${(mouse.x - 50) * -0.1}px, ${(mouse.y - 50) * -0.08}px)` }}
      />

      <CitySkyline className="absolute bottom-0 inset-x-0 w-full h-[38%] sm:h-[42%] lg:h-[46%] opacity-90 pointer-events-none" />

      {/* ── Foreground content: brand block + form card ────────────────── */}
      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-20 max-w-6xl mx-auto px-6 py-14 lg:py-10">

        {/* Brand block */}
        <div className="w-full max-w-md text-center lg:text-left animate-fade-in-up">
          <div className="flex items-center justify-center lg:justify-start gap-4 bg-white/[0.05] backdrop-blur-sm border border-white/10 rounded-xl px-5 py-3 w-fit mx-auto lg:mx-0 mb-6">
            <Image src="/logos/safecon.png" alt="Safecon" width={68} height={34} className="object-contain" />
            <div className="w-px h-8 bg-white/20" />
            <Image src="/logos/highcon.png" alt="Highcon" width={52} height={34} className="object-contain" />
          </div>

          <h1 className="text-3xl sm:text-4xl xl:text-5xl font-bold text-white leading-tight tracking-tight">
            HiSafe-CON <span className="text-amber-400">WorkSpace</span>
          </h1>
          <p className="text-slate-300 mt-4 text-sm sm:text-base leading-relaxed max-w-sm mx-auto lg:mx-0">
            ระบบบริหารงานบุคคลกลาง สำหรับทีมงานเซฟคอนและไฮคอน
            จัดการข้อมูลพนักงาน การลา และไทม์ชีท ไว้ในที่เดียว
          </p>
        </div>

        {/* Form card */}
        <div className="w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '.15s' }}>
          <div className="rounded-2xl bg-white shadow-2xl shadow-black/50 p-7 sm:p-8 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0C447C] via-amber-400 to-[#CC1F1A]" />

            <div className="mb-7">
              <div className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 mb-2">
                <Users className="w-3.5 h-3.5" />
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
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="email" required autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)} className="auth-input pl-10 pr-3" placeholder="your@email.com" />
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
                    className="auth-input pl-3 pr-10" placeholder="••••••••" />
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
