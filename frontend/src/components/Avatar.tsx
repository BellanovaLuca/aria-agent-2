interface Props {
  name: string
  size?: number
}

export function Avatar({ name, size = 32 }: Props) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hue = name.charCodeAt(0) * 137 % 360
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: `oklch(78% 0.10 ${hue})`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.35,
      fontWeight: 700,
      color: `oklch(38% 0.12 ${hue})`,
      flexShrink: 0,
      border: '2px solid var(--border2)',
    }}>
      {initials}
    </div>
  )
}
