import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPatch } from '../hooks/useApi'
import { ScrollToTop } from '../components/ScrollToTop'
import { IcRefresh, IcPhone, IcEmailIcon, IcChat, IcChevron } from '../components/icons'
import { fmtTs } from '../utils'
import type { Ticket, ToastItem } from '../types'

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const STATUS_META: Record<Ticket['status'], { label: string; color: string }> = {
  new:         { label: 'Nuovo',          color: 'var(--accent)' },
  in_progress: { label: 'In lavorazione', color: 'var(--warn)' },
  resolved:    { label: 'Risolto',        color: 'var(--success)' },
  closed:      { label: 'Chiuso',         color: '#8b96a5' },
}

const FILTERS: Array<{ key: 'all' | Ticket['status']; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'new', label: 'Nuovi' },
  { key: 'in_progress', label: 'In lavorazione' },
  { key: 'resolved', label: 'Risolti' },
  { key: 'closed', label: 'Chiusi' },
]

function ChannelIcon({ channel }: { channel: Ticket['channel'] }) {
  const map = { voice: <IcPhone size={14} />, email: <IcEmailIcon size={14} />, chat: <IcChat size={14} /> }
  const title = { voice: 'Telefono', email: 'Email', chat: 'Chat' }[channel]
  return <span title={title} style={{ display: 'inline-flex', color: 'var(--text3)' }}>{map[channel]}</span>
}

function StatusChip({ status }: { status: Ticket['status'] }) {
  const m = STATUS_META[status]
  return (
    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}44`, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  )
}

export function Tickets({ addToast }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'all' | Ticket['status']>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  // Animazioni cambio stato: flash sulla riga e uscita dal filtro.
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [pendingExit, setPendingExit] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true)
    try {
      setTickets(await apiGet<Ticket[]>('/tickets') ?? [])
      setLoadError(null)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      if (spinner) setLoading(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 500))])
    setRefreshing(false)
  }, [load])

  const patch = useCallback(async (number: string, body: Record<string, unknown>, okMsg: string) => {
    setBusy(number)
    try {
      await apiPatch(`/tickets/${number}`, body)
      addToast('success', okMsg)
      load(false)
    } catch (e: unknown) {
      addToast('error', `Errore: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }, [addToast, load])

  const addNote = useCallback((number: string) => {
    const text = (noteDraft[number] ?? '').trim()
    if (!text) return
    setNoteDraft(d => ({ ...d, [number]: '' }))
    patch(number, { note: text, author: 'operatore' }, 'Nota aggiunta.')
  }, [noteDraft, patch])

  const without = (s: Set<string>, id: string) => { const n = new Set(s); n.delete(id); return n }

  // Cambio stato con animazione: aggiorna subito lo stato (flash sulla riga);
  // se un filtro è attivo e il nuovo stato non vi rientra più, la riga viene
  // mostrata ancora per un istante, poi esce con un'animazione e sparisce.
  const changeStatus = useCallback(async (t: Ticket, newStatus: Ticket['status']) => {
    if (busy === t.number || t.status === newStatus) return
    setBusy(t.number)
    setTickets(list => list.map(x => (x.number === t.number ? { ...x, status: newStatus } : x)))
    setFlash(s => new Set(s).add(t.number))
    try {
      await apiPatch(`/tickets/${t.number}`, { status: newStatus })
      addToast('success', `${t.number} → ${STATUS_META[newStatus].label}`)
    } catch (e: unknown) {
      addToast('error', `Errore: ${e instanceof Error ? e.message : e}`)
      load(false) // ripristina lo stato reale dal server
      setBusy(null)
      return
    }
    setBusy(null)
    setTimeout(() => { if (mountedRef.current) setFlash(s => without(s, t.number)) }, 800)

    if (filter !== 'all' && newStatus !== filter) {
      setExpanded(x => (x === t.number ? null : x))
      setPendingExit(s => new Set(s).add(t.number)) // resta visibile durante l'animazione
      setTimeout(() => { if (mountedRef.current) setLeaving(s => new Set(s).add(t.number)) }, 650)
      setTimeout(() => {
        if (!mountedRef.current) return
        setLeaving(s => without(s, t.number))
        setPendingExit(s => without(s, t.number))
      }, 650 + 450)
    }
  }, [busy, filter, addToast, load])

  const shown = tickets.filter(t => filter === 'all' || t.status === filter || pendingExit.has(t.number))
  const openCount = tickets.filter(t => t.status === 'new' || t.status === 'in_progress').length

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>Ticket</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>{openCount} aperti · {tickets.length} totali</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna" className="btn-icon"
          style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: refreshing ? 'default' : 'pointer', display: 'flex' }}>
          <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}><IcRefresh /></span>
        </button>
      </div>

      {/* Filtri */}
      <div className="section-in" style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: filter === f.key ? 'var(--accent-dim)' : 'var(--surface2)',
              color: filter === f.key ? 'var(--accent)' : 'var(--text2)',
              border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="section-in" style={{ animationDelay: '60ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 12 }}>
            <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Caricamento…</span>
          </div>
        ) : loadError ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 8 }}>Impossibile caricare i ticket</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>{loadError}</div>
          </div>
        ) : shown.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            {tickets.length === 0 ? "Nessun ticket. L'assistente ne apre uno quando non può risolvere una richiesta." : 'Nessun ticket con questo stato.'}
          </div>
        ) : (
          shown.map((t) => {
            const isOpen = expanded === t.number
            const cls = leaving.has(t.number) ? 'ticket-leaving' : flash.has(t.number) ? 'ticket-flash' : ''
            return (
              <div key={t.number} className={cls} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : t.number)}
                  aria-expanded={isOpen}
                  style={{ width: '100%', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ color: 'var(--text3)', display: 'flex', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
                    <IcChevron open={false} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--accent)', fontWeight: 600 }}>{t.number}</span>
                      <ChannelIcon channel={t.channel} />
                      {t.caller && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{t.caller}</span>}
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t.subject}</span>
                  </div>
                  <StatusChip status={t.status} />
                  <span className="tabular" style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{fmtTs(t.created_at)}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 20px 20px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{t.description}</div>

                    {/* Note */}
                    {t.notes.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {t.notes.map((n, i) => (
                          <div key={i} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{n.author} · {fmtTs(n.at)}</div>
                            <div style={{ fontSize: 13, color: 'var(--text2)' }}>{n.text}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Azioni operatore */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text3)' }}>Cambia stato:</span>
                      {(['in_progress', 'resolved', 'closed'] as const).map(s => (
                        <button key={s} disabled={busy === t.number || t.status === s}
                          onClick={() => changeStatus(t, s)}
                          style={{
                            padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                            cursor: busy === t.number || t.status === s ? 'default' : 'pointer',
                            background: t.status === s ? `${STATUS_META[s].color}22` : 'var(--surface2)',
                            color: t.status === s ? STATUS_META[s].color : 'var(--text2)',
                            border: `1px solid ${t.status === s ? STATUS_META[s].color + '44' : 'var(--border)'}`,
                            opacity: busy === t.number ? 0.6 : 1,
                          }}>
                          {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>

                    {/* Aggiungi nota */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={noteDraft[t.number] ?? ''}
                        onChange={(e) => setNoteDraft(d => ({ ...d, [t.number]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === 'Enter') addNote(t.number) }}
                        placeholder="Aggiungi una nota di lavorazione…"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--font)', outline: 'none' }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                      />
                      <button onClick={() => addNote(t.number)} disabled={busy === t.number || !(noteDraft[t.number] ?? '').trim()}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: (noteDraft[t.number] ?? '').trim() ? 'pointer' : 'default', opacity: (noteDraft[t.number] ?? '').trim() ? 1 : 0.5 }}>
                        Nota
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />
    </div>
  )
}
