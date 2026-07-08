// src/components/ui/Card.tsx
// Design-system primitive #3 — plain surface container with an optional
// single-color accent bar (replaces the old 3-color gradient bar used on
// the login card, per the "one accent color" direction).

import type { HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  accent?: boolean
}

export function Card({ accent = false, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={['relative overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/40', className].join(' ')}
      {...rest}
    >
      {accent && <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400" />}
      {children}
    </div>
  )
}
