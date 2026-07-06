"""
Tool functions esposte a Gemini Live durante le conversazioni telefoniche.

Ogni funzione decorata con @llm.function_tool viene registrata nel contesto
dell'agente e può essere invocata autonomamente dal modello. La logica effettiva
(chiamate HTTP, gestione errori, rimozione della password dal risultato) vive in
`shared.operations`, condivisa con il canale chat perché i due canali si
comportino in modo identico. Qui restano solo i wrapper con le docstring che
guidano il modello e il canale fisso "voice".
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from dotenv import load_dotenv
from livekit.agents import llm

load_dotenv(Path(__file__).parent.parent / ".env")
sys.path.insert(0, str(Path(__file__).parent.parent))
from shared import operations

log = logging.getLogger(__name__)


@llm.function_tool
async def reset_user_password(username: str) -> dict:
    """Verifica l'utente ed esegue il reset della password in un'unica operazione.

    Cerca l'utente per username o email, controlla che l'account sia attivo,
    e se lo è esegue immediatamente il reset. La password temporanea NON viene
    restituita: l'utente la riceve via email. Restituisce un messaggio chiaro
    in tutti i casi (non trovato, bloccato, reset riuscito o fallito).

    Args:
        username: Username (es. "mario.rossi") o indirizzo email dell'utente.

    Returns:
        Dizionario con found, status, success e message.
    """
    return await operations.reset_password(username, channel="voice")


@llm.function_tool
async def unlock_account(username: str, full_name: str) -> dict:
    """Sblocca un'utenza bloccata dopo aver verificato l'identità dell'utente.

    Da usare quando l'utente dice che il suo account è bloccato/lockato e NON
    si tratta di una password dimenticata. Richiede sia lo username sia il nome
    e cognome completo: il backend li confronta con quelli registrati e rifiuta
    lo sblocco se non corrispondono o se ci sono stati troppi sblocchi recenti.

    Args:
        username: Username dell'account (es. "luca.neri").
        full_name: Nome e cognome completo dichiarato dall'utente, per la verifica.

    Returns:
        Dizionario con success e message (esito da riferire all'utente).
    """
    return await operations.unlock_account(username, full_name, channel="voice")


@llm.function_tool
async def search_knowledge_base(query: str) -> dict:
    """Cerca nella base di conoscenza IT la risposta a una domanda dell'utente.

    Da usare quando l'utente pone una domanda informativa (es. "come mi collego
    alla VPN?", "come configuro la posta sul telefono?"). Restituisce i passaggi
    più pertinenti trovati nei documenti aziendali, ciascuno con il nome del
    documento di origine.

    IMPORTANTE: rispondi all'utente SOLO con le informazioni contenute nei
    passaggi restituiti. Se la lista dei passaggi è vuota, dillo apertamente e
    non inventare: suggerisci di rivolgersi al supporto.

    Args:
        query: La domanda dell'utente, riformulata in modo chiaro e conciso.

    Returns:
        Dizionario con `passages` (lista di {text, source}) e `found` (bool).
    """
    return await operations.search_knowledge_base(query)


@llm.function_tool
async def open_support_ticket(subject: str, description: str) -> dict:
    """Apre un ticket di supporto quando non puoi risolvere tu la richiesta.

    Da usare se la domanda esula dai tuoi compiti (reset, sblocco, Q&A dalla
    knowledge base), se la knowledge base non ha la risposta, o se l'utente
    chiede esplicitamente di aprire un ticket. Chiedi conferma all'utente prima
    di aprirlo, poi comunicagli il numero restituito.

    Args:
        subject: Oggetto sintetico del problema (una riga).
        description: Descrizione dettagliata di cosa serve all'utente.

    Returns:
        Dizionario con success, number (es. "INC0001001") e message.
    """
    return await operations.open_ticket(subject, description, "altro", None, channel="voice")


@llm.function_tool
async def check_ticket_status(number: str) -> dict:
    """Controlla lo stato di un ticket di supporto già aperto, dato il suo numero.

    Da usare quando l'utente chiede a che punto è la sua richiesta e fornisce un
    numero di ticket (es. "INC0001001").

    Args:
        number: Il numero del ticket, nel formato INCxxxxxxx.

    Returns:
        Dizionario con found, number, status e subject.
    """
    return await operations.get_ticket_status(number)
