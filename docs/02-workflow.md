# 02 — Workflow end-to-end

Flussi completi per i due canali. La logica conversazionale e di business è
identica; cambia solo il trasporto.

---

## 1. Flusso canale voce — happy path

```
 1. UTENTE        Chiama il numero del service desk; il centralino devia
                  al numero dedicato del canale AI.
        │
 2. SIP TRUNK     Termina la chiamata PSTN e la inoltra via SIP/SRTP
                  a livekit-sip nella VPC.
        │
 3. LIVEKIT       Crea la room "call-<id>", aggiunge il partecipante SIP,
                  dispatcha il job al Voice Agent worker.
        │
 4. VOICE AGENT   Apre lo stream bidirezionale con Nova Sonic 2 (Bedrock).
                  Saluto iniziale: si presenta come assistente del supporto
                  IT per lo sblocco utenze.
        │
 5. DIALOGO       Agente: chiede lo UserID (con spelling assistito:
                  "me lo può dettare lettera per lettera?").
                  Utente: fornisce lo UserID.
                  Agente: conferma rileggendo lo UserID; se la confidenza è
                  bassa, chiede nome e cognome come verifica incrociata.
        │
 6. TOOL CALL     create_unlock_request(user_id, full_name?, channel="voice",
                  caller_number)
                  → Orchestrator: apre richiesta + ticket ServiceNow
                    "In lavorazione" e verifica l'account su AD:
                    - esiste?
                    - nome/cognome coerenti (se forniti)?
                    - stato = locked-out?
        │
 7. TOOL CALL     unlock_account(request_id)
                  → Orchestrator: esegue lo sblocco (via ServiceNow AD Spoke),
                    verifica l'esito, aggiorna e chiude il ticket
                    ("Risolto — sbloccato da agente AI, canale voce").
        │
 8. CHIUSURA      Agente: "Il suo account è stato sbloccato, può accedere
                  da subito. Il numero della sua richiesta è INC0012345."
                  Chiede se serve altro, saluta, termina.
        │
 9. POST-CALL     Trascrizione → S3 (KMS). Metriche → CloudWatch.
                  Il ticket ServiceNow resta come record permanente.
```

Regole di prompt ereditate dalla PoC (validate sui transcript):

- **Tool call silenziosa** — l'agente non pronuncia frasi tipo "verifico…"
  prima di chiamare il tool: nella PoC quelle frasi venivano interrotte
  dall'utente e la generazione (tool call inclusa) veniva cancellata.
- **Persona definita** (nome, tono caldo, it-IT) — riduce l'abbandono.
- **Scope rigido** — l'agente rifiuta gentilmente qualunque richiesta diversa
  dallo sblocco utenze e indirizza al service desk.

## 2. Flusso canale testo

Il canale testo è **asincrono e guidato dal ticket** (non una chat in tempo
reale). Condivide con la voce la stessa logica di sblocco (passi 6–7 sopra),
ma cambia l'innesco:

```
 1. UTENTE        Invia un'email alla casella del service desk.
        │
 2. SERVICENOW    Inbound Email Action: converte l'email in ticket
                  (parsing iniziale di UserID/oggetto), categoria sblocco.
        │
 3. TEXT AGENT    Viene innescato sul nuovo ticket (push da Business Rule/Flow
                  ServiceNow, oppure polling periodico — punto aperto) e
                  conferma che è una richiesta di sblocco.
        │
 4. ESTRAZIONE    Estrae UserID (e nome/cognome se presenti) dai campi/corpo
                  del ticket. Se mancano dati o l'identità va verificata:
                  aggiorna il ticket / risponde via email richiedendo le
                  informazioni e si ferma fino alla risposta dell'utente.
        │
 5. TOOL CALL     create_unlock_request(user_id, full_name?, channel="text",
                  ticket_id) → Orchestrator (stessi endpoint del canale voce).
        │         Da qui in poi identico ai passi 6–7 del flusso voce.
        │
 6. CHIUSURA      L'Orchestrator aggiorna e chiude il ticket con l'esito;
                  eventuale notifica via email all'utente con il numero di
                  ticket. La cronologia del ticket sostituisce il transcript.
```

Note:
- Lo UserID arriva **digitato** (dal testo dell'email/ticket) → niente
  ambiguità di trascrizione né spelling assistito.
- Il **mittente dell'email è spoofabile** e non autentica l'utente (stessa
  limitazione del CLI sul canale voce): il contenuto del ticket è input non
  fidato, validato a bordo dall'orchestrator. Dettagli in
  [04 — Sicurezza](04-sicurezza-compliance.md).

## 3. Macchina a stati della richiesta (Orchestrator)

```
 CREATED ──► VERIFYING ──┬──► ELIGIBLE ──► UNLOCKING ──┬──► UNLOCKED   (ticket chiuso: risolto)
                         │                             └──► FAILED     (ticket → escalation)
                         ├──► NOT_FOUND                (ticket chiuso: annullato / escalation)
                         ├──► NOT_LOCKED               (ticket chiuso: nessuna azione necessaria)
                         ├──► MISMATCH                 (nome/cognome non coerenti → escalation)
                         └──► INELIGIBLE               (account disabilitato/scaduto → escalation)
```

Ogni transizione è registrata su DynamoDB con timestamp e `correlation_id`,
e riflessa nel work-note del ticket ServiceNow.

## 4. Casi di errore e percorsi alternativi

| Caso | Comportamento agente | Sistema |
|---|---|---|
| **UserID non trovato** | Lo comunica, chiede di verificare/dettare di nuovo (max 2 tentativi), poi propone escalation | Ticket aggiornato con i tentativi; stato `NOT_FOUND` |
| **Account non bloccato** | "Il suo account non risulta bloccato. Se non riesce ad accedere, il problema potrebbe essere un altro" → escalation opzionale | Ticket chiuso `NOT_LOCKED` o riassegnato al service desk |
| **Nome/cognome non coerenti con lo UserID** | Non rivela quale dato è errato (no enumeration); propone escalation | Stato `MISMATCH`, ticket assegnato al service desk con flag verifica identità |
| **Account disabilitato/sospeso** | Comunica che non può procedere e che serve il service desk | Stato `INELIGIBLE`, escalation con motivo |
| **Sblocco fallito (errore tecnico)** | Si scusa, comunica il numero di ticket, assicura presa in carico | Stato `FAILED`, ticket assegnato al gruppo service desk con priorità; retry automatico solo per errori transient (timeout, 5xx) con backoff, max 2 |
| **ServiceNow non raggiungibile** | L'agente lo gestisce con messaggio di cortesia e invita a richiamare / contattare il service desk | Circuit breaker; allarme CloudWatch; nessuna operazione su AD senza ticket (il ticket è precondizione) |
| **Richiesta fuori scope** (reset password, VPN, ecc.) | Spiega che gestisce solo lo sblocco utenze e indirizza al canale corretto | Conversazione tracciata, nessun ticket di sblocco |
| **Utente chiede operatore** | In qualsiasi momento: crea/aggiorna ticket con trascrizione sintetica e stato escalation; comunica il numero di ticket | `escalate` → assignment group service desk. (Eventuale trasferimento di chiamata a caldo: estensione futura, richiede SIP REFER verso il centralino) |
| **Silenzio prolungato / caduta linea** | Dopo N secondi di silenzio: prompt di sollecito; dopo M: chiusura cortese | Se esisteva una richiesta in corso: ticket lasciato in stato coerente (mai `UNLOCKING` orfano — vedi recovery sotto) |
| **Abuso / tentativi ripetuti** | Oltre soglia per CLI o UserID: l'agente non procede e indirizza al service desk | Rate limiting su orchestrator; dettagli in doc 04 |

**Recovery:** un job periodico (EventBridge → Lambda) riconcilia le richieste
rimaste in stato non terminale oltre N minuti: verifica lo stato reale su
AD/ServiceNow e chiude o escala. Nessuna richiesta resta appesa.

## 5. Sequenza dettagliata sblocco (Opzione A — via ServiceNow)

```
Voice/Text Agent          Orchestrator              ServiceNow                 AD (on-prem)
      │  create_unlock_request │                         │                          │
      │───────────────────────►│  POST /api (OAuth2)     │                          │
      │                        │────────────────────────►│ crea ticket              │
      │                        │                         │ "In lavorazione"         │
      │                        │  trigger flow           │                          │
      │                        │  "check account status" │   AD Spoke (MID Server)  │
      │                        │────────────────────────►│─────────────────────────►│ Get-ADUser
      │                        │◄────────────────────────│◄─────────────────────────│ (status, lockedOut)
      │◄───────────────────────│ ELIGIBLE                │                          │
      │  unlock_account        │                         │                          │
      │───────────────────────►│  trigger flow "unlock"  │                          │
      │                        │────────────────────────►│─────────────────────────►│ Unlock-ADAccount
      │                        │◄────────────────────────│◄─────────────────────────│ esito
      │                        │  update+close ticket    │                          │
      │                        │────────────────────────►│ "Risolto"                │
      │◄───────────────────────│ UNLOCKED + ticket n°    │                          │
```

Timeout espliciti su ogni hop (HTTP verso ServiceNow: connect 5 s / read 15 s;
budget complessivo del tool call ≤ 20 s, oltre il quale l'agente comunica la
presa in carico asincrona e l'esito arriva sul ticket). Il dettaglio
dell'integrazione è in [03 — Integrazione ServiceNow e AD](03-integrazione-servicenow-ad.md).
