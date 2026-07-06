import { useEffect } from 'react'
import type { ToastItem } from '../types'

const STYLE: Record<ToastItem['type'], string> = {
  success: 'border-gh-green/40 bg-gh-green/10 text-gh-green',
  error:   'border-gh-red/40 bg-gh-red/10 text-gh-red',
  info:    'border-gh-blue/40 bg-gh-blue/10 text-gh-blue3',
}
const ICON: Record<ToastItem['type'], string> = { success: '✓', error: '✗', info: 'ℹ' }

function ToastBubble({ toast, onRemove }: { toast: ToastItem; onRemove: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 4000)
    return () => clearTimeout(t)
  }, [toast.id, onRemove])

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      className={`animate-toast-in flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl text-sm font-medium max-w-sm ${STYLE[toast.type]}`}
    >
      <span className="font-mono text-base flex-shrink-0" aria-hidden="true">{ICON[toast.type]}</span>
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Chiudi notifica"
        className="ml-1 opacity-50 hover:opacity-100 text-lg leading-none transition-opacity touch-target"
      >
        ×
      </button>
    </div>
  )
}

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[]
  onRemove: (id: string) => void
}) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2" aria-label="Notifiche">
      {toasts.map((t) => (
        <ToastBubble key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}
