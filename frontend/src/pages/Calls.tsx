import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { apiGet } from '../hooks/useApi'
import { toYMD } from '../utils'
import { DatePicker } from '../components/DatePicker'
import { ScrollToTop } from '../components/ScrollToTop'
import { IcRefresh, IcPhone, IcWeb, IcChevron } from '../components/icons'
import type { TranscriptMeta, ToastItem } from '../types'

function CopyButton({ lines }: { lines: ChatLine[] }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    const text = lines.map(l => `${l.speaker === 'agent' ? 'Sofia' : 'Utente'}: ${l.text}`).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={handle} style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 6,
      border: '1px solid var(--border)',
      background: copied ? 'rgba(110,231,183,.15)' : 'var(--surface)',
      color: copied ? '#6ee7b7' : 'var(--text2)',
      fontSize: 11, fontWeight: 500, cursor: 'pointer',
      transition: 'background .2s, color .2s, border-color .2s',
      borderColor: copied ? '#6ee7b7' : undefined,
    }}>
      {copied
        ? <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
        : <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>
      }
      {copied ? 'Copiato!' : 'Copia'}
    </button>
  )
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const q = query.toLowerCase()
  const parts: React.ReactNode[] = []
  const lower = text.toLowerCase()
  let last = 0, idx = lower.indexOf(q)
  while (idx !== -1) {
    if (idx > last) parts.push(text.slice(last, idx))
    parts.push(<mark key={idx} style={{ background: 'var(--accent)', color: '#000', borderRadius: 2, padding: '0 1px' }}>{text.slice(idx, idx + query.length)}</mark>)
    last = idx + query.length
    idx = lower.indexOf(q, last)
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

function parseLabel(label: string): { caller: string } {
  const parts = label.split('—').map(p => p.trim())
  return { caller: parts[2] ?? '' }
}

// Filename format: YYYYMMDD_HHMMSS_... — server-local time, no conversion
function parseFnTs(filename: string): string {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/)
  if (!m) return ''
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`
}

interface ChatLine { speaker: 'agent' | 'user'; text: string }

function parseChat(raw: string): ChatLine[] {
  const lines: ChatLine[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('AGENTE:')) {
      const text = line.slice(7).trim()
      if (text && !text.includes('<ctrl')) lines.push({ speaker: 'agent', text })
    } else if (line.startsWith('UTENTE:')) {
      const text = line.slice(7).trim()
      if (text) lines.push({ speaker: 'user', text })
    }
  }
  return lines
}

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const PAGE_SIZE = 8

export function Calls({ addToast }: Props) {
  const [transcripts, setTranscripts] = useState<TranscriptMeta[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cache, setCache]       = useState<Record<string, string>>({})
  const [fetching, setFetching] = useState<Set<string>>(new Set())
  const [page, setPage]         = useState(0)
  const [dateFilter, setDateFilter] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [bgFetching, setBgFetching] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const list = await apiGet<TranscriptMeta[]>('/transcripts')
      setTranscripts(list ?? [])
    } catch { setTranscripts([]) }
    finally { if (showSpinner) setLoading(false) }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 600))])
    setRefreshing(false)
  }, [load])

  useEffect(() => { load() }, [load])

  const toggleExpand = async (filename: string) => {
    if (expanded === filename) { setExpanded(null); return }
    setExpanded(filename)
    if (!cache[filename] && !fetching.has(filename)) {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setFetching(p => new Set(p).add(filename))
      try {
        const res = await fetch(`/transcripts/${encodeURIComponent(filename)}`, { signal: ctrl.signal })
        const text = await res.text()
        setCache(p => ({ ...p, [filename]: text }))
      } catch (err) {
        if (!(err instanceof Error) || err.name !== 'AbortError')
          addToast('error', 'Impossibile caricare la trascrizione.')
      } finally {
        setFetching(p => { const s = new Set(p); s.delete(filename); return s })
      }
    }
  }

  const isPhone = (label: string) => label.startsWith('📞') || !label.startsWith('🌐')

  const transcriptIndexMap = useMemo(() => {
    const m = new Map<string, number>()
    transcripts.forEach((t, i) => m.set(t.filename, i))
    return m
  }, [transcripts])

  const filtered = useMemo(() =>
    dateFilter
      ? transcripts.filter(t => toYMD(t.timestamp) === dateFilter)
      : transcripts,
    [transcripts, dateFilter]
  )

  const searchFetchedRef = useRef<Set<string>>(new Set())

  // When search is active, auto-fetch all uncached transcripts in background
  useEffect(() => {
    if (!searchQuery.trim()) return
    const toFetch = transcripts.filter(t =>
      !cache[t.filename] && !searchFetchedRef.current.has(t.filename)
    )
    if (!toFetch.length) return
    toFetch.forEach(t => searchFetchedRef.current.add(t.filename))
    setBgFetching(n => n + toFetch.length)
    toFetch.forEach(async (t) => {
      try {
        const res = await fetch(`/transcripts/${encodeURIComponent(t.filename)}`)
        const text = res.ok ? await res.text() : ''
        setCache(p => ({ ...p, [t.filename]: text }))
      } catch { /* silent */ }
      finally { setBgFetching(n => Math.max(0, n - 1)) }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, transcripts])

  const searched = useMemo(() => {
    if (!searchQuery.trim()) return filtered
    const q = searchQuery.toLowerCase()
    return filtered.filter(t => cache[t.filename]?.toLowerCase().includes(q) ?? false)
  }, [filtered, searchQuery, cache])

  const totalPages = Math.max(1, Math.ceil(searched.length / PAGE_SIZE))
  const paged = searched.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div ref={scrollRef} className="fade-in" style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>

      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16 }}>
        <div style={{ flexShrink: 0 }}>
          <h1 className="heading-display" style={{ fontSize: 28, marginBottom: 2 }}>Chiamate con Sofia</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Registrazioni e log delle sessioni vocali</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search box */}
          <div style={{ position: 'relative', width: 210 }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/>
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(0) }}
              placeholder="Cerca nelle trascrizioni…"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '6px 26px 6px 28px',
                borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface2)', color: 'var(--text)',
                fontSize: 12, fontFamily: 'var(--font)',
                transition: 'border-color .15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--border2)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(''); setPage(0) }}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 15, lineHeight: 1, padding: '0 2px' }}>
                ×
              </button>
            )}
          </div>
          <div style={{ width: 180 }}>
            <DatePicker value={dateFilter} onChange={(v) => { setDateFilter(v); setPage(0) }} placeholder="Filtra per data…" />
          </div>
          <button onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna"
            style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: refreshing ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => { if (!refreshing) e.currentTarget.style.borderColor = 'var(--border2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}>
              <IcRefresh />
            </span>
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Trascrizioni ({searchQuery.trim() ? `${searched.length} trovate` : `${filtered.length}${dateFilter ? ` / ${transcripts.length}` : ''}`})
          </span>
          {bgFetching > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 400, color: 'var(--text3)', textTransform: 'none', letterSpacing: 0 }}>
              <span className="w-3 h-3 border border-gh-blue border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block', flexShrink: 0 }} />
              caricamento {bgFetching}…
            </span>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 12 }}>
            <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Caricamento…</span>
          </div>
        ) : searched.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            {searchQuery.trim() ? 'Nessuna trascrizione contiene questa parola.' : dateFilter ? 'Nessuna chiamata in questa data.' : 'Nessuna trascrizione disponibile. Le chiamate vengono salvate automaticamente.'}
            {(dateFilter || searchQuery) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 12, justifyContent: 'center' }}>
                {dateFilter && <button onClick={() => setDateFilter('')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>Rimuovi data</button>}
                {searchQuery && <button onClick={() => setSearchQuery('')} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font)' }}>Rimuovi ricerca</button>}
              </div>
            )}
          </div>
        ) : (
          <>
            {paged.map((t) => {
              const open = expanded === t.filename
              const phone = isPhone(t.label)
              const content = cache[t.filename]
              const isFetching = fetching.has(t.filename)
              const lines = open && content ? parseChat(content) : []
              const { caller } = parseLabel(t.label)
              const callerLabel = caller || (phone ? 'Chiamata anonima' : 'Sessione web')
              const globalIdx = transcriptIndexMap.get(t.filename) ?? 0
              const num = transcripts.length - globalIdx

              return (
                <div key={t.filename} style={{ borderBottom: '1px solid var(--border)' }}>
                  {/* Row */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={open}
                    onClick={() => toggleExpand(t.filename)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(t.filename) } }}
                    style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', transition: 'background .12s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                        background: 'var(--accent-dim)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--accent)',
                      }}>
                        {phone ? <IcPhone /> : <IcWeb />}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3, color: 'var(--text)' }}>
                          Trascrizione #{num}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 1 }}>{callerLabel}</div>
                        <div className="tabular" style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{parseFnTs(t.filename)}</div>
                      </div>
                    </div>
                    <div style={{ paddingTop: 3, color: 'var(--accent)' }}>
                      <IcChevron open={open} />
                    </div>
                  </div>

                  {/* Expanded transcript */}
                  {open && (
                    <div style={{ padding: '20px 20px 20px 70px', animation: 'fadeIn .2s ease' }}>
                      {isFetching ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--text3)', fontSize: 13 }}>
                          <div className="w-4 h-4 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
                          Caricamento trascrizione…
                        </div>
                      ) : (
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                          {lines.length > 0 && (
                            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                              <CopyButton lines={lines} />
                            </div>
                          )}
                          {lines.length === 0 ? (
                            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                              Nessun dialogo disponibile.
                            </div>
                          ) : lines.map((line, j) => (
                            <div key={j} style={{
                              padding: '12px 16px',
                              borderBottom: j < lines.length - 1 ? '1px solid var(--border)' : 'none',
                              display: 'flex', gap: 12, alignItems: 'flex-start',
                            }}>
                              <div style={{
                                width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                                background: line.speaker === 'agent' ? 'var(--accent)' : 'var(--success)',
                                boxShadow: `0 0 4px ${line.speaker === 'agent' ? 'var(--accent)' : 'var(--success)'}`,
                              }} />
                              <div>
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                  textTransform: 'uppercase',
                                  color: line.speaker === 'agent' ? 'var(--accent)' : 'var(--success)',
                                  marginRight: 8,
                                }}>
                                  {line.speaker === 'agent' ? 'Sofia' : 'Utente'}
                                </span>
                                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{highlight(line.text, searchQuery)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Pagination */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="tabular" style={{ fontSize: 12, color: 'var(--text3)' }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, searched.length)} di {searched.length}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: page === 0 ? 'var(--text3)' : 'var(--text)', fontSize: 12, cursor: page === 0 ? 'not-allowed' : 'pointer' }}>← Prec</button>
                <span style={{ padding: '5px 12px', fontSize: 12, color: 'var(--text2)' }}>{page + 1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: page >= totalPages - 1 ? 'var(--text3)' : 'var(--text)', fontSize: 12, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Succ →</button>
              </div>
            </div>
          </>
        )}
      </div>
      <ScrollToTop containerRef={scrollRef} />
    </div>
  )
}
