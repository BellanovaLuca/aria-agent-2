import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiPost } from '../hooks/useApi'
import { ScrollToTop } from '../components/ScrollToTop'
import { IcRefresh, IcStar, IcSparkles } from '../components/icons'
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

export function Analytics({ addToast, onOpenTranscript }: Props) {
  const [analyses, setAnalyses] = useState<TranscriptAnalysis[]>([])
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
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

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true)
    try {
      const res = await apiPost<{ analyzed: string[]; remaining: number }>('/analytics/analyze', {})
      if (res.analyzed.length === 0) {
        addToast('info', 'Nessuna nuova trascrizione da analizzare.')
      } else {
        addToast('success', `Analizzate ${res.analyzed.length} trascrizioni${res.remaining > 0 ? `, ${res.remaining} rimaste` : ''}.`)
      }
      load(false)
    } catch (e: unknown) {
      addToast('error', `Analisi fallita: ${e instanceof Error ? e.message : e}`)
    } finally {
      setAnalyzing(false)
    }
  }, [addToast, load])

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>Analisi delle chiamate</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Qualità, esito e sentiment estratti dalle trascrizioni con AI</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={runAnalysis} disabled={analyzing}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: analyzing ? 'default' : 'pointer', boxShadow: '0 4px 14px var(--accent-glow)', opacity: analyzing ? 0.7 : 1 }}>
            {analyzing
              ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block' }} />
              : <IcSparkles size={15} />}
            {analyzing ? 'Analisi in corso…' : 'Analizza trascrizioni'}
          </button>
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
                Nessuna analisi. Premi <strong>Analizza trascrizioni</strong> per generarle dalle chiamate registrate.
              </div>
            ) : (
              analyses.map((a) => (
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
              ))
            )}
          </div>
        </>
      )}

      <ScrollToTop containerRef={scrollRef} />
    </div>
  )
}
