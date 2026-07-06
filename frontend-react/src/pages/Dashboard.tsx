import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { MetricCard } from '../components/MetricCard'
import { StatusBadge } from '../components/StatusBadge'
import { ScrollToTop } from '../components/ScrollToTop'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IcRefresh, IcTrash, IcPhone, IcEmailIcon, IcCheckCircle } from '../components/icons'
import { apiGet, apiDelete } from '../hooks/useApi'
import { fmtTs } from '../utils'
import type { ResetHistoryEntry, ToastItem } from '../types'

/* ── Hoisted icon nodes (stable references → MetricCard memo preserved) ──── */
const IC_TOTAL = <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18"><path d="M2 3a1 1 0 011-1h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm9 0a1 1 0 011-1h5a1 1 0 011 1v2a1 1 0 01-1 1h-5a1 1 0 01-1-1V3zm0 6a1 1 0 011-1h5a1 1 0 011 1v8a1 1 0 01-1 1h-5a1 1 0 01-1-1V9zM2 13a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4z"/></svg>
const IC_PHONE = <IcPhone size={16} />
const IC_EMAIL = <IcEmailIcon size={16} />
const IC_OK    = <IcCheckCircle size={14} />
const IC_FAIL  = <span style={{ fontSize: 13, fontWeight: 700 }}>✕</span>

/* ── Custom SVG Charts ───────────────────────────────────────────────────── */

function DonutChart({ phone, email, total }: { phone: number; email: number; total: number }) {
  const r = 72, cx = 96, cy = 96, stroke = 20
  const circ = 2 * Math.PI * r
  const phoneRatio = total > 0 ? phone / total : 0
  const emailRatio = total > 0 ? email / total : 0
  const gap = 4
  const phoneDash = Math.max(0, circ * phoneRatio - gap)
  const emailDash = Math.max(0, circ * emailRatio - gap)
  const phoneOffset = -circ * 0.25
  const emailOffset = -(circ * 0.25) - phoneDash - gap

  const svgRef = useRef<SVGSVGElement>(null)
  const dragState = useRef<{ startAngle: number; baseRotation: number } | null>(null)
  const rotRef = useRef(0)
  const [rotation, setRotation] = useState(0)
  const [dragging, setDragging] = useState(false)

  const getAngle = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    const x = (e.clientX - rect.left) * (192 / rect.width) - cx
    const y = (e.clientY - rect.top) * (192 / rect.height) - cy
    return Math.atan2(y, x) * 180 / Math.PI
  }

  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    dragState.current = { startAngle: getAngle(e), baseRotation: rotRef.current }
    setDragging(true)

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return
      const rot = dragState.current.baseRotation + (getAngle(ev) - dragState.current.startAngle)
      rotRef.current = rot
      setRotation(rot)
    }
    const onUp = () => {
      dragState.current = null
      rotRef.current = 0
      setRotation(0)
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div role="img" aria-label={`Distribuzione canali: ${phone} telefono, ${email} email, ${total} totali`}
      style={{ display: 'flex', alignItems: 'center', gap: 40, width: '100%', justifyContent: 'center' }}>
      <svg ref={svgRef} width="192" height="192" viewBox="0 0 192 192"
        style={{ flexShrink: 0, cursor: dragging ? 'grabbing' : 'grab', userSelect: 'none' }}
        onMouseDown={onMouseDown}
        aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface3)" strokeWidth={stroke} />
        <g style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: `${cx}px ${cy}px`,
          transformBox: 'view-box' as const,
          transition: dragging ? 'none' : 'transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>
          {phoneDash > 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
              strokeDasharray={`${phoneDash} ${circ}`} strokeDashoffset={phoneOffset} strokeLinecap="round" />
          )}
          {emailDash > 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
              strokeDasharray={`${emailDash} ${circ}`} strokeDashoffset={emailOffset} strokeLinecap="round" strokeOpacity={0.4} />
          )}
        </g>
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text)" fontSize="26" fontWeight="700" fontFamily="Geist, system-ui">{total}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="var(--text2)" fontSize="12" fontFamily="Geist, system-ui">totale</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[
          { label: 'Telefono', val: phone, color: 'var(--accent)', opacity: 1 },
          { label: 'Email',    val: email, color: 'var(--accent)', opacity: 0.4 },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, opacity: item.opacity, boxShadow: `0 0 8px ${item.color}`, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>{item.label}</span>
            <span className="tabular" style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginLeft: 4 }}>{item.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BarChartSVG({
  data,
  onFilterClick,
  activeChannel,
}: {
  data: Array<{ label: string; ok: number; fail: number }>
  onFilterClick?: (channel: 'voice' | 'email') => void
  activeChannel?: 'voice' | 'email' | null
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const max = Math.max(...data.map(d => Math.max(d.ok, d.fail)), 1)
  const h = 120, barW = 38, gap = 16, groupGap = 60
  const totalW = data.length * (2 * barW + gap + groupGap)

  const channelOf = (label: string): 'voice' | 'email' => label === 'Telefono' ? 'voice' : 'email'

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  const hoveredData = hovered ? data.find(d => d.label === hovered) ?? null : null

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}
      role="img" aria-label="Esito per canale: successi e fallimenti telefono ed email">
      <svg width="100%" height={h + 56} viewBox={`0 0 ${totalW + 40} ${h + 56}`}
        preserveAspectRatio="xMidYMid meet" aria-hidden="true"
        onMouseMove={handleMouseMove}>
        {data.map((d, i) => {
          const x = 20 + i * (2 * barW + gap + groupGap)
          const okH = max > 0 ? d.ok / max * h : 0
          const failH = max > 0 ? d.fail / max * h : 0
          const isHov = hovered === d.label
          const channel = channelOf(d.label)
          const isActive = activeChannel === channel
          return (
            <g key={d.label}
              onMouseEnter={() => setHovered(d.label)}
              onMouseLeave={() => { setHovered(null); setMousePos(null) }}
              onClick={() => onFilterClick?.(channel)}
              style={{ cursor: onFilterClick ? 'pointer' : 'default' }}
            >
              <rect x={x - 6} y={0} width={2 * barW + gap + 12} height={h + 4} fill="transparent" />
              <rect x={x} y={h - okH} width={barW} height={Math.max(okH, 0)} rx={4}
                fill="#6ee7b7" opacity={isHov || isActive ? 1 : 0.75} style={{ transition: 'opacity .15s' }} />
              <rect x={x + barW + gap} y={h - failH} width={barW} height={Math.max(failH, 0)} rx={4}
                fill="#fca5a5" opacity={isHov || isActive ? 1 : 0.75} style={{ transition: 'opacity .15s' }} />
              <text x={x + barW + gap / 2} y={h + 32} textAnchor="middle"
                fill={isActive ? 'var(--accent)' : 'var(--text2)'}
                fontSize="12" fontWeight={isActive ? '700' : '400'} fontFamily="Geist, system-ui">
                {d.label}
              </text>
            </g>
          )
        })}
        <line x1={20} y1={h} x2={totalW + 20} y2={h} stroke="var(--border)" strokeWidth="1" />
      </svg>

      {hoveredData && mousePos && (() => {
        const tot = hoveredData.ok + hoveredData.fail
        const okPct   = tot > 0 ? Math.round(hoveredData.ok   / tot * 100) : 0
        const failPct = tot > 0 ? Math.round(hoveredData.fail / tot * 100) : 0
        const flipX = mousePos.x > 160
        return (
          <div style={{
            position: 'absolute',
            left: flipX ? mousePos.x - 154 : mousePos.x + 12,
            top: Math.max(0, mousePos.y - 20),
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            borderRadius: 8, padding: '10px 12px',
            pointerEvents: 'none', zIndex: 10, width: 142,
            boxShadow: '0 4px 20px rgba(0,0,0,.35)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{hoveredData.label}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#6ee7b7' }}>Successi</span>
              <span className="tabular" style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
                {hoveredData.ok} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{okPct}%</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: '#fca5a5' }}>Falliti</span>
              <span className="tabular" style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
                {hoveredData.fail} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>{failPct}%</span>
              </span>
            </div>
            {onFilterClick && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text3)' }}>
                Clic per filtrare
              </div>
            )}
          </div>
        )
      })()}

      <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
        {[{ c: '#6ee7b7', l: 'Successo' }, { c: '#fca5a5', l: 'Fallito' }].map(x => (
          <div key={x.l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: x.c }} />
            {x.l}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Hero visual — floating keys (canvas, interactive) ───────────────────── */

const KEY_COLORS = ['#a490ff', '#4ade80', '#22d8e8', '#a490ff', '#a490ff', '#fbbf24']

interface KParticle {
  x: number; y: number
  vx: number; vy: number
  size: number; color: string; alpha: number; rotation: number
}

function spawnKey(W: number, H: number, x?: number, y?: number): KParticle {
  const color = KEY_COLORS[Math.floor(Math.random() * KEY_COLORS.length)]
  const size  = 10 + Math.random() * 12
  return {
    x: x ?? -size,
    y: y ?? 4 + Math.random() * Math.max(0, H - size - 8),
    vx: 28 + Math.random() * 24,
    vy: (Math.random() - 0.5) * 10,
    size, color,
    alpha: 0.55 + Math.random() * 0.40,
    rotation: (Math.random() - 0.5) * 0.5,
  }
}

function renderKey(ctx: CanvasRenderingContext2D, p: KParticle, alpha: number) {
  const s = p.size / 20
  ctx.save()
  ctx.translate(p.x + p.size / 2, p.y + p.size / 2)
  ctx.rotate(p.rotation)
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
  ctx.strokeStyle = p.color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.translate(-10 * s, -10 * s)
  ctx.lineWidth = 1.8 * s
  ctx.beginPath(); ctx.arc(7 * s, 7 * s, 4 * s, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(10 * s, 10 * s); ctx.lineTo(17 * s, 17 * s); ctx.stroke()
  ctx.lineWidth = 1.5 * s
  ctx.beginPath(); ctx.moveTo(14 * s, 14 * s); ctx.lineTo(14 * s, 16.5 * s); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(16 * s, 16 * s); ctx.lineTo(16 * s, 18 * s);   ctx.stroke()
  ctx.restore()
}

function renderLock(ctx: CanvasRenderingContext2D, cx: number, cy: number, alpha: number, glow: number) {
  ctx.save()
  ctx.shadowColor = '#a490ff'
  ctx.shadowBlur = 8 + glow * 22
  ctx.globalAlpha = alpha
  ctx.strokeStyle = '#c4b0ff'
  ctx.lineWidth = 1.8
  ctx.lineCap = 'round'
  const bx = cx - 7, by = cy - 1, bw = 14, bh = 11, br = 2
  ctx.beginPath()
  ctx.moveTo(bx + br, by); ctx.lineTo(bx + bw - br, by)
  ctx.arcTo(bx + bw, by, bx + bw, by + br, br)
  ctx.lineTo(bx + bw, by + bh - br)
  ctx.arcTo(bx + bw, by + bh, bx + bw - br, by + bh, br)
  ctx.lineTo(bx + br, by + bh)
  ctx.arcTo(bx, by + bh, bx, by + bh - br, br)
  ctx.lineTo(bx, by + br)
  ctx.arcTo(bx, by, bx + br, by, br)
  ctx.closePath(); ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - 4, cy - 1)
  ctx.arc(cx, cy - 5, 4, Math.PI * 0.9, Math.PI * 0.1)
  ctx.lineTo(cx + 4, cy - 1); ctx.stroke()
  ctx.fillStyle = '#c4b0ff'
  ctx.beginPath(); ctx.arc(cx, cy + 4, 2.2, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function KeysVisual() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })
  const stateRef  = useRef<{
    particles: KParticle[]; lastTime: number; lockGlow: number; W: number; H: number
  } | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const parent = canvas.parentElement!
    const dpr = window.devicePixelRatio || 1
    const W = parent.clientWidth
    const H = parent.clientHeight
    canvas.width  = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)

    const state = { particles: [] as KParticle[], lastTime: 0, lockGlow: 0, W, H }
    stateRef.current = state

    for (let i = 0; i < 9; i++) {
      const p = spawnKey(W, H)
      p.x = Math.random() * (W - 32)
      state.particles.push(p)
    }

    const lockX = W - 12
    const lockY = H / 2

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick)
      if (!state.lastTime) { state.lastTime = ts; return }
      const dt = Math.min((ts - state.lastTime) / 1000, 0.05)
      state.lastTime = ts
      ctx.clearRect(0, 0, W, H)

      for (let i = 0; i < 4; i++) {
        const ly = 10 + i * 20
        const g = ctx.createLinearGradient(0, 0, W - 28, 0)
        g.addColorStop(0, 'transparent'); g.addColorStop(0.15, '#34326840')
        g.addColorStop(0.85, '#34326840'); g.addColorStop(1, 'transparent')
        ctx.strokeStyle = g; ctx.lineWidth = 0.7; ctx.globalAlpha = 1
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W - 28, ly); ctx.stroke()
      }

      const { x: mx, y: my } = mouseRef.current

      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i]
        const dx = mx - (p.x + p.size / 2)
        const dy = my - (p.y + p.size / 2)
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 75 && dist > 1) {
          const f = (75 - dist) / 75
          p.vx += (dx / dist) * f * 150 * dt
          p.vy += (dy / dist) * f * 150 * dt
        }

        p.vy *= Math.pow(0.04, dt)
        p.vx += (35 - p.vx) * dt * 1.2
        p.vy  = Math.max(-55, Math.min(55, p.vy))
        p.x  += p.vx * dt
        p.y  += p.vy * dt

        if (p.y < 0)          { p.y = 0;          p.vy =  Math.abs(p.vy) * 0.4 }
        if (p.y > H - p.size) { p.y = H - p.size; p.vy = -Math.abs(p.vy) * 0.4 }

        const edgeX = lockX - 22
        let a = p.alpha
        if (p.x > edgeX - 15) a *= Math.max(0, (edgeX - p.x) / 15)
        if (p.x < 8) a *= p.x / 8

        if (p.x > edgeX) {
          state.lockGlow = 1
          state.particles.splice(i, 1)
          state.particles.unshift(spawnKey(W, H))
          continue
        }

        renderKey(ctx, p, a)
      }

      state.lockGlow = Math.max(0, state.lockGlow - dt * 1.5)
      renderLock(ctx, lockX, lockY, 0.85 + state.lockGlow * 0.15, state.lockGlow)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
  }, [])

  const onMouseLeave = useCallback(() => { mouseRef.current = { x: -9999, y: -9999 } }, [])

  const onClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const s = stateRef.current; if (!s) return
    const r = canvasRef.current!.getBoundingClientRect()
    const p = spawnKey(s.W, s.H, e.clientX - r.left - 8, e.clientY - r.top - 8)
    p.vx = 35 + Math.random() * 20
    p.vy = (Math.random() - 0.5) * 20
    s.particles.push(p)
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: 82, overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        aria-hidden="true"
      />
    </div>
  )
}

const HERO_VISUAL = <KeysVisual />

/* ── Button styles ───────────────────────────────────────────────────────── */

const btnDanger: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--border2)', color: 'var(--danger)',
  fontSize: 13, fontWeight: 500, background: 'var(--danger-dim)',
  transition: 'background .15s, border-color .15s', cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', color: 'var(--text2)',
  fontSize: 13, fontWeight: 500, background: 'var(--surface2)',
  transition: 'border-color .15s', cursor: 'pointer',
}

/* ── Component ───────────────────────────────────────────────────────────── */

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const PAGE_SIZE = 10

export function Dashboard({ addToast }: Props) {
  const [history, setHistory] = useState<ResetHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [histPage, setHistPage] = useState(0)
  const [activeFilter, setActiveFilter] = useState<'voice' | 'email' | 'success' | 'fail' | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval>>()
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const h = await apiGet<ResetHistoryEntry[]>('/api/reset-history')
      setHistory(h ?? [])
    } catch { /* silent */ }
    finally { if (showSpinner) setLoading(false) }
  }, [])

  useEffect(() => {
    load(true)
    timer.current = setInterval(() => load(false), 30_000)
    return () => clearInterval(timer.current)
  }, [load])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 600))])
    setRefreshing(false)
  }, [load])

  const handleClear = useCallback(async () => {
    setConfirmClear(false)
    try {
      await apiDelete('/api/reset-history')
      setHistory([])
      setHistPage(0)
      addToast('success', 'Cronologia azzerata.')
    } catch (e: unknown) {
      addToast('error', `Errore: ${e instanceof Error ? e.message : e}`)
    }
  }, [addToast])

  /* Stable filter callbacks — MetricCard memo stays intact */
  const setFilterNull    = useCallback(() => setActiveFilter(null), [])
  const toggleFilterVoice   = useCallback(() => setActiveFilter(f => f === 'voice'   ? null : 'voice'), [])
  const toggleFilterEmail   = useCallback(() => setActiveFilter(f => f === 'email'   ? null : 'email'), [])
  const toggleFilterSuccess = useCallback(() => setActiveFilter(f => f === 'success' ? null : 'success'), [])
  const toggleFilterFail    = useCallback(() => setActiveFilter(f => f === 'fail'    ? null : 'fail'), [])

  const { total, voice, email, success, fail, barData, reversedHistory } = useMemo(() => {
    let voice = 0, email = 0, success = 0
    let voiceOk = 0, voiceFail = 0, emailOk = 0, emailFail = 0
    for (const e of history) {
      if (e.channel === 'voice') { voice++; e.success ? voiceOk++ : voiceFail++ }
      else                       { email++; e.success ? emailOk++ : emailFail++ }
      if (e.success) success++
    }
    return {
      total: history.length,
      voice, email, success,
      fail: history.length - success,
      barData: [
        { label: 'Telefono', ok: voiceOk, fail: voiceFail },
        { label: 'Email',    ok: emailOk, fail: emailFail },
      ],
      reversedHistory: history.toReversed(),
    }
  }, [history])

  useEffect(() => { setHistPage(0) }, [activeFilter])

  const drillFiltered = useMemo(() => {
    if (!activeFilter) return reversedHistory
    return reversedHistory.filter(e => {
      if (activeFilter === 'voice')   return e.channel === 'voice'
      if (activeFilter === 'email')   return e.channel === 'email'
      if (activeFilter === 'success') return e.success
      if (activeFilter === 'fail')    return !e.success
      return true
    })
  }, [reversedHistory, activeFilter])

  const totalPages = Math.max(1, Math.ceil(drillFiltered.length / PAGE_SIZE))
  const pagedHistory = useMemo(
    () => drillFiltered.slice(histPage * PAGE_SIZE, (histPage + 1) * PAGE_SIZE),
    [drillFiltered, histPage]
  )

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256, gap: 12 }}>
      <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
      <span style={{ color: 'var(--text3)', fontSize: 14 }}>Caricamento…</span>
    </div>
  )

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 20, height: '100%', overflowY: 'auto' }}>

      {/* ── Header ── */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>
            Monitoraggio Reset
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Monitoraggio in tempo reale</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ ...btnSecondary, cursor: refreshing ? 'default' : 'pointer' }}
            onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna"
            onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.borderColor = 'var(--border2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}>
              <IcRefresh />
            </span>
          </button>
          <button
            style={btnDanger}
            onClick={() => setConfirmClear(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8717130' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-dim)' }}
          >
            <IcTrash /> Azzera cronologia
          </button>
        </div>
      </div>

      {/* ── Hero metric + row ── */}
      <div className="section-in" style={{ animationDelay: '50ms', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Hero: totale */}
        <MetricCard
          hero
          label="Totale Richieste"
          value={total}
          sub={`${total} operazioni registrate`}
          color="var(--text)"
          glow="var(--accent)"
          onClick={setFilterNull}
          icon={IC_TOTAL}
          visual={HERO_VISUAL}
        />

        {/* 4 small metrics */}
        <div style={{ display: 'flex', gap: 12 }}>
          <MetricCard label="Via Telefono" value={voice}
            sub={total > 0 ? `${Math.round(voice / total * 100)}% del totale` : '—'}
            color="var(--accent)" glow="var(--accent)"
            onClick={toggleFilterVoice}
            active={activeFilter === 'voice'}
            icon={IC_PHONE}
          />
          <MetricCard label="Via Email" value={email}
            sub={total > 0 ? `${Math.round(email / total * 100)}% del totale` : '—'}
            color="var(--accent)" glow="var(--accent)"
            onClick={toggleFilterEmail}
            active={activeFilter === 'email'}
            icon={IC_EMAIL}
          />
          <MetricCard label="Successi" value={success}
            sub={total > 0 ? `${Math.round(success / total * 100)}% success rate` : '—'}
            color="var(--success)" glow="var(--success)"
            onClick={toggleFilterSuccess}
            active={activeFilter === 'success'}
            icon={IC_OK}
          />
          <MetricCard label="Falliti" value={fail}
            sub={total > 0 ? `${Math.round(fail / total * 100)}% error rate` : '—'}
            color="var(--danger)" glow="var(--danger)"
            onClick={toggleFilterFail}
            active={activeFilter === 'fail'}
            icon={IC_FAIL}
          />
        </div>
      </div>

      {/* ── Charts ── */}
      {total > 0 && (
        <div className="section-in" style={{ animationDelay: '100ms', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 20 }}>
              Distribuzione per canale
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <DonutChart phone={voice} email={email} total={total} />
            </div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 16 }}>
              Esito per canale
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <BarChartSVG
                data={barData}
                onFilterClick={(ch) => setActiveFilter(f => f === ch ? null : ch)}
                activeChannel={activeFilter === 'voice' ? 'voice' : activeFilter === 'email' ? 'email' : null}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── History table ── */}
      <div className="section-in" style={{ animationDelay: '160ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>
              Cronologia Operazioni
            </span>
            {activeFilter && (
              <button onClick={setFilterNull} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '2px 8px 2px 10px', borderRadius: 20,
                background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', lineHeight: 1.6,
              }}>
                {{ voice: 'Telefono', email: 'Email', success: 'Successi', fail: 'Falliti' }[activeFilter]}
                <span style={{ fontSize: 13, lineHeight: 1 }}>×</span>
              </button>
            )}
          </div>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {activeFilter ? `${drillFiltered.length} / ${total}` : total} voci
          </span>
        </div>

        {history.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            Nessuna operazione effettuata ancora.
          </div>
        ) : (
          <>
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Timestamp', 'Canale', 'Tipo', 'Username', 'Esito', 'Messaggio'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((e, i) => (
                    <tr key={e.id ?? i} style={{ borderBottom: '1px solid var(--border)', transition: 'background .12s' }}
                      onMouseEnter={(el) => { el.currentTarget.style.background = 'var(--surface2)' }}
                      onMouseLeave={(el) => { el.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }} className="tabular">
                        {fmtTs(e.requested_at)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span title={e.channel === 'voice' ? 'Telefono' : 'Email'} style={{ display: 'inline-flex', color: 'var(--text2)' }}>
                          {e.channel === 'voice' ? <IcPhone size={15} /> : <IcEmailIcon size={15} />}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {(e.operation ?? 'reset') === 'unlock' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--warn-dim)', color: 'var(--warn)', border: '1px solid #fbbf2440', whiteSpace: 'nowrap' }}>Sblocco</span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-glow)', whiteSpace: 'nowrap' }}>Reset</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>{e.username}</td>
                      <td style={{ padding: '12px 16px' }}><StatusBadge type={e.success ? 'success' : 'error'} /></td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text2)' }}>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tabular" style={{ fontSize: 12, color: 'var(--text3)' }}>
                {histPage * PAGE_SIZE + 1}–{Math.min((histPage + 1) * PAGE_SIZE, drillFiltered.length)} di {drillFiltered.length}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[
                  { label: '← Prec', disabled: histPage === 0, onClick: () => setHistPage(p => p - 1) },
                  { label: 'Succ →', disabled: histPage >= totalPages - 1, onClick: () => setHistPage(p => p + 1) },
                ].map(b => (
                  <button key={b.label} onClick={b.onClick} disabled={b.disabled} style={{
                    padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'var(--surface2)', color: b.disabled ? 'var(--text3)' : 'var(--text)',
                    fontSize: 12, cursor: b.disabled ? 'not-allowed' : 'pointer',
                  }}>{b.label}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />

      <ConfirmDialog
        open={confirmClear}
        title="Azzera cronologia"
        message="Tutti i record di reset password verranno eliminati definitivamente. Questa azione non è reversibile."
        confirmLabel="Azzera"
        danger
        onConfirm={handleClear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  )
}
