import { useState, useEffect, useRef } from 'react'
import { IcDashboard, IcEmailIcon, IcPhone, IcUsers, IcBook, IcHeadset, IcTicket, IcChart } from './icons'
import type { Page } from '../types'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
  isDark: boolean
  onThemeToggle: () => void
  userCount: number
  onTweaks: (rect: DOMRect) => void
}

/* ── Gruppi di navigazione ───────────────────────────────────────────────────
   Le voci sono raggruppate per area funzionale; ogni gruppo è collassabile. */

interface NavItemDef { page: Page; label: string }
interface NavGroup { id: string; label: string; items: NavItemDef[] }

const NAV_GROUPS: NavGroup[] = [
  { id: 'supporto', label: 'Supporto', items: [
    { page: 'dashboard', label: 'Panoramica' },
    { page: 'email', label: 'Email' },
    { page: 'knowledge', label: 'Knowledge' },
    { page: 'tickets', label: 'Ticket' },
  ] },
  { id: 'conversazioni', label: 'Conversazioni', items: [
    { page: 'calls', label: 'Chiamate' },
    { page: 'live', label: 'Chiamate Live' },
    { page: 'analytics', label: 'Sentiment' },
  ] },
  { id: 'amministrazione', label: 'Amministrazione', items: [
    { page: 'admin', label: 'Utenti' },
  ] },
]

const GROUP_OF: Record<string, string> = Object.fromEntries(
  NAV_GROUPS.flatMap(g => g.items.map(it => [it.page, g.id])),
)

function iconFor(page: Page, size = 15): React.ReactNode {
  switch (page) {
    case 'dashboard': return <IcDashboard size={size} />
    case 'analytics': return <IcChart size={size} />
    case 'email':     return <IcEmailIcon size={size} />
    case 'calls':     return <IcPhone size={size} />
    case 'live':      return <IcHeadset size={size} />
    case 'knowledge': return <IcBook size={size} />
    case 'tickets':   return <IcTicket size={size} />
    case 'admin':     return <IcUsers size={size} />
  }
}

/* ── Local icons ─────────────────────────────────────────────────────────── */

function IcChevronDown({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
    </svg>
  )
}
function IcSun() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-4 h-4"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>
}
function IcMoon() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="w-4 h-4"><path d="M13.5 9.5A5.5 5.5 0 0 1 7 3a5.5 5.5 0 1 0 6.5 6.5z"/></svg>
}
function IcPanelClose() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><rect x="1.5" y="2" width="13" height="12" rx="1.75"/><path d="M5.5 2V14"/></svg>
}
function IcSliders() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M2 4h12M2 8h12M2 12h12"/><circle cx="5" cy="4" r="1.5" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="1.5" fill="currentColor" stroke="none"/><circle cx="7" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>
}

/* ── Aria mark (monochrome asterisk — no gradient) ───────────────────────── */
function AriaMark({ size = 36 }: { size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: 'var(--surface2)',
      border: '1px solid var(--border2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg viewBox="0 0 20 20" fill="none" stroke="var(--accent)" strokeWidth="1.8"
        strokeLinecap="round" width="14" height="14">
        <path d="M10 2v16M2 10h16M4.1 4.1l11.8 11.8M15.9 4.1L4.1 15.9"/>
      </svg>
    </div>
  )
}

/* ── Voci ────────────────────────────────────────────────────────────────── */

function ExpandedItem({ page, label, isActive, badge, onNavigate }: {
  page: Page; label: string; isActive: boolean; badge?: number; onNavigate: (p: Page) => void
}) {
  return (
    <button
      onClick={() => onNavigate(page)}
      aria-current={isActive ? 'page' : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 10px 8px 20px', borderRadius: 8, marginBottom: 2,
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text2)',
        fontSize: 15, fontWeight: isActive ? 600 : 400,
        border: isActive ? '1px solid var(--accent-glow)' : '1px solid transparent',
        transition: 'background .12s, color .12s, border-color .12s', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
    >
      {iconFor(page)}
      <span className="flex-1 truncate text-left">{label}</span>
      {badge != null && badge > 0 && (
        <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
          {badge}
        </span>
      )}
    </button>
  )
}

function CollapsedItem({ page, label, isActive, onNavigate }: {
  page: Page; label: string; isActive: boolean; onNavigate: (p: Page) => void
}) {
  return (
    <button
      onClick={() => onNavigate(page)}
      title={label}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      style={{
        width: '100%', display: 'flex', justifyContent: 'center',
        padding: '9px 0', borderRadius: 8, marginBottom: 2,
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text2)',
        border: isActive ? '1px solid var(--accent-glow)' : '1px solid transparent',
        cursor: 'pointer', transition: 'background .12s, color .12s',
      }}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
    >
      {iconFor(page, 17)}
    </button>
  )
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

const MIN_W = 180, MAX_W = 420, DEFAULT_W = 280

function loadOpenGroups(): Record<string, boolean> {
  try {
    const stored = JSON.parse(localStorage.getItem('aria-nav-groups') ?? '{}')
    return Object.fromEntries(NAV_GROUPS.map(g => [g.id, stored[g.id] ?? true]))
  } catch {
    return Object.fromEntries(NAV_GROUPS.map(g => [g.id, true]))
  }
}

export function Sidebar({ current, onNavigate, isDark, onThemeToggle, userCount, onTweaks }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    localStorage.getItem('aria-sidebar-collapsed') === 'true'
  )
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(loadOpenGroups)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_W)
  const [dragging, setDragging]     = useState(false)
  const [handleHover, setHandleHover] = useState(false)
  const widthRef = useRef(sidebarWidth)

  useEffect(() => {
    localStorage.setItem('aria-sidebar-collapsed', String(isCollapsed))
  }, [isCollapsed])

  useEffect(() => {
    localStorage.setItem('aria-nav-groups', JSON.stringify(openGroups))
  }, [openGroups])

  useEffect(() => {
    widthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    const w = isCollapsed ? 62 : sidebarWidth
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
  }, [isCollapsed, sidebarWidth])

  // Apre automaticamente il gruppo che contiene la pagina attiva.
  useEffect(() => {
    const gid = GROUP_OF[current]
    if (gid) setOpenGroups(o => (o[gid] ? o : { ...o, [gid]: true }))
  }, [current])

  const toggleGroup = (id: string) => setOpenGroups(o => ({ ...o, [id]: !o[id] }))

  const handleDragStart = (e: React.MouseEvent) => {
    if (isCollapsed) return
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    setDragging(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const w = Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX))
      widthRef.current = w
      setSidebarWidth(w)
    }
    const onUp = () => {
      setDragging(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <aside
      style={{
        width: isCollapsed ? 62 : sidebarWidth,
        flexShrink: 0,
        position: 'relative',
        background: 'var(--sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0 0 16px',
        transition: dragging ? 'none' : 'width .2s ease-in-out',
        overflow: 'hidden',
      }}
      aria-label="Navigazione principale"
    >
      {/* ── Logo header ── */}
      {isCollapsed ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 12px' }}>
          <button
            onClick={() => setIsCollapsed(false)}
            aria-label="Espandi sidebar"
            title="Espandi sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <AriaMark size={36} />
          </button>
        </div>
      ) : (
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AriaMark size={36} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: 'var(--text)', letterSpacing: -0.2 }}>Aria</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, letterSpacing: 0.4, textTransform: 'uppercase' }}>Assistente AI</div>
            </div>
            <button
              onClick={() => setIsCollapsed(true)}
              aria-label="Comprimi sidebar"
              title="Comprimi sidebar"
              className="btn-ghost"
              style={{ color: 'var(--text3)', padding: 6, borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <IcPanelClose />
            </button>
          </div>
        </div>
      )}

      {/* ── Nav ── */}
      <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
        {isCollapsed
          ? NAV_GROUPS.map((g, gi) => (
              <div key={g.id}>
                {gi > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '8px 4px' }} />}
                {g.items.map(it => (
                  <CollapsedItem key={it.page} page={it.page} label={it.label}
                    isActive={current === it.page} onNavigate={onNavigate} />
                ))}
              </div>
            ))
          : NAV_GROUPS.map(g => {
              const open = openGroups[g.id] ?? true
              return (
                <div key={g.id} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => toggleGroup(g.id)}
                    aria-expanded={open}
                    className="btn-ghost"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '7px 10px', borderRadius: 8,
                      color: 'var(--text3)', fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
                      textTransform: 'uppercase', cursor: 'pointer', border: 'none', background: 'transparent',
                    }}
                  >
                    <span>{g.label}</span>
                    <IcChevronDown open={open} />
                  </button>
                  {open && (
                    <div>
                      {g.items.map(it => (
                        <ExpandedItem key={it.page} page={it.page} label={it.label}
                          isActive={current === it.page}
                          badge={it.page === 'admin' ? userCount : undefined}
                          onNavigate={onNavigate} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
      </nav>

      {/* ── Footer ── */}
      <div style={{ padding: '14px 16px 0', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--success)', boxShadow: '0 0 6px var(--success)',
            flexShrink: 0,
          }} className="animate-pulse-dot" />
          {!isCollapsed && (
            <span style={{ fontSize: 13, color: 'var(--text3)' }}>Online</span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button
              onClick={(e) => onTweaks(e.currentTarget.getBoundingClientRect())}
              aria-label="Personalizzazione"
              title="Personalizzazione"
              className="btn-icon"
              style={{
                color: 'var(--text3)', padding: 6,
                borderRadius: 7, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer',
              }}
            >
              <IcSliders />
            </button>
            <button
              onClick={onThemeToggle}
              aria-label={isDark ? 'Passa a tema chiaro' : 'Passa a tema scuro'}
              title={isDark ? 'Tema chiaro' : 'Tema scuro'}
              className="btn-icon"
              style={{
                color: 'var(--text3)', padding: 6,
                borderRadius: 7, border: '1px solid var(--border)',
                background: 'transparent', cursor: 'pointer',
              }}
            >
              {isDark ? <IcSun /> : <IcMoon />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Resize handle ── */}
      {!isCollapsed && (
        <div
          onMouseDown={handleDragStart}
          onMouseEnter={() => setHandleHover(true)}
          onMouseLeave={() => setHandleHover(false)}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 10 }}
          aria-hidden="true"
        >
          <div style={{
            position: 'absolute', right: 1, top: 0, bottom: 0, width: 2, borderRadius: 1,
            background: 'var(--accent)',
            opacity: handleHover || dragging ? 0.55 : 0,
            transition: 'opacity .15s',
          }} />
        </div>
      )}
    </aside>
  )
}
