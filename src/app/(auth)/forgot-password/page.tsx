'use client'
// src/app/(auth)/forgot-password/page.tsx
import { useState }     from 'react'
import { createClient } from '@/lib/supabase/client'
import Link             from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase  = createClient()
    const redirectTo = `${window.location.origin}/api/auth/callback?next=/reset-password`

    const { error: authErr } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo }
    )

    setLoading(false)
    if (authErr) {
      setError('ไม่พบอีเมลนี้ในระบบ หรือเกิดข้อผิดพลาด')
      return
    }
    setSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center blueprint-grid px-4">
      <div className="w-full max-w-sm">
        <div className="card p-8">
          <Link href="/login" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" />
            กลับไปหน้าเข้าสู่ระบบ
          </Link>

          {!sent ? (
            <>
              <div className="mb-6">
                <h1 className="text-lg font-semibold text-gray-900">ลืมรหัสผ่าน</h1>
                <p className="text-sm text-gray-500 mt-1">กรอกอีเมลของคุณ ระบบจะส่งลิงก์รีเซ็ตรหัสผ่านให้</p>
              </div>

              {error && (
                <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="form-label">อีเมล</label>
                  <input
                    id="email" type="email" required
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="form-input" placeholder="your@email.com"
                  />
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {loading ? 'กำลังส่ง...' : 'ส่งลิงก์รีเซ็ต'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h2 className="text-base font-semibold text-gray-900">ส่งอีเมลแล้ว</h2>
              <p className="text-sm text-gray-500 mt-2">
                ตรวจสอบกล่องจดหมายของ <strong>{email}</strong><br />
                และคลิกลิงก์รีเซ็ตรหัสผ่าน
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
                กลับไปหน้าเข้าสู่ระบบ
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
