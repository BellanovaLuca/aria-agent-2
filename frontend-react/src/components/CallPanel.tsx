import { useState, useEffect, useRef } from 'react'
import type { Room } from 'livekit-client'

type CallState = 'idle' | 'ready' | 'connecting' | 'active' | 'error'
type AgentStatus = 'waiting' | 'online'

const BARS = [0.28, 0.50, 0.70, 0.90, 1.0, 0.88, 0.72, 0.50, 0.30]

function MicIcon({ size = 20, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="9"  y1="22" x2="15" y2="22"/>
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" fill="currentColor"/>
    </svg>
  )
}

function Waveform({ active }: { active: boolean }) {
  const baseH = 44
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 4, height: baseH + 16,
    }}>
      {BARS.map((scale, i) => (
        <div key={i} style={{
          width: 5,
          height: baseH * scale,
          borderRadius: 3,
          background: 'var(--accent)',
          transformOrigin: 'center',
          transform: active ? undefined : 'scaleY(0.2)',
          boxShadow: active ? '0 0 8px var(--accent-glow)' : 'none',
          animation: active
            ? `waveBar ${0.55 + (i % 4) * 0.13}s ease-in-out ${i * 0.065}s infinite`
            : 'none',
          transition: 'transform .35s ease, box-shadow .3s ease',
        }} />
      ))}
    </div>
  )
}

export function CallPanel() {
  const [state, setState]             = useState<CallState>('idle')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('waiting')
  const [errorMsg, setErrorMsg]       = useState('')
  const roomRef  = useRef<Room | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const cleanup = () => {
    audioRef.current?.pause()
    audioRef.current = null
    roomRef.current  = null
    setAgentStatus('waiting')
    setState('idle')
  }

  const startCall = async () => {
    setState('connecting')
    setErrorMsg('')
    setAgentStatus('waiting')

    let tokenData: { token: string; url: string }
    try {
      const resp = await fetch('/token')
      if (!resp.ok) throw new Error(await resp.text())
      tokenData = await resp.json()
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Errore di rete')
      setState('error')
      return
    }

    /* Lazy-load livekit — not bundled until first call */
    const { Room: RoomClass, RoomEvent, Track } = await import('livekit-client')
    const room = new RoomClass()
    roomRef.current = room

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach() as HTMLAudioElement
        el.autoplay = true
        document.body.appendChild(el)
        audioRef.current = el
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach()
      audioRef.current?.remove()
      audioRef.current = null
    })

    room.on(RoomEvent.Disconnected, () => cleanup())

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (participant.isAgent) setAgentStatus('online')
    })

    try {
      await room.connect(tokenData.url, tokenData.token)
      await room.localParticipant.setMicrophoneEnabled(true)
      setState('active')
      const alreadyOnline = [...room.remoteParticipants.values()].some(p => p.isAgent)
      if (alreadyOnline) setAgentStatus('online')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'Connessione fallita')
      setState('error')
      roomRef.current = null
    }
  }

  const endCall = async () => {
    await roomRef.current?.disconnect()
    cleanup()
  }

  useEffect(() => () => { roomRef.current?.disconnect() }, [])

  const panelOpen = state !== 'idle'
  const isActive  = state === 'active'

  const statusText =
    state === 'connecting'                      ? 'Connessione in corso…' :
    state === 'error'                           ? 'Connessione fallita'        :
    isActive && agentStatus === 'online'        ? 'In ascolto…'           :
    isActive                                    ? 'In attesa di Sofia…'   :
    'Assistente AI vocale'

  const statusColor =
    state === 'error'                    ? 'var(--danger)' :
    isActive && agentStatus === 'online' ? 'var(--success)' :
    isActive                             ? 'var(--warn)'   :
    'var(--text3)'

  const quoteText =
    isActive && agentStatus === 'online'
      ? '“Ciao, sono Sofia. Come posso aiutarti?”'
      : isActive
        ? 'In attesa che Sofia entri in linea…'
        : state === 'error'
          ? errorMsg || 'Siè verificato un errore.'
          : 'Avvia la chiamata per parlare con Sofia'

  return (
    <>
      {/* Panel — dark-themed, cohesive with app surface */}
      {panelOpen && (
        <div
          role="dialog"
          aria-label="Chiamata con Sofia"
          style={{
            position: 'fixed', bottom: 88, right: 24, zIndex: 50,
            width: 316,
            background: 'var(--surface)',
            border: '1px solid var(--border2)',
            borderRadius: 20,
            boxShadow: '0 24px 64px rgba(0,0,0,.55), 0 0 0 1px var(--accent-glow)',
            overflow: 'hidden',
            animation: 'callPanelIn .22s cubic-bezier(.16,1,.3,1)',
            fontFamily: 'var(--font)',
          }}
        >
          {/* Header strip */}
          <div style={{
            background: 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
            padding: '10px 16px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusColor,
              boxShadow: `0 0 8px ${statusColor}`,
              flexShrink: 0,
              animation: isActive && agentStatus === 'online' ? 'fabPulse 2s ease-in-out infinite' : 'none',
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', flex: 1 }}>
              {statusText}
            </span>
          </div>

          {/* Avatar + name */}
          <div style={{ padding: '22px 24px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--accent-dim)',
              border: `1px solid ${isActive && agentStatus === 'online' ? 'var(--accent)' : 'var(--border2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
              color: 'var(--accent)',
              boxShadow: isActive && agentStatus === 'online'
                ? '0 0 0 6px var(--accent-dim), 0 0 24px var(--accent-glow)'
                : 'none',
              transition: 'box-shadow .5s ease, border-color .3s',
            }}>
              <MicIcon size={20} />
            </div>

            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Sofia
            </div>
          </div>

          {/* Waveform */}
          <div style={{ padding: '0 24px 4px' }}>
            <Waveform active={isActive && agentStatus === 'online'} />
          </div>

          {/* Quote */}
          <div style={{
            padding: '4px 28px 18px',
            fontSize: 13, color: state === 'error' ? 'var(--danger)' : 'var(--text3)',
            textAlign: 'center', lineHeight: 1.55,
            fontStyle: isActive && agentStatus === 'online' ? 'italic' : 'normal',
            minHeight: 52,
          }}>
            {quoteText}
          </div>

          {/* Action */}
          <div style={{ padding: '0 20px 20px' }}>
            {(state === 'ready' || state === 'error') ? (
              <button
                onClick={startCall}
                className="touch-target"
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 12,
                  background: 'var(--accent)', border: '1px solid var(--accent-glow)',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 16px var(--accent-glow)', letterSpacing: 0.2,
                  transition: 'opacity .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                {state === 'error' ? 'Riprova' : 'Avvia chiamata'}
              </button>
            ) : state === 'connecting' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '11px 0', color: 'var(--text3)', fontSize: 13 }}>
                <div className="w-4 h-4 border-2 border-gh-blue border-t-transparent rounded-full animate-spin" />
                Connessione in corso…
              </div>
            ) : (
              <button
                onClick={endCall}
                className="touch-target"
                style={{
                  width: '100%', padding: '11px 0', borderRadius: 12,
                  background: 'var(--danger-dim)',
                  border: '1px solid #f8717140',
                  color: 'var(--danger)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'background .15s, border-color .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8717130'; e.currentTarget.style.borderColor = 'var(--danger)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--danger-dim)'; e.currentTarget.style.borderColor = '#f8717140' }}
              >
                Termina chiamata
              </button>
            )}
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={
          state === 'idle'       ? () => setState('ready') :
          state === 'active'     ? endCall :
          state === 'connecting' ? () => { roomRef.current?.disconnect(); cleanup() } :
          ()                      => setState('idle')
        }
        aria-label={isActive ? 'Termina chiamata' : 'Avvia chiamata con Sofia'}
        title={isActive ? 'Termina chiamata' : 'Chiama Sofia'}
        className="touch-target"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 51,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: isActive ? 'var(--danger)' : 'var(--accent)',
          color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          animation: isActive ? 'fabPulse 1.8s ease-in-out infinite' : 'none',
          boxShadow: isActive
            ? '0 0 0 3px rgba(239,68,68,.25), 0 4px 16px rgba(239,68,68,.5)'
            : '0 4px 20px var(--accent-glow)',
          transition: 'background .3s, box-shadow .3s, transform .15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)' }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)' }}
      >
        {isActive ? <StopIcon /> : <MicIcon size={20} />}
      </button>
    </>
  )
}
