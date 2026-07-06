'use client'
// src/components/signature/SignatureCanvas.tsx
// Draw signature on canvas → export as base64 PNG
// Used in leave/timesheet detail pages

import { useRef, useState, useEffect, useCallback } from 'react'
import { Trash2, Check } from 'lucide-react'
import { cn } from '@/utils'

interface Props {
  onSave:     (dataUrl: string) => void
  onCancel?:  () => void
  label?:     string
  width?:     number
  height?:    number
}

export function SignatureCanvas({ onSave, onCancel, label = 'ลงลายมือชื่อ', width = 400, height = 160 }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [drawing,  setDrawing]  = useState(false)
  const [isEmpty,  setIsEmpty]  = useState(true)
  const [lastPos,  setLastPos]  = useState({ x: 0, y: 0 })

  // Setup canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    // Fill white background
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY }
  }

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    setDrawing(true)
    setIsEmpty(false)
    setLastPos(getPos(e, canvas))
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.x, lastPos.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setLastPos(pos)
  }, [drawing, lastPos])

  const stopDraw = useCallback(() => setDrawing(false), [])

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  const handleSave = () => {
    if (isEmpty || !canvasRef.current) return
    onSave(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">{label}</p>

      {/* Canvas */}
      <div className="relative border-2 border-dashed border-gray-300 rounded-xl overflow-hidden bg-white"
        style={{ width: '100%', maxWidth: width }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="block w-full touch-none cursor-crosshair"
          style={{ height: height }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-gray-300 select-none">วาดลายเซ็นที่นี่</p>
          </div>
        )}
        {/* Baseline */}
        <div className="absolute bottom-10 left-8 right-8 border-b border-gray-200 pointer-events-none" />
      </div>

      <div className="flex gap-2">
        <button
          onClick={clear}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <Trash2 className="w-4 h-4" />
          ล้าง
        </button>
        {onCancel && (
          <button onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            ยกเลิก
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isEmpty}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium',
            isEmpty
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-700 text-white hover:bg-blue-800'
          )}
        >
          <Check className="w-4 h-4" />
          บันทึกลายเซ็น
        </button>
      </div>

      <p className="text-xs text-gray-400">
        ลายเซ็นจะถูกบันทึกลงใน PDF และสามารถดูย้อนหลังได้ในประวัติเอกสาร
      </p>
    </div>
  )
}
