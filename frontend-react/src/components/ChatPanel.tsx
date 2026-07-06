import { useState, useRef, useEffect, useCallback } from 'react'
import { apiPost, apiDelete } from '../hooks/useApi'
import { IcChat, IcSend, IcClose } from './icons'

interface Msg {
  role: 'user' | 'assistant'
  text: string
}

const GREETING: Msg = {
  role: 'assistant',
  text: 'Ciao! Sono Sofia del supporto IT. Posso aiutarti con reset password, sblocco di un account o domande sui servizi IT. Come posso aiutarti?',
}

export function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const sessionId = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text }])
    setSending(true)
    try {
      const res = await apiPost<{ session_id: string; reply: string }>('/chat/message', {
        session_id: sessionId.current,
        text,
      })
      sessionId.current = res.session_id
      setMessages(m => [...m, { role: 'assistant', text: res.reply }])
    } catch (e: unknown) {
      setMessages(m => [...m, { role: 'assistant', text: `⚠️ ${e instanceof Error ? e.message : 'Errore di rete'}` }])
    } finally {
      setSending(false)
    }
  }, [input, sending])

  const resetConversation = useCallback(async () => {
    const id = sessionId.current
    sessionId.current = null
    setMessages([GREETING])
    setInput('')
    if (id) { try { await apiDelete(`/chat/sessions/${id}`) } catch { /* best effort */ } }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Chat con Sofia"
          style={{
            position: 'fixed', bottom: 88, right: 88, zIndex: 50,
            width: 360, maxWidth: 'calc(100vw - 112px)', height: 480, maxHeight: 'calc(100vh - 140px)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px var(--accent-glow)',
            overflow: 'hidden', animation: 'callPanelIn .22s cubic-bezier(.16,1,.3,1)',
            fontFamily: 'var(--font)',
          }}
        >
          {/* Header */}
          <div style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent-dim)', border: '1px solid var(--accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              <IcChat size={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Sofia</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Assistente IT · chat</div>
            </div>
            <button onClick={resetConversation} title="Nuova conversazione" aria-label="Nuova conversazione" className="btn-ghost"
              style={{ padding: 6, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
              Reset
            </button>
            <button onClick={() => setOpen(false)} title="Chiudi" aria-label="Chiudi chat" className="btn-ghost"
              style={{ padding: 6, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex' }}>
              <IcClose />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '9px 12px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ padding: '11px 14px', borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text3)', animation: `waveBar 1s ease-in-out ${i * 0.15}s infinite` }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: '1px solid var(--border)', padding: 10, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Scrivi un messaggio…"
              rows={1}
              style={{
                flex: 1, resize: 'none', maxHeight: 96, padding: '9px 12px', borderRadius: 10,
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                fontSize: 13.5, fontFamily: 'var(--font)', outline: 'none', lineHeight: 1.4,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            <button onClick={send} disabled={!input.trim() || sending} aria-label="Invia messaggio"
              style={{
                width: 40, height: 40, borderRadius: 10, border: 'none', flexShrink: 0,
                background: input.trim() && !sending ? 'var(--accent)' : 'var(--surface3)',
                color: input.trim() && !sending ? '#fff' : 'var(--text3)',
                cursor: input.trim() && !sending ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .15s',
              }}>
              <IcSend />
            </button>
          </div>
        </div>
      )}

      {/* FAB — a sinistra del pulsante chiamata */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Chiudi chat' : 'Apri chat con Sofia'}
        title={open ? 'Chiudi chat' : 'Chat con Sofia'}
        className="touch-target"
        style={{
          position: 'fixed', bottom: 24, right: 88, zIndex: 51,
          width: 52, height: 52, borderRadius: '50%', border: '1px solid var(--border2)',
          background: open ? 'var(--surface2)' : 'var(--surface)',
          color: open ? 'var(--accent)' : 'var(--text2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,.35)', transition: 'transform .15s, background .2s, color .2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        <IcChat size={20} />
      </button>
    </>
  )
}
