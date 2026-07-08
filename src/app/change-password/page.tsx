'use client'
// src/app/change-password/page.tsx
// Forced first-login password change. Reached when (dashboard)/layout.tsx
// sees must_change_password=true on the logged-in user's row and redirects
// here — this page itself sits OUTSIDE the (dashboard) route group so it
// isn't wrapped by that same layout (avoids a redirect loop).
// Also reachable voluntarily any time from the account menu.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react'

export default function ChangePasswordPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  const [password,        setPassword]        = useState('')
  const [confirmPassword, setConfirmPassword]  = useState('')
  const [showPwd,  setShowPwd]  = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
      setChecking(false)
      if (!session) router.replace('/login')
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')
      return
    }
    if (password !== confirmPassword) {
      setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน')
      return
    }

    setLoading(true)
    const { error: authErr } = await supabase.auth.updateUser({ password })
    if (authErr) {
      setLoading(false)
      setError('ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาลองใหม่อีกครั้ง')
      return
    }

    // Clear the forced-change flag on this user's own row (self only — see route).
    await fetch('/api/auth/clear-password-flag', { method: 'POST' }).catch(() => {})

    setLoading(false)
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center blueprint-grid px-4">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="card p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0C447C] via-amber-400 to-[#CC1F1A]" />
          {checking ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : !hasSession ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-gray-900">ตั้งรหัสผ่านใหม่สำเร็จ</h2>
              <p className="text-sm text-gray-500 mt-2">กำลังพาไปหน้าหลัก...</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  <h1 className="text-lg font-semibold text-gray-900">กรุณาตั้งรหัสผ่านใหม่</h1>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนใช้งานระบบครั้งแรก
                </p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="form-label">รหัสผ่านใหม่</label>
                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'} required
                      value={password} onChange={e => setPassword(e.target.value)}
                      className="auth-input pl-3 pr-10" placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPwd(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">ยืนยันรหัสผ่านใหม่</label>
                  <input
                    type={showPwd ? 'text' : 'password'} required
                    value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    className="auth-input px-3" placeholder="••••••••"
                  />
                </div>
                <button type="submit" disabled={loading}
                  className="btn-lift w-full flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  ตั้งรหัสผ่านใหม่
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
