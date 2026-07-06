"""
Cervello conversazionale del canale chat: Gemini (testo) con function calling.

Riusa gli stessi tre strumenti del canale vocale tramite `shared.operations`, così
reset, sblocco e Q&A si comportano in modo identico su voce e chat. Il prompt è
adattato al testo (niente riferimenti alla voce), ma la logica dei flussi e la
regola anti-allucinazione sono le stesse.

`generate_reply` gestisce il loop manuale di function calling: chiede al modello,
esegue gli eventuali tool che richiede, gli restituisce i risultati e ripete
finché produce una risposta testuale.
"""
from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types

_ROOT = next(p for p in Path(__file__).resolve().parents if (p / ".env.example").is_file())
sys.path.insert(0, str(_ROOT))
from shared import operations

log = logging.getLogger(__name__)

CHAT_MODEL = os.getenv("CHAT_MODEL", "gemini-2.5-flash")
# Limite di giri di tool per turno: evita loop infiniti se il modello continua
# a invocare strumenti senza mai produrre testo.
MAX_TOOL_ROUNDS = 5

AGENT_NAME = "Sofia"

CHAT_INSTRUCTIONS = f"""
Sei {AGENT_NAME}, l'assistente del servizio IT aziendale, in chat testuale.
Sei gentile, paziente e competente. Rispondi in italiano, in modo conciso e
cordiale, con messaggi brevi adatti a una chat.

Puoi aiutare con TRE tipi di richieste, ognuna con il suo strumento:

1. RESET PASSWORD — quando l'utente ha dimenticato la password o vuole cambiarla.
   Chiedi username o email, poi chiama lo strumento reset_user_password.
   - Non trovato: chiedi di riverificare username/email.
   - Bloccato: proponi lo sblocco (punto 2). Sospeso: rimanda al supporto.
   - Riuscito: di' che riceverà una email con la password temporanea da cambiare
     al primo accesso.

2. SBLOCCO UTENZA — quando l'account è bloccato/lockato (non una password
   dimenticata). Per sicurezza verifica l'identità: chiedi PRIMA lo username e
   POI il nome e cognome completo. Solo con entrambi, chiama unlock_account.
   - Riuscito: conferma che l'utenza è di nuovo attiva.
   - Verifica non riuscita o troppi sblocchi: riferisci il messaggio e, se serve,
     rimanda al supporto. Non insistere e non aggirare la verifica.

3. DOMANDE IT (come si fa a…, come configuro…, non riesco a…) — per QUALSIASI
   domanda su procedure o servizi IT DEVI SEMPRE chiamare prima
   search_knowledge_base con la domanda riformulata in modo chiaro. NON
   rispondere MAI a una domanda IT dalla tua conoscenza generale senza aver
   prima consultato lo strumento.
   - RISPONDI SOLO con le informazioni contenute nei passaggi restituiti.
     Non inventare procedure. Cita il documento da cui proviene l'informazione.
   - Se non ci sono passaggi, dillo con onestà e proponi il supporto; non
     ripiegare sulla tua conoscenza generale.

4. TICKET DI SUPPORTO — quando non puoi risolvere tu (fuori dai tre ambiti,
   knowledge base senza risposta, o richiesta dell'utente), proponi di aprire un
   ticket. Se l'utente accetta, chiama open_support_ticket con oggetto e
   descrizione chiari, poi comunica il numero. Se l'utente chiede lo stato e ti
   dà un numero (es. INC0001001), chiama check_ticket_status.

Regole:
- Non annunciare che stai per usare uno strumento: usalo e basta, poi rispondi.
- Se la richiesta esula da questi tre ambiti, spiega con gentilezza cosa puoi fare.
- All'inizio della conversazione presentati brevemente come {AGENT_NAME} del
  supporto IT e chiedi come puoi aiutare.
""".strip()


def _schema(properties: dict, required: list[str]) -> types.Schema:
    return types.Schema(type=types.Type.OBJECT, properties=properties, required=required)


def _str(desc: str) -> types.Schema:
    return types.Schema(type=types.Type.STRING, description=desc)


# Dichiarazioni dei tool per Gemini — rispecchiano i wrapper del voice agent.
_TOOLS = [
    types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="reset_user_password",
            description=(
                "Verifica l'utente ed esegue il reset della password (per username "
                "o email). La password non viene restituita: arriva via email."
            ),
            parameters=_schema(
                {"username": _str("Username (es. 'mario.rossi') o email dell'utente.")},
                ["username"],
            ),
        ),
        types.FunctionDeclaration(
            name="unlock_account",
            description=(
                "Sblocca un'utenza bloccata previa verifica identità. Richiede "
                "username e nome e cognome completo dichiarato dall'utente."
            ),
            parameters=_schema(
                {
                    "username": _str("Username dell'account (es. 'luca.neri')."),
                    "full_name": _str("Nome e cognome completo, per la verifica."),
                },
                ["username", "full_name"],
            ),
        ),
        types.FunctionDeclaration(
            name="search_knowledge_base",
            description=(
                "Cerca nella base di conoscenza IT i passaggi rilevanti per una "
                "domanda informativa dell'utente."
            ),
            parameters=_schema(
                {"query": _str("La domanda dell'utente, riformulata in modo chiaro.")},
                ["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="open_support_ticket",
            description=(
                "Apre un ticket di supporto quando non puoi risolvere tu la "
                "richiesta (fuori ambito, non in knowledge base, o richiesto "
                "dall'utente). Chiedi conferma prima di aprirlo."
            ),
            parameters=_schema(
                {
                    "subject": _str("Oggetto sintetico del problema (una riga)."),
                    "description": _str("Descrizione dettagliata di cosa serve all'utente."),
                },
                ["subject", "description"],
            ),
        ),
        types.FunctionDeclaration(
            name="check_ticket_status",
            description="Controlla lo stato di un ticket già aperto dato il suo numero (INCxxxxxxx).",
            parameters=_schema(
                {"number": _str("Numero del ticket, formato INCxxxxxxx.")},
                ["number"],
            ),
        ),
    ])
]


async def _dispatch(name: str, args: dict) -> dict:
    """Esegue lo strumento richiesto dal modello e ne restituisce il risultato."""
    if name == "reset_user_password":
        return await operations.reset_password(args.get("username", ""), channel="chat")
    if name == "unlock_account":
        return await operations.unlock_account(
            args.get("username", ""), args.get("full_name", ""), channel="chat"
        )
    if name == "search_knowledge_base":
        return await operations.search_knowledge_base(args.get("query", ""))
    if name == "open_support_ticket":
        return await operations.open_ticket(
            args.get("subject", ""), args.get("description", ""), "altro", None, channel="chat"
        )
    if name == "check_ticket_status":
        return await operations.get_ticket_status(args.get("number", ""))
    log.warning("Tool sconosciuto richiesto dal modello: %r", name)
    return {"error": f"Strumento sconosciuto: {name}"}


_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.getenv("GOOGLE_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GOOGLE_API_KEY mancante: necessaria per il canale chat.")
        _client = genai.Client(api_key=api_key)
    return _client


def _config() -> types.GenerateContentConfig:
    return types.GenerateContentConfig(
        system_instruction=CHAT_INSTRUCTIONS,
        tools=_TOOLS,
        temperature=0.7,
    )


async def generate_reply(
    history: list[types.Content], user_text: str
) -> tuple[str, list[types.Content]]:
    """Genera la risposta dell'assistente a un messaggio, eseguendo i tool.

    Args:
        history: la conversazione finora (lista di Content già scambiati).
        user_text: il nuovo messaggio dell'utente.

    Returns:
        (reply, new_history) dove new_history include il turno utente, gli
        eventuali giri di tool e il turno finale del modello.
    """
    client = _get_client()
    working = list(history)
    working.append(types.Content(role="user", parts=[types.Part(text=user_text)]))

    for _ in range(MAX_TOOL_ROUNDS):
        resp = await client.aio.models.generate_content(
            model=CHAT_MODEL, contents=working, config=_config()
        )
        candidate = resp.candidates[0] if resp.candidates else None
        if candidate and candidate.content:
            working.append(candidate.content)

        calls = resp.function_calls or []
        if not calls:
            return (resp.text or "").strip(), working

        response_parts = []
        for call in calls:
            result = await _dispatch(call.name, dict(call.args or {}))
            response_parts.append(
                types.Part.from_function_response(name=call.name, response=result)
            )
        working.append(types.Content(role="user", parts=response_parts))

    # Superato il limite di giri: chiedi una chiusura testuale senza altri tool.
    log.warning("Superato MAX_TOOL_ROUNDS, forzo una risposta testuale")
    resp = await client.aio.models.generate_content(
        model=CHAT_MODEL,
        contents=working,
        config=types.GenerateContentConfig(system_instruction=CHAT_INSTRUCTIONS, temperature=0.5),
    )
    if resp.candidates and resp.candidates[0].content:
        working.append(resp.candidates[0].content)
    return (resp.text or "Mi dispiace, puoi ripetere la richiesta?").strip(), working
