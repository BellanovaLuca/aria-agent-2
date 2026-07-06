"""
Voice Agent — canale telefonico del sistema di reset password.

Riceve chiamate SIP inoltrate da LiveKit Cloud, conduce una conversazione
vocale in italiano tramite Google Gemini Live e invoca i tool di reset.

Flusso infrastrutturale:
  Twilio (PSTN) → LiveKit Cloud (SIP→WebRTC) → questo processo
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# Carica .env dalla root del progetto prima di qualunque import LiveKit,
# altrimenti LIVEKIT_URL / GOOGLE_API_KEY non sono disponibili all'avvio.
load_dotenv(Path(__file__).parent.parent / ".env")

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents.llm import ChatMessage
from livekit.agents.voice.events import ConversationItemAddedEvent, UserInputTranscribedEvent
from livekit.plugins.google import realtime as google_realtime

# sys.path consente l'import di voice_agent.tools dalla root del progetto
sys.path.insert(0, str(Path(__file__).parent.parent))
from voice_agent.tools import reset_user_password

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# Ogni chiamata genera un file .txt in questa cartella
TRANSCRIPTS_DIR = Path(__file__).parent.parent / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

# ── Istruzioni di sistema per Gemini Live ─────────────────────────────────────
# Definisce identità, tono e flusso conversazionale dell'agente.
# Il nome "Sofia" e la personalità umana riducono la percezione di parlare
# con un bot e aumentano la disponibilità dell'utente a collaborare.

AGENT_NAME = "Sofia"

INSTRUCTIONS = f"""
Sei {AGENT_NAME}, l'assistente vocale del servizio IT aziendale per il reset delle password.
Non sei un robot: sei una persona gentile, paziente e competente che aiuta i colleghi
quando sono bloccati fuori dai loro account. Hai una voce calda e rassicurante.

Il tuo unico compito è aiutare gli utenti a resettare la loro password aziendale.
Nulla di più, nulla di meno — ma fallo con cura e attenzione.

Comportati così:
1. Saluta cordialmente e chiedi come puoi aiutare.
2. Quando l'utente chiede il reset, chiedi username o email con tono colloquiale.
   Se l'utente sembra confuso o frustrato, rassicuralo: è normale dimenticare le password,
   ci pensi tu.
3. Appena l'utente fornisce username o email, chiama IMMEDIATAMENTE il tool reset_user_password.
   NON pronunciare nessuna frase prima di chiamare il tool: niente "Verifico", "Eseguo",
   "Procedo", "Un momento" o simili. Chiama il tool in silenzio, poi parla solo dopo
   aver ricevuto il risultato.
   - Se l'utente non esiste: comunicalo e chiedi di verificare username/email.
   - Se l'account è bloccato o sospeso: comunicalo e suggerisci di contattare il supporto.
   - Se il reset è riuscito: di' all'utente che riceverà una email con la nuova password
     temporanea e che dovrà cambiarla al primo accesso.
4. Chiedi se c'è altro con cui puoi aiutare. Saluta in modo caldo e personale,
   non con frasi standardizzate. Augura una buona giornata.

Parla sempre in italiano. Sii cordiale, conciso e professionale.
Non fare altro che il reset password: se l'utente chiede cose diverse,
spiegagli gentilmente che puoi solo aiutarlo con il reset della password.
""".strip()


# ── Agente ────────────────────────────────────────────────────────────────────

class PasswordResetAgent(Agent):
    """Agente vocale LiveKit specializzato nel reset password.

    Eredita da Agent e registra i tool functions che Gemini Live
    può invocare autonomamente durante la conversazione.
    """

    def __init__(self) -> None:
        super().__init__(
            instructions=INSTRUCTIONS,
            tools=[reset_user_password],
        )

    async def on_enter(self) -> None:
        """Chiamato da LiveKit appena l'agente entra nella room.

        Genera il saluto iniziale invece di aspettare che sia l'utente
        a parlare per primo — comportamento atteso in un centralino automatico.
        """
        await self.session.generate_reply(
            instructions=(
                f"Sei {AGENT_NAME}. Saluta il chiamante in modo caldo e naturale, "
                f"presentati come {AGENT_NAME} del supporto IT e chiedi come puoi aiutarlo. "
                "Non sembrare un robot: sii spontanea e umana fin dalla prima parola."
            )
        )


# ── Entrypoint ────────────────────────────────────────────────────────────────

async def entrypoint(ctx: JobContext) -> None:
    """Punto di ingresso invocato da LiveKit Workers per ogni chiamata in arrivo.

    Ogni chiamata ottiene una room WebRTC dedicata (dispatch rule "call-*").
    Questo metodo crea la sessione Gemini Live, registra i listener per la
    trascrizione e avvia l'agente nella room.
    """
    await ctx.connect()
    log.info("Connesso alla room: %s", ctx.room.name)

    # Gemini Live gestisce STT + LLM + TTS in un unico modello audio nativo.
    # Non serve configurare provider STT/TTS separati.
    session = AgentSession(
        llm=google_realtime.RealtimeModel(
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            voice="Aoede",  # voce femminile, calda e naturale — adatta alla personalità di Sofia
            language="it-IT",
        ),
    )

    # ── Trascrizione su file ──────────────────────────────────────────────────
    # Ogni chiamata genera un file univoco: YYYYMMDD_HHMMSS_<room-name>.txt
    transcript_path = TRANSCRIPTS_DIR / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{ctx.room.name}.txt"
    transcript_file = transcript_path.open("w", encoding="utf-8")
    transcript_file.write(f"=== Chiamata: {ctx.room.name} — {datetime.now().isoformat()} ===\n\n")

    @session.on("user_input_transcribed")
    def on_user_input(event: UserInputTranscribedEvent) -> None:
        # Gemini Live emette eventi sia intermedi (is_final=False, testo parziale)
        # che finali (is_final=True, turno completo). Logghiamo solo i finali
        # per evitare duplicati nella trascrizione.
        # Guardia sul file chiuso: la sessione può emettere eventi residui
        # dopo "close" e una write su file chiuso solleverebbe ValueError.
        if event.is_final and not transcript_file.closed:
            log.info("[UTENTE] %s", event.transcript)
            transcript_file.write(f"UTENTE: {event.transcript}\n")
            transcript_file.flush()

    @session.on("conversation_item_added")
    def on_conversation_item(event: ConversationItemAddedEvent) -> None:
        # conversation_item_added scatta per ogni messaggio aggiunto al contesto
        # (utente, agente, tool calls). Filtriamo solo i messaggi dell'agente
        # con contenuto testuale (le risposte vocali sintetizzate da Gemini).
        if isinstance(event.item, ChatMessage) and event.item.role == "assistant":
            text = event.item.text_content
            if text and not transcript_file.closed:
                log.info("[AGENTE] %s", text)
                transcript_file.write(f"AGENTE: {text}\n")
                transcript_file.flush()

    @session.on("close")
    def on_close(_event: object) -> None:
        # Chiudiamo il file solo qui, non prima: la sessione può emettere
        # eventi conversation_item_added anche dopo che l'utente ha riagganciato.
        if transcript_file.closed:
            return
        transcript_file.write(f"\n=== Fine chiamata: {datetime.now().isoformat()} ===\n")
        transcript_file.close()
        log.info("Trascrizione salvata: %s", transcript_path)

    await session.start(PasswordResetAgent(), room=ctx.room)


# ── Avvio worker ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # `dev` avvia un singolo worker locale che si registra su LiveKit Cloud
    # e riceve job in ingresso tramite WebSocket.
    # num_idle_processes=1: mantiene sempre un processo figlio pre-avviato e pronto.
    # Senza di questo, ogni chiamata parte "fredda" e rischia il timeout di connessione
    # a LiveKit Cloud prima che il processo riesca ad unirsi alla room.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, num_idle_processes=1))
