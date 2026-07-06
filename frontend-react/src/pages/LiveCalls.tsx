import { useState, useEffect, useCallback, useRef } from 'react'
import type { Room } from 'livekit-client'
import { apiGet } from '../hooks/useApi'
import { ScrollToTop } from '../components/ScrollToTop'
import { IcRefresh, IcHeadset, IcPhone } from '../components/icons'
import { fmtTs } from '../utils'
import type { LiveRoom, ToastItem } from '../types'

interface Props {
  addToast: (type: ToastItem['type'], msg: string) => void
}

const POLL_MS = 4000

export function LiveCalls({ addToast }: Props) {
  const [rooms, setRooms] = useState<LiveRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [joining, setJoining] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const roomRef = useRef<Room | null>(null)
  const audioEls = useRef<HTMLAudioElement[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setInterval>>()

  const load = useCallback(async (spinner = false) => {
    if (spinner) setLoading(true)
    try {
      setRooms(await apiGet<LiveRoom[]>('/api/rooms') ?? [])
      setLoadError(null)
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Errore di rete')
    } finally {
      if (spinner) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(true)
    timer.current = setInterval(() => load(false), POLL_MS)
    return () => clearInterval(timer.current)
  }, [load])

  const cleanupAudio = () => {
    audioEls.current.forEach(el => { el.pause(); el.remove() })
    audioEls.current = []
  }

  const leave = useCallback(async () => {
    try { await roomRef.current?.disconnect() } catch { /* ignore */ }
    roomRef.current = null
    cleanupAudio()
    setActiveRoom(null)
    setMuted(false)
  }, [])

  // Disconnetti alla smontatura della pagina.
  useEffect(() => () => { roomRef.current?.disconnect(); cleanupAudio() }, [])

  const takeOver = useCallback(async (roomName: string) => {
    if (activeRoom) await leave()
    setJoining(roomName)
    try {
      const tok = await apiGet<{ token: string; url: string }>(`/api/operator-token?room=${encodeURIComponent(roomName)}`)
      const { Room: RoomClass, RoomEvent, Track } = await import('livekit-client')
      const room = new RoomClass()
      roomRef.current = room

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach() as HTMLAudioElement
          el.autoplay = true
          document.body.appendChild(el)
          audioEls.current.push(el)
        }
      })
      room.on(RoomEvent.Disconnected, () => { cleanupAudio(); setActiveRoom(null) })

      await room.connect(tok.url, tok.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setActiveRoom(roomName)
      addToast('success', `Sei in linea sulla chiamata ${roomName}.`)
      load(false)
    } catch (e: unknown) {
      addToast('error', `Ingresso fallito: ${e instanceof Error ? e.message : e}`)
      roomRef.current = null
    } finally {
      setJoining(null)
    }
  }, [activeRoom, leave, addToast, load])

  const toggleMute = useCallback(async () => {
    const lp = roomRef.current?.localParticipant
    if (!lp) return
    const next = !muted
    await lp.setMicrophoneEnabled(!next)
    setMuted(next)
  }, [muted])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([load(false), new Promise(r => setTimeout(r, 500))])
    setRefreshing(false)
  }, [load])

  const chip = (label: string, color: string) => (
    <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' }}>{label}</span>
  )

  return (
    <div ref={scrollRef} style={{ padding: '28px 32px', height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div className="section-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="heading-display" style={{ fontSize: 28, color: 'var(--text)', marginBottom: 4 }}>Chiamate Live</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)' }}>Conversazioni in corso — entra per prenderle in carico</p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing} aria-label="Aggiorna" className="btn-icon"
          style={{ color: 'var(--text2)', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', cursor: refreshing ? 'default' : 'pointer', display: 'flex' }}>
          <span style={{ display: 'flex' }} className={refreshing ? 'animate-spin' : ''}><IcRefresh /></span>
        </button>
      </div>

      {/* Barra operatore in linea */}
      {activeRoom && (
        <div className="section-in" style={{ marginBottom: 18, padding: '14px 18px', borderRadius: 12, background: 'var(--accent-dim)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} className="animate-pulse-dot" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Sei in linea · {activeRoom}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Stai parlando con il chiamante. L'assistente si è fatto da parte.</div>
          </div>
          <button onClick={toggleMute} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--surface2)', color: muted ? 'var(--warn)' : 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {muted ? 'Microfono muto' : 'Microfono attivo'}
          </button>
          <button onClick={leave} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #f8717140', background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Esci dalla chiamata
          </button>
        </div>
      )}

      {/* Lista room */}
      <div className="section-in" style={{ animationDelay: '60ms', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>
            Chiamate attive ({rooms.length})
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 20px', gap: 12 }}>
            <div className="w-5 h-5 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
            <span style={{ color: 'var(--text3)', fontSize: 13 }}>Caricamento…</span>
          </div>
        ) : loadError ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ color: 'var(--danger)', fontSize: 14, marginBottom: 8 }}>Impossibile leggere le chiamate live</div>
            <div style={{ color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--mono)', marginBottom: 6 }}>{loadError}</div>
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>Richiede LiveKit configurato nel <code>.env</code>.</div>
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 14 }}>
            Nessuna chiamata in corso. Le conversazioni vocali attive compaiono qui.
          </div>
        ) : (
          rooms.map((r) => {
            const isActive = activeRoom === r.name
            const isJoining = joining === r.name
            return (
              <div key={r.name} style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                  <IcPhone size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--mono)', marginBottom: 5 }}>{r.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {chip(`${r.num_participants} in linea`, '#8b96a5')}
                    {r.participants.some(p => p.is_agent) && chip('Assistente', 'var(--accent)')}
                    {r.has_operator && chip('Operatore presente', '#34d399')}
                    {r.created_at && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>dalle {fmtTs(r.created_at)}</span>}
                  </div>
                </div>
                {isActive ? (
                  chip('In carico da te', '#34d399')
                ) : (
                  <button
                    onClick={() => takeOver(r.name)}
                    disabled={isJoining || r.has_operator}
                    title={r.has_operator ? 'Un operatore è già in linea' : 'Entra nella chiamata'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8,
                      border: 'none', flexShrink: 0,
                      background: r.has_operator ? 'var(--surface3)' : 'var(--accent)',
                      color: r.has_operator ? 'var(--text3)' : '#fff',
                      fontSize: 13, fontWeight: 600, cursor: isJoining || r.has_operator ? 'default' : 'pointer',
                      opacity: isJoining ? 0.7 : 1,
                    }}>
                    <IcHeadset size={15} />
                    {isJoining ? 'Ingresso…' : 'Prendi in carico'}
                  </button>
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
