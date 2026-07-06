import { useState, useEffect, useCallback, useRef } from 'react'
import { apiGet, apiDelete, apiPost, apiUpload } from '../hooks/useApi'
import { ScrollToTop } from '../components/ScrollToTop'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IcRefresh, IcTrash, IcUpload, IcSearch, IcChevron } from '../components/icons'
import { fmtTs } from '../utils'
import type { KnowledgeDoc, KnowledgeHit, ToastItem } from '../types'

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const ACCEPT = '.pdf,.md,.txt'

export function Knowledge({ addToast }: Props) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeDoc | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [content, setContent] = useState<Record<string, string>>({})
  const [loadingContent, setLoadingContent] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<KnowledgeHit[] | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (spinner = true) => {
    if (spinner) setLoading(true)
    setLoadError(null)
    try {
      setDocs(await apiGet<KnowledgeDoc[]>('/knowledge/documents') ?? [])
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      if (spinner) setLoading(false)
    }
  }, [])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 600))])
    setRefreshing(false)
  }, [load])

  useEffect(() => { load() }, [load])

  // Espande un documento e ne carica il contenuto (ricostruito dai chunk).
  const toggleDoc = useCallback(async (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (content[id] === undefined) {
      setLoadingContent(id)
      try {
        const res = await apiGet<{ text: string }>(`/knowledge/documents/${id}/content`)
        setContent(c => ({ ...c, [id]: res.text }))
      } catch {
        addToast('error', 'Impossibile caricare il contenuto del documento.')
        setContent(c => ({ ...c, [id]: '' }))
      } finally {
        setLoadingContent(null)
      }
    }
  }, [expanded, content, addToast])

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const doc = await apiUpload<KnowledgeDoc>('/knowledge/documents', file)
      addToast('success', `"${doc.filename}" indicizzato in ${doc.chunk_count} frammenti.`)
      load(false)
    } catch (e: unknown) {
      addToast('error', `Upload fallito: ${e instanceof Error ? e.message : e}`)
    } finally {
      setUploading(false)
    }
  }, [addToast, load])

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  }

  const handleDeleteConfirmed = useCallback(async () => {
    if (!deleteTarget) return
    const doc = deleteTarget
    setDeleteTarget(null)
    try {
      await apiDelete(`/knowledge/documents/${doc.id}`)
      addToast('success', `"${doc.filename}" eliminato.`)
      load(false)
    } catch (e: unknown) {
      addToast('error', `Errore: ${e instanceof Error ? e.message : e}`)
    }
  }, [deleteTarget, addToast, load])

  const runSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await apiPost<{ hits: KnowledgeHit[] }>('/knowledge/search', { query: query.trim(), top_k: 3 })
      setHits(res.hits ?? [])
    } catch (e: unknown) {
      addToast('error', `Ricerca fallita: ${e instanceof Error ? e.message : e}`)
    } finally {
      setSearching(false)
    }
  }, [query, addToast])

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>Knowledge Base</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Documenti su cui l'assistente risponde alle domande IT</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna" className="btn-icon"
          style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: refreshing ? 'default' : 'pointer', display: 'flex', alignItems: 'center' }}>
          <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}><IcRefresh /></span>
        </button>
      </div>

      {/* Upload zone */}
      <div
        className="section-in"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileRef.current?.click() } }}
        style={{
          marginBottom: 20, padding: '28px 24px', borderRadius: 12, cursor: uploading ? 'default' : 'pointer',
          border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
          background: dragOver ? 'var(--accent-dim)' : 'var(--surface)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <input ref={fileRef} type="file" accept={ACCEPT} onChange={onPick} style={{ display: 'none' }} />
        <span style={{ color: dragOver ? 'var(--accent)' : 'var(--text3)', display: 'flex' }}>
          {uploading
            ? <span className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" style={{ display: 'inline-block' }} />
            : <IcUpload size={22} />}
        </span>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>
          {uploading ? 'Indicizzazione in corso…' : 'Trascina un documento o clicca per selezionarlo'}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>PDF, Markdown o testo · max 10 MB</span>
      </div>

      {/* Search */}
      <div className="section-in" style={{ animationDelay: '40ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
          Prova una ricerca
        </div>
        <form onSubmit={runSearch} style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', display: 'flex', pointerEvents: 'none' }}>
              <IcSearch />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Es. come mi collego alla VPN?"
              style={{
                width: '100%', padding: '9px 12px 9px 32px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 14,
                fontFamily: 'var(--font)', boxSizing: 'border-box', transition: 'border-color .15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
          </div>
          <button type="submit" disabled={searching || !query.trim()}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: searching || !query.trim() ? 'not-allowed' : 'pointer', opacity: searching || !query.trim() ? 0.6 : 1 }}>
            {searching ? 'Cerco…' : 'Cerca'}
          </button>
        </form>

        {hits !== null && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {hits.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text3)', textAlign: 'center', padding: '12px 0' }}>
                Nessun passaggio pertinente. L'assistente risponderebbe di non avere l'informazione.
              </div>
            ) : hits.map((h, i) => (
              <div key={`${h.doc_id}-${h.chunk_index}-${i}`} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{h.filename}</span>
                  <span className="tabular" style={{ fontSize: 11, color: 'var(--text3)' }}>rilevanza {(h.score * 100).toFixed(0)}%</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{h.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document list */}
      <div className="section-in" style={{ animationDelay: '80ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>
            Documenti ({docs.length})
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 12 }}>
            <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Caricamento…</span>
          </div>
        ) : loadError ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 8 }}>Impossibile caricare i documenti</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 16 }}>{loadError}</div>
            <button onClick={() => load()} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>↺ Riprova</button>
          </div>
        ) : docs.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            Nessun documento indicizzato. Caricane uno per abilitare la Q&A dell'assistente.
          </div>
        ) : (
          docs.map((d) => {
            const isOpen = expanded === d.id
            return (
              <div key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => toggleDoc(d.id)} aria-expanded={isOpen}
                    style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    <span style={{ color: 'var(--text3)', display: 'flex', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
                      <IcChevron open={false} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 3, wordBreak: 'break-all' }}>{d.filename}</span>
                      <span className="tabular" style={{ fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 16 }}>
                        <span>{d.chunk_count} frammenti</span>
                        <span>Caricato: {fmtTs(d.uploaded_at)}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => setDeleteTarget(d)}
                    aria-label={`Elimina ${d.filename}`}
                    style={{ padding: 8, borderRadius: 8, background: 'var(--danger-dim)', border: '1px solid #f8717140', color: 'var(--danger)', cursor: 'pointer', display: 'flex', flexShrink: 0, transition: 'background .15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f8717130' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-dim)' }}
                  >
                    <IcTrash />
                  </button>
                </div>
                {isOpen && (
                  <div style={{ padding: '0 20px 16px 44px' }}>
                    {loadingContent === d.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text3)', fontSize: 13, padding: '8px 0' }}>
                        <div className="w-4 h-4 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" /> Caricamento contenuto…
                      </div>
                    ) : (
                      <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', maxHeight: 360, overflowY: 'auto', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {content[d.id] || '(nessun testo estraibile)'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <ScrollToTop containerRef={scrollRef} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Elimina documento"
        message={`Eliminare "${deleteTarget?.filename}" dalla knowledge base? L'assistente non potrà più usarlo.`}
        confirmLabel="Elimina"
        danger
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
