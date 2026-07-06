'use client'
// src/components/layout/PWABanner.tsx
// Shows "Add to Home Screen" banner + offline indicator

import { usePWA }      from '@/hooks/usePWA'
import { Smartphone, WifiOff, X } from 'lucide-react'
import { useState }    from 'react'

export function PWABanner() {
  const { installPrompt, isInstalled, isOnline, promptInstall } = usePWA()
  const [dismissed, setDismissed] = useState(false)

  return (
    <>
      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-sm py-2 px-4 flex items-center justify-center gap-2 no-print">
          <WifiOff className="w-4 h-4" />
          <span>ไม่มีการเชื่อมต่ออินเทอร์เน็ต — ข้อมูลอาจไม่เป็นปัจจุบัน</span>
        </div>
      )}

      {/* Install PWA banner */}
      {installPrompt && !isInstalled && !dismissed && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-80 z-40 no-print">
          <div className="card p-4 shadow-lg border border-blue-200">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">ติดตั้งแอปบนมือถือ</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  เพิ่ม HiSafe-CON ลงหน้าจอหลัก ใช้งานได้แบบแอปทันที
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={promptInstall}
                    className="rounded-lg bg-blue-700 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-800"
                  >
                    ติดตั้งเลย
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="rounded-lg border border-gray-300 text-gray-600 px-3 py-1.5 text-xs hover:bg-gray-50"
                  >
                    ไว้ก่อน
                  </button>
                </div>
              </div>
              <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
