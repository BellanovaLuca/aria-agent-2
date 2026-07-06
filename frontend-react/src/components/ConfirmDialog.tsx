import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Conferma',
  danger = false,
  onConfirm, onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (open) ref.current?.showModal()
    else ref.current?.close()
  }, [open])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }
    if (open) document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onCancel])

  return (
    <dialog
      ref={ref}
      onClick={(e) => { if (e.target === ref.current) onCancel() }}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border2)',
        borderRadius: 16,
        padding: 0,
        width: 400,
        maxWidth: '92vw',
        boxShadow: '0 24px 80px rgba(0,0,0,.65)',
        color: 'var(--text)',
      }}
    >
      <div style={{ padding: '22px 24px 16px' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>
          {message}
        </p>
      </div>
      <div style={{
        display: 'flex', gap: 10, padding: '12px 24px 22px',
        justifyContent: 'flex-end',
      }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost"
          style={{
            padding: '8px 18px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface2)',
            color: 'var(--text2)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Annulla
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: '8px 18px', borderRadius: 8, border: 'none',
            background: danger ? 'var(--danger)' : 'var(--accent)',
            color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            boxShadow: danger ? '0 4px 14px var(--danger-dim)' : '0 4px 14px var(--accent-glow)',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
