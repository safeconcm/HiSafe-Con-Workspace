'use client'
// src/components/ui/Button.tsx
// Design-system primitive #1 — starting point for the shared component
// library. Currently used only on the login page; safe to adopt on other
// pages incrementally since it renders plain Tailwind classes with no
// external side effects.

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[#0C447C] text-white hover:bg-[#0a3865] focus-visible:ring-amber-400/50 shadow-sm',
  secondary:
    'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-amber-400/50',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 focus-visible:ring-amber-400/50',
}

const SIZE_CLASSES: Record<Size, string> = {
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-4 py-3 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'lg', loading, leftIcon, disabled, className = '', children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={[
          'inline-flex w-full items-center justify-center gap-2 rounded-xl font-semibold',
          'transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0',
          'focus-visible:outline-none focus-visible:ring-4',
          'disabled:opacity-60 disabled:pointer-events-none disabled:translate-y-0',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : leftIcon}
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
