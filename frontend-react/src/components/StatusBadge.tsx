type BadgeType = 'active' | 'locked' | 'suspended' | 'voice' | 'email' | 'success' | 'error' | 'pending' | 'completed' | 'web'

interface BadgeStyle { bg: string; color: string; border: string }

const STYLES: Record<BadgeType, BadgeStyle> = {
  active:    { bg: 'var(--success-dim)', color: 'var(--success)', border: '#34d39940' },
  locked:    { bg: 'var(--danger-dim)',  color: 'var(--danger)',  border: '#f8717140' },
  suspended: { bg: 'var(--warn-dim)',    color: 'var(--warn)',    border: '#fbbf2440' },
  voice:     { bg: 'var(--accent-dim)',   color: 'var(--accent)',  border: 'var(--accent-glow)' },
  email:     { bg: 'var(--accent-dim)',  color: 'var(--accent)',  border: 'var(--accent-glow)' },
  web:       { bg: 'var(--accent-dim)',  color: 'var(--accent)',  border: 'var(--accent-glow)' },
  success:   { bg: 'var(--success-dim)', color: 'var(--success)', border: '#34d39940' },
  completed: { bg: 'var(--success-dim)', color: 'var(--success)', border: '#34d39940' },
  error:     { bg: 'var(--danger-dim)',  color: 'var(--danger)',  border: '#f8717140' },
  pending:   { bg: 'var(--warn-dim)',    color: 'var(--warn)',    border: '#fbbf2440' },
}

const LABELS: Record<BadgeType, string> = {
  active:    'Attivo',
  locked:    'Bloccato',
  suspended: 'Sospeso',
  voice:     'Voce',
  email:     'Email',
  web:       'Web',
  success:   'OK',
  completed: 'Completato',
  error:     'Fallito',
  pending:   'In attesa',
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
}

export function StatusBadge({ type, children }: { type: BadgeType; children?: React.ReactNode }) {
  const s = STYLES[type]
  const label = children ?? LABELS[type]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: 0.3,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      {(type === 'active' || type === 'completed' || type === 'success') && <Dot color={s.color} />}
      {(type === 'locked' || type === 'error') && <span style={{ fontSize: 9 }}>✕</span>}
      {(type === 'voice') && <span style={{ fontSize: 10 }}>📞</span>}
      {(type === 'email') && <span style={{ fontSize: 10 }}>✉</span>}
      {(type === 'pending' || type === 'suspended') && <span style={{ fontSize: 10 }}>⏳</span>}
      {(type === 'web') && <span style={{ fontSize: 10 }}>🌐</span>}
      {label}
    </span>
  )
}
