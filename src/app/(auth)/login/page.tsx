'use client'
// src/app/(auth)/login/page.tsx
// Email/Password + Google OAuth + LINE Login + Remember Me

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Image from 'next/image'
import Link from 'next/link'
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react'

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

function LINEIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#fff" d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
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

  useEffect(() => {
    const saved = localStorage.getItem('hsc_remember_email')
    if (saved) setEmail(saved)
  }, [])

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

  const handleLINE = () => {
    setLoading('line')
    window.location.href = `/api/auth/line?next=${encodeURIComponent(next)}`
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 px-4 py-8">
      <div className="flex items-center gap-6 mb-8">
        <Image src="/logos/safecon.png" alt="Safecon" width={80} height={40} className="object-contain" />
        <div className="w-px h-10 bg-gray-300" />
        <Image src="/logos/highcon.png" alt="Highcon" width={60} height={40} className="object-contain" />
      </div>

      <div className="w-full max-w-sm">
        <div className="card p-8">
          <div className="text-center mb-6">
            <h1 className="text-xl font-semibold text-gray-900">HiSafe-CON WorkSpace</h1>
            <p className="text-sm text-gray-500 mt-1">เข้าสู่ระบบเพื่อใช้งาน</p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="space-y-3 mb-5">
            <button onClick={handleGoogle} disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 shadow-sm transition-colors">
              {loading === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
              เข้าสู่ระบบด้วย Google
            </button>
            <button onClick={handleLINE} disabled={!!loading}
              className="w-full flex items-center justify-center gap-3 rounded-xl bg-[#00B900] px-4 py-3 text-sm font-medium text-white hover:bg-[#009900] disabled:opacity-60 shadow-sm transition-colors">
              {loading === 'line' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LINEIcon />}
              เข้าสู่ระบบด้วย LINE
            </button>
          </div>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">หรือ</span></div>
          </div>

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="form-label">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="email" required autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} className="form-input pl-9" placeholder="your@email.com" />
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
                  className="form-input pr-10" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPwd(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 transition-colors">
              {loading === 'email' && <Loader2 className="w-4 h-4 animate-spin" />}
              เข้าสู่ระบบ
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">HiSafe-CON WorkSpace · Safecon & Highcon</p>
      </div>
    </div>
  )
}
