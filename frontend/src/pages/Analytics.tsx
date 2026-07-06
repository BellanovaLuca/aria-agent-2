import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost } from '../hooks/useApi'
import { ScrollToTop } from '../components/ScrollToTop'
import { IcRefresh, IcStar } from '../components/icons'
import type { TranscriptAnalysis, AnalyticsSummary, ToastItem } from '../types'

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
  onOpenTranscript?: (filename: string) => void
}

const OUTCOME_META: Record<string, { label: string; color: string }> = {
  risolto:     { label: 'Risolto',     color: 'var(--success)' },
  non_risolto: { label: 'Non risolto', color: 'var(--danger)' },
  escalation:  { label: 'Escalation',  color: 'var(--warn)' },
}
const SENTIMENT_META: Record<string, { label: string; color: string }> = {
  positivo: { label: 'Positivo', color: 'var(--success)' },
  neutro:   { label: 'Neutro',   color: '#8b96a5' },
  negativo: { label: 'Negativo', color: 'var(--danger)' },
}
const INTENT_LABEL: Record<string, string> = {
  reset_password: 'Reset password',
  sblocco: 'Sblocco',
  domanda: 'Domanda',
  altro: 'Altro',
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>{label}</span>
  )
}

function Stars({ score }: { score: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, color: score >= 4 ? 'var(--success)' : score >= 3 ? 'var(--warn)' : 'var(--danger)' }}>
      {[1, 2, 3, 4, 5].map(i => <IcStar key={i} size={13} filled={i <= score} />)}
    </span>
  )
}

function Distribution({ title, data, meta }: { title: string; data: Record<string, number>; meta?: Record<string, { label: string; color: string }> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0)
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(([key, val]) => {
            const color = meta?.[key]?.color ?? 'var(--accent)'
            const label = meta?.[key]?.label ?? INTENT_LABEL[key] ?? key
            const pct = total > 0 ? Math.round(val / total * 100) : 0
            return (
              <div key={key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text2)' }}>{label}</span>
                  <span className="tabular" style={{ color: 'var(--text3)' }}>{val} · {pct}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surface3)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 8

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label="Analisi automatica"
      onClick={() => onChange(!on)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', padding: 2,
        background: on ? 'var(--accent)' : 'var(--surface3)', transition: 'background .2s',
        display: 'flex', alignItems: 'center', flexShrink: 0,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform .2s',
        boxShadow: '0 1px 3px rgba(0,0,0,.3)',
      }} />
    </button>
  )
}

export function Analytics({ addToast, onOpenTranscript }: Props) {
  const [analyses, setAnalyses] = useState<TranscriptAnalysis[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [auto, setAuto] = useState(() => localStorage.getItem('aria-analytics-auto') === 'true')
  const [page, setPage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true)
    try {
      const [a, s] = await Promise.all([
        apiGet<TranscriptAnalysis[]>('/analytics/analyses'),
        apiGet<AnalyticsSummary>('/analytics/summary'),
      ])
      setAnalyses(a ?? [])
      setSummary(s)
      setLoadError(null)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      if (spinner) setLoading(false)
    }
  }, [])

  useEffect(() => { load(true) }, [load])
  useEffect(() => { localStorage.setItem('aria-analytics-auto', String(auto)) }, [auto])

  // Analizza solo le trascrizioni non ancora processate: il backend /analyze
  // considera già i soli "pending", quindi non rifà lavoro fatto in passato.
  const analyzePending = useCallback(async () => {
    setAnalyzing(true)
    try {
      const res = await apiPost<{ analyzed: string[]; remaining: number }>('/analytics/analyze', {})
      if (res.analyzed.length > 0) await load(false)
    } catch { /* in automatico: silenzioso, riprova al giro successivo */ }
    finally { setAnalyzing(false) }
  }, [load])

  // Quando l'analisi automatica è attiva: processa subito i pending e poi
  // ricontrolla periodicamente se ne arrivano di nuovi (es. nuove chiamate).
  useEffect(() => {
    if (!auto) return
    let active = true
    const tick = () => { if (active) analyzePending() }
    tick()
    const id = setInterval(tick, 20_000)
    return () => { active = false; clearInterval(id) }
  }, [auto, analyzePending])

  const totalPages = Math.max(1, Math.ceil(analyses.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const paged = analyses.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>Analisi delle chiamate</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Qualità, esito e sentiment estratti dalle trascrizioni con AI</p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Toggle on={auto} onChange={(v) => { setAuto(v); addToast('info', v ? 'Analisi automatica attivata.' : 'Analisi automatica disattivata.') }} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Analisi automatica</span>
              <span style={{ fontSize: 11, color: auto ? 'var(--success)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                {auto && analyzing && <span className="w-3 h-3 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block' }} />}
                {auto ? (analyzing ? 'analisi in corso…' : 'attiva') : 'disattivata'}
              </span>
            </div>
          </div>
          <button onClick={() => load(false)} aria-label="Aggiorna" className="btn-icon"
            style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: 'pointer', display: 'flex' }}>
            <IcRefresh />
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
          <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
          <span style={{ color: 'var(--text3)', fontSize: 13 }}>Caricamento…</span>
        </div>
      ) : loadError ? (
        <div style={{ padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 8 }}>Impossibile caricare le analisi</div>
          <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)' }}>{loadError}</div>
        </div>
      ) : (
        <>
          {/* Sintesi */}
          <div className="section-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Trascrizioni analizzate</div>
              <div className="tabular" style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>{summary?.total ?? 0}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>Qualità media</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tabular" style={{ fontSize: 32, fontWeight: 700, color: 'var(--text)' }}>{summary?.avg_quality?.toFixed(1) ?? '—'}</span>
                {summary && summary.total > 0 && <Stars score={Math.round(summary.avg_quality)} />}
              </div>
            </div>
            <Distribution title="Esiti" data={summary?.by_outcome ?? {}} meta={OUTCOME_META} />
            <Distribution title="Sentiment" data={summary?.by_sentiment ?? {}} meta={SENTIMENT_META} />
            <Distribution title="Motivo del contatto" data={summary?.by_intent ?? {}} />
          </div>

          {/* Elenco analisi */}
          <div className="section-in" style={{ animationDelay: '80ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>Dettaglio ({analyses.length})</span>
            </div>
            {analyses.length === 0 ? (
              <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
                {auto
                  ? 'Nessuna analisi ancora. Le chiamate registrate vengono analizzate automaticamente.'
                  : <>Analisi disattivata. Attiva l&apos;<strong>Analisi automatica</strong> qui sopra per generarle dalle chiamate registrate.</>}
              </div>
            ) : (
              <>
                {paged.map((a) => (
                  <div key={a.filename} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.label}</span>
                      <Chip label={INTENT_LABEL[a.intent] ?? a.intent} color="var(--accent)" />
                      <Chip label={OUTCOME_META[a.outcome]?.label ?? a.outcome} color={OUTCOME_META[a.outcome]?.color ?? '#8b96a5'} />
                      <Chip label={SENTIMENT_META[a.sentiment]?.label ?? a.sentiment} color={SENTIMENT_META[a.sentiment]?.color ?? '#8b96a5'} />
                      <span style={{ marginLeft: 'auto' }}><Stars score={a.quality_score} /></span>
                    </div>
                    <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 5 }}>{a.summary}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', marginBottom: onOpenTranscript ? 8 : 0 }}>{a.quality_notes}</div>
                    {onOpenTranscript && (
                      <button
                        onClick={() => onOpenTranscript(a.filename)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}
                      >
                        Vedi trascrizione →
                      </button>
                    )}
                  </div>
                ))}
                {totalPages > 1 && (
                  <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="tabular" style={{ fontSize: 12, color: 'var(--text3)' }}>
                      {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, analyses.length)} di {analyses.length}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: safePage === 0 ? 'var(--text3)' : 'var(--text)', fontSize: 12, cursor: safePage === 0 ? 'not-allowed' : 'pointer' }}>← Prec</button>
                      <span className="tabular" style={{ padding: '5px 12px', fontSize: 12, color: 'var(--text2)' }}>{safePage + 1} / {totalPages}</span>
                      <button onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))} disabled={safePage >= totalPages - 1}
                        style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface2)', color: safePage >= totalPages - 1 ? 'var(--text3)' : 'var(--text)', fontSize: 12, cursor: safePage >= totalPages - 1 ? 'not-allowed' : 'pointer' }}>Succ →</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      <ScrollToTop containerRef={scrollRef} />
    </div>
  )
}
