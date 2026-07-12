// src/store/auth.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SessionUser } from '@/types/database'

interface AuthState {
  session: SessionUser | null
  setSession: (session: SessionUser | null) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      setSession: (session) => set({ session }),
      clearSession: () => set({ session: null }),
    }),
    { name: 'connex-auth' }
  )
)
