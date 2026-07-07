'use client'
// src/app/(auth)/reset-password/page.tsx
// Reached after clicking the "reset password" link from email.
// The recovery link (via /api/auth/callback) already creates a temporary
// authenticated session — this page lets the user set a new password.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
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
    setLoading(false)

    if (authErr) {
      setError('ไม่สามารถตั้งรหัสผ่านใหม่ได้ กรุณาขอลิงก์รีเซ็ตใหม่อีกครั้ง')
      return
    }

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
            <div className="text-center py-4">
              <h1 className="text-lg font-semibold text-gray-900">ลิงก์หมดอายุหรือไม่ถูกต้อง</h1>
              <p className="text-sm text-gray-500 mt-2">
                กรุณากลับไปหน้าเข้าสู่ระบบและขอลิงก์รีเซ็ตรหัสผ่านใหม่อีกครั้ง
              </p>
              <a href="/login" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
                กลับไปหน้าเข้าสู่ระบบ
              </a>
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
                <h1 className="text-lg font-semibold text-gray-900">ตั้งรหัสผ่านใหม่</h1>
                <p className="text-sm text-gray-500 mt-1">กรอกรหัสผ่านใหม่ของคุณ</p>
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
