# Aria Agent

Piattaforma open-source per costruire **agenti AI multicanale** con voce, email e interfaccia web. Il progetto include un'implementazione di riferimento ma l'architettura è progettata per essere adattata a qualsiasi caso d'uso conversazionale.

L'assistente "Sofia" gestisce tre tipi di richieste: **reset password**, **sblocco utenza** (con verifica d'identità) e **domande IT** — a queste ultime risponde attingendo a una **knowledge base** (RAG) costruita sui documenti aziendali caricati dalla dashboard. È raggiungibile su **tre canali** che condividono gli stessi strumenti e la stessa logica: **voce** (telefono/WebRTC via Gemini Live), **email** (processing asincrono) e **chat testuale** (widget nella dashboard, via Gemini con function calling).

Stack: [LiveKit Agents](https://github.com/livekit/agents) + **Google Gemini Live** (LLM + STT + TTS nativo audio) + **Qdrant** (vector store per la RAG) + embedding **Gemini** + **React** dashboard di monitoraggio.

> **Nota** — la cartella [`docs/`](docs/README.md) non descrive questa PoC:
> contiene l'architettura e la documentazione tecnica di una **possibile
> soluzione di produzione su ambiente AWS** (Amazon Nova Sonic, sblocco
> utenze) con possibili integrazioni verso ServiceNow e Active Directory.

---

## Indice

- [Panoramica architetturale](#panoramica-architetturale)
- [Componenti infrastrutturali: LiveKit](#componenti-infrastrutturali-livekit)
- [Componenti infrastrutturali: Twilio](#componenti-infrastrutturali-twilio)
- [Flusso completo di una chiamata telefonica](#flusso-completo-di-una-chiamata-telefonica)
- [Componenti applicativi](#componenti-applicativi)
- [Flusso canale email](#flusso-canale-email)
- [Trascrizione e logging delle chiamate](#trascrizione-e-logging-delle-chiamate)
- [Personalità dell'agente vocale](#personalità-dellagente-vocale)
- [Prerequisiti](#prerequisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Avvio e arresto](#avvio-e-arresto)
- [Log e diagnostica](#log-e-diagnostica)
- [Struttura del progetto](#struttura-del-progetto)
- [Estensibilità](#estensibilità)

---

## Panoramica architetturale

Il sistema integra **tre layer infrastrutturali esterni** (LiveKit Cloud, Twilio, Google Gemini) con **cinque processi applicativi** che girano in locale. Il canale telefonico e il canale email sono completamente indipendenti e condividono solo il User Service.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CANALE TELEFONICO                                  │
│                                                                               │
│  [Telefono fisico]           o         [Zoiper - softphone SIP]              │
│          │                                        │                           │
│          │ PSTN (rete telefonica)                 │ SIP over TCP/UDP          │
│          ▼                                        ▼                           │
│  ┌───────────────────────────────────────────────────────┐                   │
│  │                       TWILIO                           │                   │
│  │  • Numero telefonico                                  │                   │
│  │  • SIP Domain                                         │                   │
│  │  • TwiML Bin (logica di instradamento)                │                   │
│  └───────────────────────┬───────────────────────────────┘                   │
│                          │ SIP over TCP                                       │
│                          ▼                                                    │
│  ┌───────────────────────────────────────────────────────┐                   │
│  │                   LIVEKIT CLOUD                        │                   │
│  │  • SIP Inbound Trunk                                  │                   │
│  │  • Dispatch Rule → crea room "call-XXXX"              │                   │
│  │  • WebRTC media relay                                 │                   │
│  └───────────────────────┬───────────────────────────────┘                   │
│                          │ WebRTC / LiveKit protocol                          │
│                          ▼                                                    │
│  ┌─────────────────────────────────┐    ┌─────────────────────────────────┐  │
│  │       Voice Agent (Python)       │    │      Google Gemini Live          │  │
│  │  Agente personalizzabile        │◄──►│  gemini-2.5-flash-native-audio  │  │
│  │  tools: funzioni custom         │    │  STT + LLM + TTS in un modello  │  │
│  └─────────────────┬───────────────┘    └─────────────────────────────────┘  │
└────────────────────│────────────────────────────────────────────────────────┘
                     │
┌────────────────────│────────────────────────────────────────────────────────┐
│  SERVIZI APPLICATIVI LOCALI                                                  │
│                    │                                                          │
│    Voice Agent ────┤                                                          │
│    Email Processor─┤──► User Service (FastAPI :8001)                         │
│                    │                                                          │
│    Email Processor ◄──► Email Service (FastAPI :8002)                        │
│                                                                               │
│    Frontend React (Vite :5173) ──► /api → :8001, /email → :8002             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Componenti infrastrutturali: LiveKit

### Cos'è LiveKit

[LiveKit](https://livekit.io) è un server WebRTC open source che gestisce comunicazione audio/video in tempo reale. In questo progetto è il **ponte tra la rete telefonica (SIP) e il voice agent Python**.

| | LiveKit Cloud | Self-hosted |
|---|---|---|
| **Setup** | Zero — account gratuito su livekit.io | Docker + Redis + IP pubblico + porte UDP aperte |
| **SIP handling** | Incluso, gestito da LiveKit | Richiede il servizio separato `livekit/sip` |
| **Piano gratuito** | 1.000 minuti agente/mese | Nessun limite (costi infra a tuo carico) |
| **Adatto a** | POC, sviluppo, demo, piccoli volumi | Produzione, privacy totale, grandi volumi |

### Cosa fa LiveKit Cloud in questo progetto

1. **Espone un endpoint SIP pubblico** — è l'indirizzo a cui Twilio invia la chiamata via SIP.
2. **Gestisce l'inbound SIP trunk** — riceve la chiamata, verifica le credenziali SIP e le IP autorizzate.
3. **Crea una room WebRTC** con prefisso `call-` e aggiunge il partecipante SIP.
4. **Notifica il voice agent** tramite il job dispatch: il worker Python riceve il job, si connette alla room e inizia la conversazione.
5. **Fa da relay media** — audio del chiamante via SIP → LiveKit lo converte in WebRTC → agente; audio generato da Gemini torna verso il chiamante.

---

## Componenti infrastrutturali: Twilio

Twilio è il **PSTN gateway**: converte le chiamate dalla rete telefonica tradizionale in SIP e le instrada verso LiveKit Cloud.

Senza Twilio (o un provider equivalente), il voice agent è raggiungibile solo via console locale o browser WebRTC — non tramite un numero di telefono reale.

### Configurazione necessaria su Twilio

1. **Numero di telefono** — acquistato su Twilio Console (numeri italiani +39 richiedono documenti di identità per normativa italiana; numeri USA funzionano senza restrizioni su account trial)
2. **TwiML Bin** — instrada la chiamata in ingresso verso l'endpoint SIP LiveKit:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <Response>
     <Dial>
       <Sip username="YOUR_SIP_USERNAME" password="YOUR_SIP_PASSWORD">
         sip:YOUR_NUMBER@YOUR_LIVEKIT_SIP_ENDPOINT;transport=tcp
       </Sip>
     </Dial>
   </Response>
   ```
3. **Voice Configuration** del numero → TwiML Bin creato sopra
4. **SIP Domain** (`nomeprogetto.sip.twilio.com`) con Credential List per permettere a softphone SIP (es. Zoiper) di chiamare tramite Twilio

### Perché Zoiper e non il Twilio Dev Phone

Con un account Trial e un solo numero, il Dev Phone non funziona: chiamerebbe lo stesso numero da cui parte la chiamata, generando un conflitto. **Zoiper** (softphone SIP gratuito, https://www.zoiper.com) si registra al SIP Domain come client indipendente — chiamante e destinatario restano entità separate.

---

## Flusso completo di una chiamata telefonica

```
1. ZOIPER
   Chiama: il tuo numero Twilio
   Via: SIP Domain Twilio
   Credenziali: quelle della Credential List
         │
         ▼
2. TWILIO — autentica Zoiper, attiva il TwiML Bin
         │
         ▼
3. TWIML BIN — apre connessione SIP verso LiveKit Cloud
         │
         ▼
4. LIVEKIT CLOUD
   Verifica IP sorgente (range Twilio)
   Crea room WebRTC: "call-<id>"
   Notifica il voice agent
         │
         ▼
5. VOICE AGENT (Python)
   Si connette alla room
   Crea la sessione Gemini Live
         │
         ▼
6. GEMINI LIVE — STT + LLM + TTS in un unico modello nativo audio
   Gestisce la conversazione e invoca i tool function quando necessario
         │
         ▼
7. FINE CHIAMATA
   Trascrizione salvata in: transcripts/YYYYMMDD_HHMMSS_<room>.txt
```

---

## Componenti applicativi

### 1. Voice Agent (`voice_agent/`)

Agente LiveKit che gestisce le chiamate vocali in ingresso (telefono e browser WebRTC). Costruito su **LiveKit Agents** con **Google Gemini Live** come modello unificato per STT, LLM e TTS — nessun provider separato necessario.

| Proprietà | Valore |
|-----------|--------|
| Framework | LiveKit Agents |
| Modello | Google Gemini Live `gemini-2.5-flash-native-audio` |
| Voce | Aoede (it-IT, femminile) — configurabile |
| Lingua | Italiano — modificabile via `language` in `AgentSession` |

**Personalizzazione** — le costanti `AGENT_NAME` e `INSTRUCTIONS` in `voice_agent/agent.py` definiscono nome, personalità e comportamento dell'agente. I tool function in `voice_agent/tools.py` espongono le capacità al LLM.

**Chiamata WebRTC:** integrata nel frontend React (pannello "Call") — parla con l'agente direttamente dal browser, senza telefono né Zoiper. Latenza ~1-1.5s contro i 2-3s della telefonia SIP.

### 2. Email Processor (`email_processor/`)

Loop asincrono con polling sull'inbox mock ogni N secondi. Per ogni email non processata:
1. Estrae il campo rilevante dal corpo con regex
2. Chiama il User Service per l'azione corrispondente
3. Invia email di risposta tramite l'Email Service
4. Marca l'email come processata

### 3. User Service (`user_service/` — porta 8001)

Microservizio FastAPI che gestisce gli utenti e la cronologia operazioni. Persiste i dati su `user_service/db.json` (escluso dal repo — generato al primo avvio).

| Endpoint | Descrizione |
|----------|-------------|
| `GET /users` | Lista utenti (supporta `?email=` per lookup) |
| `GET /users/{username}` | Dettaglio singolo utente |
| `POST /users` | Crea nuovo utente |
| `PUT /users/{username}` | Aggiorna utente |
| `DELETE /users/{username}` | Elimina utente |
| `POST /reset-password` | Esegue il reset, genera password temporanea |
| `POST /unlock-account` | Sblocca un'utenza previa verifica identità (nome+cognome) e anti-abuso |
| `GET /reset-history` | Cronologia completa (reset e sblocchi) |
| `GET /reset-history/{username}` | Cronologia per utente |
| `DELETE /reset-history` | Azzera la cronologia |
| `GET /transcripts` | Lista trascrizioni chiamate |
| `GET /transcripts/{filename}` | Contenuto trascrizione |
| `GET /token` | Genera JWT LiveKit per chiamata WebRTC |
| `GET /rooms` | Elenca le chiamate live attive (per l'handoff operatore) |
| `GET /operator-token` | JWT per far entrare un operatore in una room specifica |

**Documentazione interattiva:** http://localhost:8001/docs

> Tutti gli endpoint di User Service ed Email Service richiedono l'header
> `X-Internal-Api-Key` (valore di `INTERNAL_API_KEY` nel `.env`). Il proxy di
> sviluppo Vite lo inietta automaticamente per il frontend; per prove manuali:
> `curl -H "X-Internal-Api-Key: $INTERNAL_API_KEY" http://localhost:8001/users`.

### 4. Email Service (`email_service/` — porta 8002)

Microservizio FastAPI che simula un server email. Storage in memoria (si resetta al riavvio).

| Endpoint | Descrizione |
|----------|-------------|
| `GET /inbox` | Lista email ricevute |
| `POST /inbox` | Simula ricezione email in ingresso |
| `PATCH /inbox/{id}/processed` | Marca email come processata |
| `GET /sent` | Lista email inviate dall'agente |
| `POST /send` | Aggiunge email alla sent box |

**Documentazione interattiva:** http://localhost:8002/docs

### 5. Knowledge Service (`knowledge_service/` — porta 8003)

Microservizio FastAPI che alimenta la Q&A dell'agente. Indicizza documenti (PDF, Markdown, testo) in un vector store **Qdrant** e li rende interrogabili semanticamente.

| Endpoint | Descrizione |
|----------|-------------|
| `POST /documents` | Carica e indicizza un documento (whitelist estensioni, cap 10 MB) |
| `GET /documents` | Elenca i documenti indicizzati |
| `DELETE /documents/{id}` | Elimina un documento e i suoi frammenti |
| `POST /search` | Ricerca semantica: restituisce i passaggi rilevanti con il documento di origine |

- **Chunking**: ~280 parole per frammento con sovrapposizione, così un'informazione a cavallo di due chunk resta recuperabile.
- **Embedding**: modello `gemini-embedding-001` (768 dim), un unico provider con l'LLM.
- **Qdrant**: gira in locale embedded (cartella `knowledge_service/qdrant_data/`, esclusa dal repo). Impostando `QDRANT_URL` si passa a un server Qdrant esterno o a Qdrant Cloud senza modifiche al codice.

Il tool `search_knowledge_base` del voice agent interroga questo servizio; il prompt impone all'agente di rispondere **solo** con i passaggi restituiti (anti-allucinazione) e di citare la fonte.

**Documentazione interattiva:** http://localhost:8003/docs

### 6. Chat Service (`chat_service/` — porta 8004)

Microservizio FastAPI che espone l'assistente "Sofia" come **chat testuale**. Usa **Gemini** (`gemini-2.5-flash`) con **function calling** e gli stessi tre strumenti del canale vocale, condivisi tramite `shared/operations.py` — reset, sblocco e Q&A si comportano in modo identico su voce e chat.

| Endpoint | Descrizione |
|----------|-------------|
| `POST /message` | Invia un messaggio utente, riceve la risposta dell'assistente |
| `DELETE /sessions/{id}` | Dimentica una conversazione |

- Il loop di **function calling** è gestito lato server: il modello richiede uno strumento, il servizio lo esegue (via le operazioni condivise, con `channel="chat"`), gli restituisce il risultato e ripete finché produce una risposta testuale.
- Le **sessioni** sono in memoria (si azzerano al riavvio) con un cap per non crescere senza limiti — adeguato al PoC; in produzione andrebbero in una cache condivisa.
- La password temporanea non entra mai nel contesto del modello: come per la voce, viene recapitata via email.

**Documentazione interattiva:** http://localhost:8004/docs

### 7. Ticket Service (`ticket_service/` — porta 8005)

Microservizio FastAPI che simula un **ITSM (mock ServiceNow)**. L'agente vi apre un ticket quando non può risolvere una richiesta (fuori dai suoi ambiti, domanda senza risposta in knowledge base, o richiesta esplicita dell'utente); un operatore li gestisce dalla dashboard.

| Endpoint | Descrizione |
|----------|-------------|
| `POST /tickets` | Apre un nuovo ticket (numero incrementale `INCxxxxxxx`) |
| `GET /tickets` | Elenca i ticket (filtri `?status=` e `?caller=`) |
| `GET /tickets/{number}` | Dettaglio di un ticket |
| `PATCH /tickets/{number}` | Cambia stato e/o aggiunge una nota di lavorazione |

- Persistenza su `tickets.json` (scrittura atomica sotto lock, esclusa dal repo).
- I tool `open_support_ticket` e `check_ticket_status` (voce e chat, via `shared/operations.py`) aprono e interrogano i ticket con il canale corretto.

**Documentazione interattiva:** http://localhost:8005/docs

### 8. Analytics Service (`analytics_service/` — porta 8006)

Microservizio FastAPI che genera **analisi AI post-chiamata**. Un job on-demand analizza le trascrizioni con **Gemini** (output strutturato JSON) estraendo per ciascuna: riassunto, esito (risolto/non risolto/escalation), sentiment, intento e un punteggio di qualità 1-5 con motivazione.

| Endpoint | Descrizione |
|----------|-------------|
| `POST /analyze` | Analizza le trascrizioni non ancora processate (batch con cap) |
| `GET /analyses` | Elenca le analisi salvate |
| `GET /summary` | Metriche aggregate (qualità media, distribuzioni di esito/sentiment/intento) |

- L'analisi è **on-demand**: nessun costo LLM a runtime finché non viene invocata; non tocca la latenza delle conversazioni live.
- Output vincolato da uno schema (structured output), quindi sempre parsabile.
- Persistenza su `analyses.json` (esclusa dal repo); la logica di aggregazione è pura e testata.

**Documentazione interattiva:** http://localhost:8006/docs

### 9. Frontend React (`frontend-react/` — porta 5173)

Dashboard di monitoraggio e amministrazione costruita con **React 18 + Vite + TypeScript + Tailwind CSS**. Tema GitHub Dark con palette cromatica personalizzabile via tweak panel.

**Dashboard** — metriche in tempo reale (totale, per canale, successi, falliti), grafico donut distribuzione canale, grafico a barre esito per canale, cronologia operazioni con paginazione.

**Chiamate** — lista trascrizioni voce con visualizzazione a chat, filtro per data.

**Chiamate Live** — le conversazioni vocali in corso (polling): un operatore può cliccare "Prendi in carico" per entrare nella stessa room WebRTC del chiamante. L'agente riconosce l'operatore, annuncia il passaggio e si fa da parte (handoff).

> **Nota** — l'elenco delle room, l'emissione del token operatore e l'ingresso WebRTC sono verificati; il passaggio audio vero e proprio (agente che annuncia e lascia la linea) va validato con una chiamata SIP reale su LiveKit Cloud, perché dipende dall'infrastruttura telefonica.

**Email** — monitoraggio flusso email in entrata/uscita, filtro per stato e data, simulazione invio email.

**Admin** — gestione utenti (CRUD + ricerca per nome/username), simulazione richieste email, cronologia per utente.

**Knowledge** — caricamento documenti (drag & drop di PDF/MD/TXT), lista con conteggio frammenti, eliminazione, e un box "prova una ricerca" che mostra i passaggi che l'agente userebbe per rispondere, con fonte e percentuale di rilevanza.

**Chat** — un widget fluttuante (accanto al pulsante chiamata) per conversare con Sofia in testo: gli stessi strumenti della voce (reset, sblocco, Q&A). La dashboard distingue i canali voce/email/chat nelle metriche e nei grafici.

**Ticket** — coda dei ticket aperti dall'agente: filtro per stato, dettaglio espandibile con descrizione e note, controlli operatore per cambiare stato e aggiungere note di lavorazione.

**Analisi** — analisi AI delle chiamate: pulsante per lanciare l'analisi delle trascrizioni, metriche di sintesi (qualità media, distribuzioni di esito/sentiment/motivo) e il dettaglio per singola conversazione con riassunto e punteggio.

---

## Flusso canale email

```
1. Utente (o frontend Admin) → POST /inbox con corpo richiesta
2. Email Processor (ogni 10s) → GET /inbox?unprocessed_only=true
3. Estrae il campo rilevante con regex
4. Chiama il servizio appropriato su User Service
5. POST /send (email di risposta al mittente)
6. PATCH /inbox/{id}/processed
7. Frontend Dashboard mostra l'aggiornamento in tempo reale
```

---

## Trascrizione e logging delle chiamate

Ogni chiamata viene automaticamente trascritta e salvata in `transcripts/` (esclusa dal repo — generata a runtime).

**Formato file**: `YYYYMMDD_HHMMSS_<room-name>.txt`

```
=== Chiamata: call-f3a9d2b1 — 2026-04-22T14:32:01 ===

AGENTE: Ciao! Come posso aiutarti oggi?
UTENTE: Devo resettare la mia password.
AGENTE: Certo, mi può fornire il suo username?
UTENTE: mario.rossi
AGENTE: La password è stata resettata con successo.

=== Fine chiamata: 2026-04-22T14:35:22 ===
```

Il voice agent sottoscrive tre eventi di `AgentSession`: `user_input_transcribed`, `conversation_item_added`, `close`.

> Gemini Live è un modello audio nativo — la trascrizione proviene dall'STT integrato nel modello, non da un provider esterno.

---

## Prerequisiti

- **Python 3.11+** (consigliato: conda)
- **Node.js 18+** e npm (per il frontend React)
- **Account LiveKit Cloud** — gratuito su https://livekit.io (1.000 min agente/mese)
- **Google API Key** — gratuita su https://aistudio.google.com/apikey
- **Account Twilio** — solo per chiamate telefoniche reali ($15 di credito gratuito alla registrazione)
- **Zoiper** — softphone SIP gratuito per testare le chiamate (https://www.zoiper.com)

> Per testare solo il canale email e il frontend non servono LiveKit, Google né Twilio.

---

## Installazione

### 1. Clona il repository

```bash
git clone https://github.com/BellanovaLuca/aria-agent.git
cd aria-agent
```

### 2. Crea l'ambiente Python e installa le dipendenze

```bash
conda create -n aria-agent python=3.11 -y
conda activate aria-agent

pip install -r user_service/requirements.txt
pip install -r email_service/requirements.txt
pip install -r email_processor/requirements.txt
pip install -r knowledge_service/requirements.txt
pip install -r chat_service/requirements.txt
pip install -r voice_agent/requirements.txt
```

### 3. Installa le dipendenze del frontend

```bash
cd frontend-react && npm install && cd ..
```

### 4. Installa LiveKit CLI (solo per il setup telefonico)

```bash
curl -sSL https://get.livekit.io/cli | bash
```

---

## Configurazione

### 1. Crea il file `.env`

```bash
cp .env.example .env
```

### 2. Compila le chiavi

```env
# LiveKit Cloud — da https://cloud.livekit.io → Settings → API Keys
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Google Gemini Live — da https://aistudio.google.com/apikey
GOOGLE_API_KEY=your_google_api_key

# Twilio SIP — credentials inventate da te
SIP_USERNAME=your-sip-username
SIP_PASSWORD=your-sip-password
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Servizi interni (non modificare se usi le porte di default)
USER_SERVICE_URL=http://localhost:8001
EMAIL_SERVICE_URL=http://localhost:8002
EMAIL_POLL_INTERVAL=10
AGENT_EMAIL=agent@your-domain.local

# Chiave interna condivisa tra i processi — genera con: openssl rand -hex 32
INTERNAL_API_KEY=your_internal_api_key
```

### 3. Setup Twilio + LiveKit (prima volta, solo per canale telefonico)

**Su Twilio Console:**
1. Acquista un numero di telefono
2. Crea un TwiML Bin con il template nel blocco XML della sezione [Componenti infrastrutturali: Twilio](#componenti-infrastrutturali-twilio), sostituendo i placeholder con i valori reali
3. Collega il TwiML Bin al numero in Voice Configuration
4. Crea un SIP Domain con una Credential List (`SIP_USERNAME`/`SIP_PASSWORD`)

**Su LiveKit Dashboard:**
- Crea un Inbound SIP Trunk con il tuo numero Twilio e i range IP Twilio come `allowed_addresses`
- Crea una Dispatch Rule `dispatchRuleIndividual` con `roomPrefix: "call-"` collegata al trunk

**Su Zoiper:**
1. Aggiungi SIP account → Domain: `<nome-sip-domain>.sip.twilio.com`
2. Username/Password: quelli della Credential List
3. Verifica status "Registered"

---

## Avvio e arresto

### Avvio completo

```bash
./run_all.sh
```

| Ordine | Processo | Porta |
|--------|----------|-------|
| 1 | User Service | 8001 |
| 2 | Email Service | 8002 |
| 3 | Knowledge Service | 8003 |
| 4 | Chat Service | 8004 |
| 5 | Ticket Service | 8005 |
| 6 | Analytics Service | 8006 |
| 7 | Email Processor | — |
| 8 | Voice Agent | — |
| 9 | Frontend React (Vite) | 5175 |

`Ctrl+C` ferma tutto tramite trap su `EXIT/INT/TERM`.

### Arresto completo

```bash
./stop_all.sh
```

### Avvio manuale (sviluppo)

```bash
conda activate aria-agent

# Terminale 1
cd user_service && uvicorn main:app --port 8001 --reload

# Terminale 2
cd email_service && uvicorn main:app --port 8002 --reload

# Terminale 3
cd knowledge_service && uvicorn main:app --port 8003 --reload

# Terminale 4
cd chat_service && uvicorn main:app --port 8004 --reload

# Terminale 5
cd ticket_service && uvicorn main:app --port 8005 --reload

# Terminale 6
cd analytics_service && uvicorn main:app --port 8006 --reload

# Terminale 7
python email_processor/processor.py

# Terminale 8 — Voice Agent
python voice_agent/agent.py dev

# Terminale 9 — Frontend
cd frontend-react && npm run dev
```

### Avvio minimale (solo email + frontend, senza voice agent)

```bash
conda activate aria-agent
cd user_service && uvicorn main:app --port 8001 --reload &
cd email_service && uvicorn main:app --port 8002 --reload &
python email_processor/processor.py &
cd frontend-react && npm run dev
```

---

## Test

I test unitari non richiedono chiavi API né rete (gli embedding sono mockati, Qdrant gira in-memory, l'Email Service è simulato):

```bash
conda activate aria-agent

# Knowledge Service — chunking + store vettoriale
cd knowledge_service && python -m pytest tests/ -q

# User Service — sblocco utenza (verifica identità, anti-abuso, stati)
cd user_service && python -m pytest tests/ -q

# Chat Service — loop di function calling con un client Gemini fake
cd chat_service && python -m pytest tests/ -q

# Ticket Service — numerazione INC, filtri, PATCH, persistenza
cd ticket_service && python -m pytest tests/ -q

# Analytics Service — aggregazione, store, /analyze con LLM fake
cd analytics_service && python -m pytest tests/ -q
```

---

## Log e diagnostica

```bash
# Log unificato (quando si usa run_all.sh)
tail -f /tmp/run_all.log

# Filtra solo il voice agent
grep -E "livekit\.agents|AGENTE|UTENTE|TOOL CALL" /tmp/run_all.log

# Filtra errori
grep -iE "error|exception|traceback" /tmp/run_all.log
```

| Sintomo | Causa probabile |
|---------|-----------------|
| Voice agent non si connette | Credenziali LiveKit errate nel `.env` |
| Agente non risponde | Worker non avviato — nessun `registered worker` nei log |
| Tool non chiamato | L'agente ha pronunciato una frase di annuncio e l'utente ha interrotto la generazione |
| Errore 503 su `/token` | `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` mancanti nel `.env` |

---

## Struttura del progetto

```
aria-agent/
│
├── shared/
│   ├── __init__.py
│   ├── auth.py                # Dependency X-Internal-Api-Key condivisa
│   ├── operations.py          # Reset/sblocco/ricerca — logica condivisa voce+chat
│   └── models.py              # Modelli Pydantic condivisi
│
├── user_service/
│   ├── main.py                # FastAPI: CRUD utenti + operazioni + history + token WebRTC
│   └── requirements.txt
│
├── email_service/
│   ├── main.py                # FastAPI: inbox e sent box mock
│   └── requirements.txt
│
├── email_processor/
│   ├── processor.py           # Loop asincrono polling email
│   └── requirements.txt
│
├── knowledge_service/
│   ├── main.py                # FastAPI: upload/list/delete documenti + /search
│   ├── chunker.py             # Estrazione testo + chunking (puro, testato)
│   ├── embeddings.py          # Wrapper embedding Gemini (singleton lazy)
│   ├── store.py               # Vector store Qdrant (indicizza, cerca, elimina)
│   ├── tests/                 # Test unitari (chunker, store con embedding fake)
│   └── requirements.txt
│
├── chat_service/
│   ├── main.py                # FastAPI: /message (chat), sessioni in-memory
│   ├── agent.py               # Loop function-calling Gemini + prompt chat
│   ├── tests/                 # Test del loop con client Gemini fake
│   └── requirements.txt
│
├── ticket_service/
│   ├── main.py                # FastAPI: CRUD ticket (mock ServiceNow), JSON
│   ├── tests/                 # Test numerazione INC, filtri, PATCH, persistenza
│   └── requirements.txt
│
├── analytics_service/
│   ├── main.py                # FastAPI: /analyze, /analyses, /summary
│   ├── analyzer.py            # Analisi Gemini con output strutturato (mockabile)
│   ├── store.py               # Persistenza + aggregazione (puro, testato)
│   ├── tests/                 # Test aggregazione, store, /analyze con LLM fake
│   └── requirements.txt
│
├── voice_agent/
│   ├── agent.py               # Agente LiveKit + Gemini Live + trascrizione
│   ├── tools.py               # Tool functions esposte al LLM
│   └── requirements.txt
│
├── frontend-react/            # Dashboard React
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/             # Dashboard, Calls, Admin, Email, Knowledge
│   │   ├── components/        # Sidebar, MetricCard, StatusBadge, Toast, ...
│   │   ├── hooks/             # useApi, useToast
│   │   ├── utils.ts
│   │   └── types.ts
│   ├── package.json
│   └── vite.config.ts         # Proxy: /api→8001 /email→8002 /knowledge→8003 /chat→8004 /tickets→8005 /analytics→8006
│
├── transcripts/               # Trascrizioni chiamate — generata a runtime, non versionata
│
├── .env                       # Configurazione locale — non committare
├── .env.example               # Template configurazione
├── run_all.sh                 # Avvio unificato
└── stop_all.sh                # Arresto unificato
```

---

## Estensibilità

| Funzionalità | Come aggiungerla |
|---|---|
| Nuovo tool per l'agente vocale | Aggiungi funzione in `voice_agent/tools.py`, registrala nella lista `tools=[...]` in `voice_agent/agent.py` e aggiorna le `INSTRUCTIONS` |
| Nuovi documenti nella knowledge base | Caricali dalla pagina Knowledge della dashboard (o `POST /documents`) — vengono indicizzati e resi disponibili all'agente |
| Vector store in produzione | Avvia un server Qdrant e imposta `QDRANT_URL` — nessuna modifica al codice |
| Email reale (IMAP/SMTP) | Sostituisci `email_processor/processor.py` mantenendo l'interfaccia verso User Service |
| Nuovo canale (WhatsApp, Telegram, ...) | Nuovo modulo che riusa `shared/operations.py` (come fanno voce e chat) con il proprio `channel` |
| Database reale (PostgreSQL, SQLite) | Sostituisci la persistenza JSON in `user_service/main.py` |
| Lingua aggiuntiva | Modifica `language` in `AgentSession` e `INSTRUCTIONS` nell'agente |
| Deploy containerizzato | Ogni processo è indipendente e containerizzabile con Docker |
| LiveKit self-hosted | Configura `livekit/livekit` + `livekit/sip` con Docker Compose, aggiorna `LIVEKIT_URL` |
| Voce diversa | Cambia il parametro `voice` in `GeminiRealtimeModel` (`voice_agent/agent.py`) |
