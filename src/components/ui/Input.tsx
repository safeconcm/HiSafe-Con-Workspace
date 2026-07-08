'use client'
// src/components/ui/Input.tsx
// Design-system primitive #2. Wraps the existing `.auth-input` utility class
// (defined in globals.css, unchanged) so visual output is identical to
// before — this component only adds structure (label/icon/error slots) and
// accessibility wiring (label htmlFor, aria-invalid, aria-describedby).

import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: ReactNode
  error?: string
  rightElement?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, icon, error, rightElement, className = '', id, ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? autoId
    const errorId = error ? `${inputId}-error` : undefined

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={[
              'auth-input',
              icon ? 'pl-10' : 'pl-3',
              rightElement ? 'pr-10' : 'pr-3',
              error ? 'ring-2 ring-red-300 border-red-300' : '',
              className,
            ].join(' ')}
            {...rest}
          />
          {rightElement && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</span>
          )}
        </div>
        {error && (
          <p id={errorId} className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'
