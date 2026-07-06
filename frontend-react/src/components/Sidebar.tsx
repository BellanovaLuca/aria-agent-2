import { useState, useEffect, useRef } from 'react'
import { IcDashboard, IcEmailIcon, IcPhone, IcUsers, IcKey } from './icons'
import type { Page } from '../types'

interface Props {
  current: Page
  onNavigate: (page: Page) => void
  isDark: boolean
  onThemeToggle: () => void
  userCount: number
  onTweaks: (rect: DOMRect) => void
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

/* ── NavItem ─────────────────────────────────────────────────────────────── */

function NavItem({
  page, label, icon, isActive, isCollapsed, badge, onNavigate
}: {
  page: Page; label: string; icon: React.ReactNode; isActive: boolean
  isCollapsed: boolean; badge?: number; onNavigate: (p: Page) => void
}) {
  return (
    <button
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: isCollapsed ? '9px 0' : '9px 10px',
        justifyContent: isCollapsed ? 'center' : undefined,
        borderRadius: 8,
        background: isActive ? 'var(--accent-dim)' : 'transparent',
        color: isActive ? 'var(--accent)' : 'var(--text2)',
        fontSize: 15,
        fontWeight: isActive ? 600 : 400,
        border: isActive ? '1px solid var(--accent-glow)' : '1px solid transparent',
        transition: 'background .12s, color .12s, border-color .12s',
        cursor: 'pointer',
        marginBottom: 2,
        position: 'relative',
      }}
      onClick={() => onNavigate(page)}
      aria-current={isActive ? 'page' : undefined}
      title={isCollapsed ? label : undefined}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
    >
      {icon}
      {!isCollapsed && <span className="flex-1 truncate text-left">{label}</span>}
      {!isCollapsed && badge != null && badge > 0 && (
        <span style={{ marginLeft: 'auto', background: 'var(--accent)', color: 'white', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
          {badge}
        </span>
      )}
    </button>
  )
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

const RESET_PAGES: Page[] = ['dashboard', 'email']
const MIN_W = 180, MAX_W = 420, DEFAULT_W = 280

export function Sidebar({ current, onNavigate, isDark, onThemeToggle, userCount, onTweaks }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(() =>
    localStorage.getItem('aria-sidebar-collapsed') === 'true'
  )
  const [resetOpen, setResetOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_W)
  const [dragging, setDragging]     = useState(false)
  const [handleHover, setHandleHover] = useState(false)
  const widthRef = useRef(sidebarWidth)

  useEffect(() => {
    localStorage.setItem('aria-sidebar-collapsed', String(isCollapsed))
  }, [isCollapsed])

  useEffect(() => {
    widthRef.current = sidebarWidth
  }, [sidebarWidth])

  useEffect(() => {
    const w = isCollapsed ? 62 : sidebarWidth
    document.documentElement.style.setProperty('--sidebar-w', `${w}px`)
  }, [isCollapsed, sidebarWidth])

  useEffect(() => {
    if (RESET_PAGES.includes(current)) setResetOpen(true)
  }, [current])

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

        {/* Reset Password group */}
        <div style={{ marginBottom: 4 }}>
          {!isCollapsed && (
            <button
              onClick={() => setResetOpen(o => !o)}
              aria-expanded={resetOpen}
              className="btn-ghost"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 8,
                color: 'var(--text3)', fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
                textTransform: 'uppercase',
                cursor: 'pointer', border: 'none', background: 'transparent',
              }}
            >
              <span>Reset Password</span>
              <IcChevronDown open={resetOpen} />
            </button>
          )}

          {(isCollapsed || resetOpen) && (
            <div>
              {[
                { page: 'dashboard' as Page, label: 'Dashboard', icon: isCollapsed ? <IcKey size={17} /> : <IcDashboard size={15} /> },
                { page: 'email'     as Page, label: 'Email',     icon: <IcEmailIcon size={15} /> },
              ].map(({ page, label, icon }) => {
                const active = current === page
                return isCollapsed ? (
                  <button
                    key={page}
                    onClick={() => onNavigate(page)}
                    title={label}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'center',
                      padding: '9px 0', borderRadius: 8, marginBottom: 2,
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text2)',
                      border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'background .12s, color .12s',
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
                  >
                    {icon}
                  </button>
                ) : (
                  <button
                    key={page}
                    onClick={() => onNavigate(page)}
                    aria-current={active ? 'page' : undefined}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                      padding: '8px 10px 8px 20px', borderRadius: 8, marginBottom: 2,
                      background: active ? 'var(--accent-dim)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text2)',
                      fontSize: 15, fontWeight: active ? 600 : 400,
                      border: active ? '1px solid var(--accent-glow)' : '1px solid transparent',
                      transition: 'background .12s, color .12s, border-color .12s', cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)' } }}
                  >
                    {icon}
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {!isCollapsed && (
            <button
              disabled
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '7px 20px', borderRadius: 8,
                color: 'var(--text3)', fontSize: 13, fontWeight: 400,
                cursor: 'default', border: '1px solid transparent', background: 'transparent',
                opacity: 0.5,
              }}
            >
              + Nuovo modulo
            </button>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 4px 8px' }} />

        <NavItem page="calls" label="Chiamate" icon={<IcPhone size={15} />}
          isActive={current === 'calls'} isCollapsed={isCollapsed} onNavigate={onNavigate} />

        <NavItem page="admin" label="Utenti" icon={<IcUsers size={15} />}
          isActive={current === 'admin'} isCollapsed={isCollapsed} badge={userCount} onNavigate={onNavigate} />
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
