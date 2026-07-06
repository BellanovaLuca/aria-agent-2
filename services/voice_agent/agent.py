"""
Voice Agent — canale telefonico del supporto IT.

Riceve chiamate SIP inoltrate da LiveKit Cloud, conduce una conversazione
vocale in italiano tramite Google Gemini Live e invoca i tool di supporto
(reset password, sblocco utenza, Q&A sulla knowledge base).

Flusso infrastrutturale:
  Twilio (PSTN) → LiveKit Cloud (SIP→WebRTC) → questo processo
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# Carica .env dalla root del progetto prima di qualunque import LiveKit,
# altrimenti LIVEKIT_URL / GOOGLE_API_KEY non sono disponibili all'avvio.
_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
load_dotenv(_ROOT / ".env")

from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.agents.llm import ChatMessage
from livekit.agents.voice.events import ConversationItemAddedEvent, UserInputTranscribedEvent
from livekit.plugins.google import realtime as google_realtime

# sys.path consente l'import di voice_agent.tools dalla root del progetto
sys.path.insert(0, str(_ROOT))
from voice_agent.tools import (
    check_ticket_status,
    open_support_ticket,
    reset_user_password,
    search_knowledge_base,
    unlock_account,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# Ogni chiamata genera un file .txt in questa cartella
TRANSCRIPTS_DIR = _ROOT / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

# ── Istruzioni di sistema per Gemini Live ─────────────────────────────────────
# Definisce identità, tono e flusso conversazionale dell'agente.
# Il nome "Sofia" e la personalità umana riducono la percezione di parlare
# con un bot e aumentano la disponibilità dell'utente a collaborare.

AGENT_NAME = "Sofia"

INSTRUCTIONS = f"""
Sei {AGENT_NAME}, l'assistente vocale del servizio IT aziendale.
Non sei un robot: sei una persona gentile, paziente e competente che aiuta i colleghi
con i problemi informatici. Hai una voce calda e rassicurante.

Puoi aiutare con TRE tipi di richieste, ognuna con il suo strumento:

1. RESET PASSWORD — quando l'utente ha dimenticato la password o vuole cambiarla.
   Chiedi username o email con tono colloquiale (rassicuralo se è frustrato).
   Appena lo fornisce, chiama IMMEDIATAMENTE e IN SILENZIO il tool reset_user_password.
   - Non trovato: comunicalo e chiedi di riverificare username/email.
   - Account bloccato o sospeso: se è bloccato proponi lo sblocco (vedi punto 2);
     se è sospeso, invita a contattare il supporto.
   - Riuscito: di' che riceverà una email con la password temporanea da cambiare
     al primo accesso.

2. SBLOCCO UTENZA — quando l'utente dice che il suo account è bloccato/lockato
   (e non è una password dimenticata). Per sicurezza devi verificare l'identità:
   chiedi PRIMA lo username e POI il nome e cognome completo. Solo quando hai
   entrambi, chiama IN SILENZIO il tool unlock_account.
   - Riuscito: conferma che l'utenza è di nuovo attiva e riceverà una email.
   - Verifica non riuscita o troppi sblocchi: riferisci il messaggio e, se serve,
     invita a contattare il supporto. Non insistere e non aggirare la verifica.

3. DOMANDE IT (come si fa a…) — quando l'utente fa una domanda informativa
   (VPN, posta, stampanti, procedure). Per QUALSIASI domanda IT chiama SEMPRE e
   IN SILENZIO il tool search_knowledge_base con la domanda riformulata in modo
   chiaro, PRIMA di rispondere. Non rispondere mai a una domanda IT dalla tua
   conoscenza generale senza aver prima consultato il tool.
   - RISPONDI SOLO con le informazioni contenute nei passaggi restituiti dal tool.
     Non aggiungere nulla di tua iniziativa, non inventare procedure.
   - Se citi una procedura, menziona da quale documento proviene.
   - Se il tool non restituisce passaggi, dillo con onestà e proponi il supporto.
     Meglio ammettere di non sapere che dare un'informazione errata.

4. TICKET DI SUPPORTO — quando non puoi risolvere tu (richiesta fuori dai tre
   ambiti sopra, oppure la knowledge base non ha la risposta, oppure l'utente
   lo chiede), proponi di aprire un ticket. Se l'utente accetta, chiama IN
   SILENZIO open_support_ticket con un oggetto e una descrizione chiari, poi
   comunica il numero del ticket. Se l'utente chiede a che punto è la sua
   richiesta e ti dà un numero (es. INC0001001), chiama check_ticket_status.

Regole trasversali:
- NON pronunciare frasi di attesa prima di chiamare un tool ("Verifico", "Un momento"…):
  chiama il tool in silenzio e parla solo dopo aver ricevuto il risultato.
- Parla sempre in italiano, in modo cordiale, conciso e professionale.
- Se la richiesta esula da questi tre ambiti, spiega con gentilezza cosa puoi fare.
- Chiudi chiedendo se serve altro e saluta in modo caldo e personale.
""".strip()


# ── Agente ────────────────────────────────────────────────────────────────────

class ITSupportAgent(Agent):
    """Agente vocale LiveKit per il supporto IT di primo livello.

    Eredita da Agent e registra i tool functions (reset password, sblocco
    utenza, ricerca nella knowledge base) che Gemini Live può invocare
    autonomamente durante la conversazione.
    """

    def __init__(self) -> None:
        super().__init__(
            instructions=INSTRUCTIONS,
            tools=[
                reset_user_password,
                unlock_account,
                search_knowledge_base,
                open_support_ticket,
                check_ticket_status,
            ],
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

    # ── Handoff a operatore umano ─────────────────────────────────────────────
    # Quando un operatore (identità "operator-…") entra nella room, l'agente
    # annuncia il passaggio e si fa da parte, lasciando operatore e chiamante a
    # parlare direttamente. Un flag evita di gestire due volte lo stesso handoff.
    handoff_done = {"value": False}

    @ctx.room.on("participant_connected")
    def on_participant_connected(participant: object) -> None:
        identity = getattr(participant, "identity", "") or ""
        if not identity.startswith("operator-") or handoff_done["value"]:
            return
        handoff_done["value"] = True
        log.info("Operatore %s entrato: avvio handoff", identity)
        transcript_file.write(f"\n--- Handoff a operatore ({identity}) ---\n") if not transcript_file.closed else None

        async def _handoff() -> None:
            try:
                await session.generate_reply(
                    instructions=(
                        "Un operatore umano è appena entrato in linea. Con poche parole "
                        "avvisa il chiamante che lo passi a un collega del supporto, "
                        "salutalo cordialmente, poi non aggiungere altro."
                    )
                )
            except Exception as exc:  # l'annuncio è best-effort
                log.warning("Annuncio di handoff fallito: %s", exc)
            finally:
                # L'agente lascia la room: chiamante e operatore restano in linea.
                await session.aclose()

        asyncio.create_task(_handoff())

    await session.start(ITSupportAgent(), room=ctx.room)


# ── Avvio worker ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # `dev` avvia un singolo worker locale che si registra su LiveKit Cloud
    # e riceve job in ingresso tramite WebSocket.
    # num_idle_processes=1: mantiene sempre un processo figlio pre-avviato e pronto.
    # Senza di questo, ogni chiamata parte "fredda" e rischia il timeout di connessione
    # a LiveKit Cloud prima che il processo riesca ad unirsi alla room.
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, num_idle_processes=1))
