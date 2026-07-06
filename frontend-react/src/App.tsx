import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { ToastContainer } from './components/Toast'
import { TweaksPanel, applyAccent } from './components/TweaksPanel'
import type { TweaksState } from './components/TweaksPanel'
import { CallPanel } from './components/CallPanel'
import { ChatPanel } from './components/ChatPanel'
import { useToast } from './hooks/useToast'
import type { Page } from './types'

const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Calls     = lazy(() => import('./pages/Calls').then(m => ({ default: m.Calls })))
const Admin     = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })))
const Email     = lazy(() => import('./pages/Email').then(m => ({ default: m.Email })))
const Knowledge = lazy(() => import('./pages/Knowledge').then(m => ({ default: m.Knowledge })))
const LiveCalls = lazy(() => import('./pages/LiveCalls').then(m => ({ default: m.LiveCalls })))
const Tickets   = lazy(() => import('./pages/Tickets').then(m => ({ default: m.Tickets })))

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [userCount, setUserCount] = useState(0)
  const { toasts, addToast, removeToast } = useToast()
  const [showTweaks, setShowTweaks] = useState(false)
  const [tweaksAnchor, setTweaksAnchor] = useState<DOMRect | null>(null)

  /* ── Tweaks state ─────────────────────────────────────────────────────── */
  const [tweaks, setTweaks] = useState<TweaksState>(() => {
    const accent = localStorage.getItem('aria-accent') ?? '#a490ff'
    return { accent }
  })

  useEffect(() => {
    applyAccent(tweaks.accent)
  }, [tweaks.accent])

  /* ── Theme management ─────────────────────────────────────────────────── */
  const [isDark, setIsDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('aria-theme')
    if (stored) return stored !== 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
    }
    localStorage.setItem('aria-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleTheme = useCallback(() => setIsDark(d => !d), [])
  const handleTweaks = useCallback((rect: DOMRect) => {
    setTweaksAnchor(rect)
    setShowTweaks(t => !t)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-gh-canvas dot-grid">
      <Sidebar
        current={page}
        onNavigate={setPage}
        isDark={isDark}
        onThemeToggle={toggleTheme}
        userCount={userCount}
        onTweaks={handleTweaks}
      />

      <main className="flex-1 overflow-hidden relative flex flex-col">
        <Suspense fallback={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <div key={page} className="animate-page-enter flex-1" style={{ minHeight: 0 }}>
            {page === 'dashboard' && <Dashboard addToast={addToast} />}
            {page === 'calls'     && <Calls     addToast={addToast} />}
            {page === 'live'      && <LiveCalls addToast={addToast} />}
            {page === 'admin'     && <Admin     addToast={addToast} onUserCountChange={setUserCount} />}
            {page === 'email'     && <Email     addToast={addToast} />}
            {page === 'knowledge' && <Knowledge addToast={addToast} />}
            {page === 'tickets'   && <Tickets   addToast={addToast} />}
          </div>
        </Suspense>
      </main>

      <CallPanel />
      <ChatPanel />

      {showTweaks && tweaksAnchor && (
        <TweaksPanel
          state={tweaks}
          onChange={setTweaks}
          onClose={() => setShowTweaks(false)}
          anchor={tweaksAnchor}
        />
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
