import { useEffect } from 'react'
import { IcClose } from './icons'

const ACCENT_SWATCHES = [
  { color: '#a490ff', label: 'Viola' },
  { color: '#22d8e8', label: 'Ciano' },
  { color: '#34d399', label: 'Verde' },
  { color: '#f97316', label: 'Arancione' },
]

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r} ${g} ${b}`
}

export function applyAccent(color: string) {
  const root = document.documentElement
  root.style.setProperty('--accent', color)
  root.style.setProperty('--accent-glow', `${color}55`)
  root.style.setProperty('--accent-dim', `${color}22`)
  root.style.setProperty('--gh-blue', hexToRgb(color))
  localStorage.setItem('aria-accent', color)
}

export interface TweaksState {
  accent: string
}

interface Props {
  state: TweaksState
  onChange: (next: TweaksState) => void
  onClose: () => void
  anchor: DOMRect
}

export function TweaksPanel({ state, onChange, onClose, anchor }: Props) {
  const panelHeight = 130
  const top = anchor.top - panelHeight - 8

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 49 }} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="Personalizza"
        style={{
          position: 'fixed', top, left: anchor.left, zIndex: 50,
          width: 240,
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          overflow: 'hidden',
          animation: 'callPanelIn .16s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Personalizza</span>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="btn-ghost"
            style={{
              padding: 5, borderRadius: 6, background: 'none', border: 'none',
              color: 'var(--text3)', cursor: 'pointer', display: 'flex', lineHeight: 1,
            }}
          >
            <IcClose size={13} />
          </button>
        </div>

        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
            Colore principale
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {ACCENT_SWATCHES.map(({ color, label }) => {
              const active = state.accent === color
              return (
                <button
                  key={color}
                  onClick={() => { applyAccent(color); onChange({ accent: color }) }}
                  aria-label={label}
                  aria-pressed={active}
                  title={label}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: color, border: 'none', cursor: 'pointer', flexShrink: 0,
                    outline: active ? '2px solid #fff' : '2px solid transparent',
                    outlineOffset: 2,
                    boxShadow: active ? `0 0 10px ${color}99` : 'none',
                    transition: 'outline .12s, box-shadow .12s',
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
