'use client'
// src/components/ui/Toaster.tsx
// Simple toast notification system using Radix Toast
import * as Toast from '@radix-ui/react-toast'
import { create } from 'zustand'
import { cn } from '@/utils'
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  title: string
  description?: string
}

interface ToastStore {
  toasts: ToastItem[]
  add: (toast: Omit<ToastItem, 'id'>) => void
  remove: (id: string) => void
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  add: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: crypto.randomUUID() }],
    })),
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

// Helper shorthand
export const toast = {
  success: (title: string, description?: string) =>
    useToast.getState().add({ type: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToast.getState().add({ type: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToast.getState().add({ type: 'info', title, description }),
}

const ICONS: Record<ToastType, React.ElementType> = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
}

const COLORS: Record<ToastType, string> = {
  success: 'text-green-600',
  error:   'text-red-600',
  info:    'text-blue-600',
}

export function Toaster() {
  const { toasts, remove } = useToast()

  return (
    <Toast.Provider swipeDirection="right" duration={4000}>
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <Toast.Root
            key={t.id}
            open
            onOpenChange={(open) => { if (!open) remove(t.id) }}
            className={cn(
              'card flex items-start gap-3 p-4 shadow-lg w-80',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-full',
              'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-full'
            )}
          >
            <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', COLORS[t.type])} />
            <div className="flex-1 min-w-0">
              <Toast.Title className="text-sm font-medium text-gray-900">{t.title}</Toast.Title>
              {t.description && (
                <Toast.Description className="text-xs text-gray-500 mt-0.5">{t.description}</Toast.Description>
              )}
            </div>
            <Toast.Close onClick={() => remove(t.id)}>
              <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
            </Toast.Close>
          </Toast.Root>
        )
      })}
      <Toast.Viewport className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80" />
    </Toast.Provider>
  )
}
