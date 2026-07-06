import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { apiGet, apiPost } from '../hooks/useApi'
import { fmtTs, toYMD } from '../utils'
import { DatePicker } from '../components/DatePicker'
import { IcSearch, IcPlus, IcClose, IcRefresh } from '../components/icons'
import type { Email as EmailType, ToastItem } from '../types'

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const AGENT_EMAIL = 'agent@password-reset.local'
const ACCOUNT_RE  = /per l['']account\s*:\s*(\S+)/i

function extractAccount(body: string): string {
  return ACCOUNT_RE.exec(body)?.[1] ?? ''
}

function GlowDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, boxShadow: `0 0 6px ${color}`,
    }} />
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  background: 'var(--surface2)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 14, outline: 'none',
  fontFamily: 'var(--font)', transition: 'border-color .15s',
  boxSizing: 'border-box',
}

export function Email({ addToast }: Props) {
  const [inbox, setInbox]     = useState<EmailType[]>([])
  const [sent, setSent]       = useState<EmailType[]>([])
  const [loading, setLoading] = useState(true)
  const timer     = useRef<ReturnType<typeof setInterval>>()
  const fastTimer = useRef<ReturnType<typeof setInterval>>()
  const fastUntil = useRef<number>(0)

  const [selectedId, setSelectedId]     = useState<string | null>(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'processed'>('all')
  const [dateFilter, setDateFilter]     = useState('')

  const [sim, setSim]           = useState({ from_address: 'utente@example.com', account_id: '' })
  const [sending, setSending]   = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const [i, s] = await Promise.all([
        apiGet<EmailType[]>('/email/inbox'),
        apiGet<EmailType[]>('/email/sent'),
      ])
      setInbox(i ?? [])
      setSent(s ?? [])
    } catch { /* silent */ } finally {
      if (showSpinner) setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 600))])
    setRefreshing(false)
  }, [load])

  useEffect(() => {
    load(true)
    timer.current = setInterval(() => load(false), 30_000)
    return () => { clearInterval(timer.current); clearInterval(fastTimer.current) }
  }, [load])

  useEffect(() => {
    if (showModal) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [showModal])

  const startFastPoll = useCallback(() => {
    clearInterval(fastTimer.current)
    fastUntil.current = Date.now() + 30_000
    fastTimer.current = setInterval(async () => {
      if (Date.now() > fastUntil.current) { clearInterval(fastTimer.current); return }
      const [i, s] = await Promise.all([
        apiGet<EmailType[]>('/email/inbox').catch(() => null),
        apiGet<EmailType[]>('/email/sent').catch(() => null),
      ])
      if (i) setInbox(i)
      if (s) setSent(s)
      if (i?.every((e) => e.processed)) clearInterval(fastTimer.current)
    }, 2_000)
  }, [])

  const reversedInbox = useMemo(() => [...inbox].reverse(), [inbox])
  const reversedSent  = useMemo(() => [...sent].reverse(), [sent])

  const filteredInbox = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reversedInbox.filter((e) => {
      if (statusFilter === 'pending'   && e.processed)  return false
      if (statusFilter === 'processed' && !e.processed) return false
      if (dateFilter && toYMD(e.timestamp) !== dateFilter) return false
      if (q) {
        const account = extractAccount(e.body).toLowerCase()
        if (!account.includes(q) && !e.from_address.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [reversedInbox, search, statusFilter, dateFilter])

  const matchedSent = useMemo((): EmailType | null => {
    if (!selectedId) return null
    const idx = reversedInbox.findIndex((e) => e.id === selectedId)
    return idx >= 0 ? (reversedSent[idx] ?? null) : null
  }, [selectedId, reversedInbox, reversedSent])

  const selectedEmail = useMemo(
    () => reversedInbox.find((e) => e.id === selectedId) ?? null,
    [selectedId, reversedInbox]
  )

  const hasFilters = search || statusFilter !== 'all' || dateFilter

  const handleSimEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sim.from_address || !sim.account_id) { addToast('error', 'Compila tutti i campi.'); return }
    setSending(true)
    try {
      const newEmail = await apiPost<EmailType>('/email/inbox', {
        from_address: sim.from_address,
        to_address: AGENT_EMAIL,
        subject: 'Reset password',
        body: `Richiedo il reset della password per l'account: ${sim.account_id}`,
      })
      setInbox((prev) => [...prev, newEmail])
      setSelectedId(newEmail.id)
      startFastPoll()
      addToast('success', 'Email inviata.')
      setSim((p) => ({ ...p, account_id: '' }))
      setShowModal(false)
    } catch (err: unknown) {
      addToast('error', `Errore: ${err instanceof Error ? err.message : err}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fade-in dot-grid" style={{ padding: '28px 32px', height: '100%', overflow: 'hidden', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>

      {/* ── Page header ── */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexShrink: 0 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 2 }}>Email</h1>
          <p style={{ fontSize: 14, color: 'var(--text3)' }}>Monitoraggio flusso di reset password via email</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--accent)', border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 4px 14px var(--accent-glow)',
              transition: 'opacity .15s', touchAction: 'manipulation',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            <IcPlus /> Simula email
          </button>
          <button onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna"
            style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.borderColor = 'var(--border2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}>
              <IcRefresh />
            </span>
          </button>
        </div>
      </div>

      {/* ── Main card ── */}
      <div style={{
        flex: 1, minHeight: 0,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
      }}>

        {/* ── Left panel ── */}
        <div style={{
          width: 320, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          height: '100%', overflow: 'hidden',
        }}>

          {/* Left header / filters */}
          <div style={{ padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
              Conversazioni ({filteredInbox.length})
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', display: 'flex', pointerEvents: 'none' }}>
                <IcSearch />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca account o email…"
                style={{
                  width: '100%', padding: '7px 10px 7px 30px',
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
                  fontFamily: 'var(--font)', boxSizing: 'border-box', transition: 'border-color .15s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
              />
            </div>

            {/* Status filter pills */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {(['all', 'pending', 'processed'] as const).map((f) => {
                const labels = { all: 'Tutti', pending: 'In attesa', processed: 'Completata' }
                const active = statusFilter === f
                return (
                  <button key={f} onClick={() => setStatusFilter(f)} style={{
                    padding: '3px 9px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--accent)' : 'var(--text3)',
                    cursor: 'pointer', transition: 'border-color .12s, background .12s, color .12s',
                  }}>
                    {labels[f]}
                  </button>
                )
              })}
            </div>

            {/* Date picker */}
            <DatePicker
              value={dateFilter}
              onChange={setDateFilter}
              placeholder="Filtra per data…"
            />

            {hasFilters && (
              <button
                onClick={() => { setSearch(''); setStatusFilter('all'); setDateFilter('') }}
                style={{ marginTop: 8, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'var(--font)' }}
              >
                Rimuovi tutti i filtri
              </button>
            )}
          </div>

          {/* Email list */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', gap: 10 }}>
                <div className="w-4 h-4 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
                <span style={{ color: 'var(--text3)', fontSize: 14 }}>Caricamento…</span>
              </div>
            ) : filteredInbox.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                {reversedInbox.length === 0 ? 'Nessuna email ricevuta.' : 'Nessun risultato.'}
              </div>
            ) : (
              filteredInbox.map((e) => {
                const account = extractAccount(e.body) || e.from_address
                const sel = selectedId === e.id
                return (
                  <div key={e.id} onClick={() => setSelectedId(sel ? null : e.id)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      background: sel ? 'var(--surface2)' : 'transparent',
                      borderLeft: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                      transition: 'background .12s',
                    }}
                    onMouseEnter={(ev) => { if (!sel) ev.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={(ev) => { if (!sel) ev.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 6 }}>
                        {account}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, flexShrink: 0,
                        background: e.processed ? 'var(--success-dim)' : 'var(--warn-dim)',
                        color: e.processed ? 'var(--success)' : 'var(--warn)',
                        border: `1px solid ${e.processed ? '#34d39940' : '#fbbf2440'}`,
                      }}>
                        {e.processed ? 'ok' : '…'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.from_address}
                    </div>
                    <div className="tabular" style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                      {fmtTs(e.timestamp)}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Right panel ── */}
        {selectedEmail ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, background: 'var(--bg)' }}>

            {/* Detail header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
                  {extractAccount(selectedEmail.body) || selectedEmail.from_address}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {selectedEmail.from_address} · {fmtTs(selectedEmail.timestamp)}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: selectedEmail.processed ? 'var(--success-dim)' : 'var(--warn-dim)',
                color: selectedEmail.processed ? 'var(--success)' : 'var(--warn)',
                border: `1px solid ${selectedEmail.processed ? '#34d39940' : '#fbbf2440'}`,
              }}>
                {selectedEmail.processed ? 'Completato' : 'In attesa'}
              </span>
            </div>

            {/* Request block */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <GlowDot color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)' }}>
                  Richiesta ricevuta
                </span>
              </div>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                  Da: {selectedEmail.from_address} · A: {AGENT_EMAIL}<br />
                  Oggetto: {selectedEmail.subject}
                </div>
                <div style={{
                  fontSize: 14, color: 'var(--text2)', fontFamily: 'var(--mono)',
                  background: 'var(--surface2)', padding: 12, borderRadius: 7,
                }}>
                  {selectedEmail.body}
                </div>
              </div>
            </div>

            {/* Response block */}
            {matchedSent ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <GlowDot color="var(--success)" />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--success)' }}>
                    Risposta inviata
                  </span>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
                    Da: {matchedSent.from_address} · A: {matchedSent.to_address}<br />
                    Oggetto: {matchedSent.subject} · <span style={{ fontFamily: 'var(--mono)' }}>{fmtTs(matchedSent.timestamp)}</span>
                  </div>
                  <pre style={{
                    fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--mono)',
                    background: 'var(--surface2)', padding: 12, borderRadius: 7,
                    whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0,
                  }}>
                    {matchedSent.body}
                  </pre>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text3)', fontSize: 14 }}>
                <div className="w-3.5 h-3.5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" style={{ flexShrink: 0 }} />
                In elaborazione…
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, color: 'var(--text3)', background: 'var(--bg)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" width="36" height="36" style={{ opacity: 0.3 }}>
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="M2 7l10 7 10-7"/>
            </svg>
            <span style={{ fontSize: 14 }}>Seleziona una conversazione</span>
          </div>
        )}
      </div>

      {/* ── Simulate dialog ── */}
      <dialog
        ref={dialogRef}
        onClick={(e) => { if (e.target === dialogRef.current) setShowModal(false) }}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border2)',
          borderRadius: 16, padding: 0, width: 360, maxWidth: '92vw',
          boxShadow: '0 20px 60px rgba(0,0,0,.6)',
          color: 'var(--text)',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Simula email di reset</h3>
          <button type="button" onClick={() => setShowModal(false)}
            style={{ padding: 6, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text3)' }}
            aria-label="Chiudi"
          >
            <IcClose />
          </button>
        </div>
        <form onSubmit={handleSimEmail} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label htmlFor="sim-from" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Mittente</label>
            <input id="sim-from" type="email" placeholder="utente@example.com"
              autoComplete="email" value={sim.from_address}
              onChange={(e) => setSim((p) => ({ ...p, from_address: e.target.value }))}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
          <div>
            <label htmlFor="sim-account" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>Account da resettare</label>
            <input id="sim-account" placeholder="mario.rossi o email@example.com"
              spellCheck={false} value={sim.account_id}
              onChange={(e) => setSim((p) => ({ ...p, account_id: e.target.value }))}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Body</div>
            <div style={{ fontSize: 13, fontFamily: 'var(--mono)', color: 'var(--text2)', lineHeight: 1.6 }}>
              Richiedo il reset della password per l&apos;account:{' '}
              <span style={{ color: 'var(--accent)' }}>{sim.account_id || '{account}'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button type="button" onClick={() => setShowModal(false)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              Annulla
            </button>
            <button type="submit" disabled={sending}
              style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.6 : 1, boxShadow: '0 4px 14px var(--accent-glow)' }}
            >
              {sending ? 'Invio…' : 'Invia email'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
