import { memo, useState, useEffect, useRef } from 'react'

interface Props {
  label: string
  value: number
  sub?: string
  color?: string
  glow?: string
  icon?: React.ReactNode
  onClick?: () => void
  active?: boolean
  hero?: boolean
  visual?: React.ReactNode
}

export const MetricCard = memo(function MetricCard({
  label, value, sub,
  color = 'var(--text)', glow, icon,
  onClick, active, hero = false, visual,
}: Props) {
  const [display, setDisplay] = useState(value)
  const [bump, setBump]       = useState(false)
  const [cardFlash, setCardFlash] = useState(false)
  const fromRef = useRef(value)
  const rafRef  = useRef<number>(0)

  useEffect(() => {
    const from = fromRef.current
    fromRef.current = value
    if (from === value) return

    const duration = 900
    const start = performance.now()
    cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (value - from) * eased))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    setBump(true)
    setCardFlash(true)
    const t1 = setTimeout(() => setBump(false), 550)
    const t2 = setTimeout(() => setCardFlash(false), 700)

    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(t1); clearTimeout(t2) }
  }, [value])

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${active || cardFlash ? (glow ?? 'var(--border2)') : 'var(--border)'}`,
        borderRadius: hero ? 14 : 12,
        padding: hero ? '22px 28px' : '18px 20px',
        flex: hero ? 'none' : '1',
        width: hero ? '100%' : undefined,
        minWidth: 0,
        transition: cardFlash ? 'box-shadow .08s, border-color .08s' : 'border-color .4s, box-shadow .4s',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow: (active || cardFlash) && glow
          ? cardFlash
            ? `0 0 40px ${glow}55, 0 0 0 1px ${glow}44`
            : `0 0 28px ${glow}28, 0 0 0 1px ${glow}1a`
          : 'none',
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? active : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      onMouseEnter={(e) => {
        if (active || !onClick) return
        e.currentTarget.style.borderColor = glow ?? 'var(--border2)'
        if (glow) e.currentTarget.style.boxShadow = `0 0 28px ${glow}28, 0 0 0 1px ${glow}1a`
      }}
      onMouseLeave={(e) => {
        if (active || !onClick) return
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Glow blob */}
      {glow && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: -20, right: -20,
            width: 80, height: 80,
            borderRadius: '50%',
            background: glow,
            filter: 'blur(30px)',
            opacity: active ? 0.55 : 0.35,
            transition: 'opacity .2s',
          }}
          aria-hidden="true"
        />
      )}
      {active && (
        <div style={{
          position: 'absolute', top: 10, right: 10,
          width: 7, height: 7, borderRadius: '50%',
          background: glow ?? 'var(--accent)',
          boxShadow: `0 0 6px ${glow ?? 'var(--accent)'}`,
        }} aria-hidden="true" />
      )}

      <div className="flex justify-between items-start" style={{ marginBottom: hero ? 14 : 12 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 1,
          textTransform: 'uppercase', color: 'var(--text3)',
        }}>
          {label}
        </span>
        {icon && <span style={{ color, opacity: 0.8 }}>{icon}</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: hero ? 52 : 32, fontWeight: 700, lineHeight: 1, marginBottom: 4 }}>
            <span
              className="tabular"
              style={{
                display: 'inline-block',
                color: bump ? (glow ?? color) : color,
                transform: bump ? (hero ? 'scale(1.12) translateY(-4px)' : 'scale(1.28) translateY(-5px)') : 'scale(1) translateY(0)',
                transformOrigin: 'left center',
                transition: bump
                  ? 'transform 0.1s ease-out, color 0.1s'
                  : 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), color 0.45s',
              }}
            >
              {display}
            </span>
          </div>

          {sub && (
            <div style={{ fontSize: hero ? 13 : 12, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
          )}
        </div>

        {hero && visual && (
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 24 }} aria-hidden="true">{visual}</div>
        )}
      </div>
    </div>
  )
})
