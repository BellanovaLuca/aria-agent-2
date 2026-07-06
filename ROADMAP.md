# ROADMAP — Aria Agent

Evoluzione del progetto da PoC "reset password" a **piattaforma multicanale di
supporto IT**. Questo documento traccia lo stato attuale, le fasi realizzate
(con le implementazioni) e le direzioni candidate.

> La cartella [`docs/`](docs/README.md) è cosa diversa: descrive la possibile
> evoluzione **in produzione su AWS** (Nova Sonic, ServiceNow, Active Directory).

---

## Stato attuale

| | |
|---|---|
| **Canali** | voce (telefono/WebRTC), email, chat testuale |
| **Capacità agente** | reset password, sblocco utenze (con verifica identità), Q&A su knowledge base (RAG), apertura/consultazione ticket, handoff a operatore |
| **Dashboard** | metriche 3-canali, cronologia, gestione utenti, knowledge base, chiamate live, ticket, analisi AI |
| **Servizi** | user · email · knowledge · chat · ticket · analytics (8001-8006) + email_processor + voice_agent + frontend (5175) |
| **Qualità** | 40 test automatici, API key interna su tutti gli endpoint, password mai esposte, dipendenze pinnate |

Struttura del repo, avvio e dettaglio dei servizi: vedi il [README](README.md).

---

## Fasi realizzate

### Fase 0 — Hardening
Messa in sicurezza della base prima di ogni evoluzione.
- **API key interna** (`X-Internal-Api-Key`, `shared/auth.py`) su tutti gli endpoint; il proxy Vite la inietta lato server (il browser non la vede). CORS ristretto alle origini locali.
- **Password temporanee** generate con `secrets` (62¹⁰) e mai più presenti in history/log/contesto del modello: recapitate solo via email — ora anche per i reset da voce/chat.
- Error handling nel tool voce (`raise_for_status` + risposta di cortesia), idempotenza claim-first nell'email processor, scritture `db.json` atomiche con lock.
- Dipendenze Python pinnate; `db.json` rimosso dal tracking git.

### Fase 1 — RAG + sblocco utenze
- **`knowledge_service` (8003)**: vector store **Qdrant** locale (embed Gemini `gemini-embedding-001`), chunking a finestra scorrevole, upload PDF/MD/TXT, `/search` con citazione della fonte. Moduli separati e testati.
- **Sblocco utenze**: `POST /unlock-account` con verifica identità (nome+cognome), anti-abuso (`MAX_UNLOCKS_24H`), campo `operation` reset|unlock nella history.
- **Agente multi-intent**: tool `unlock_account` e `search_knowledge_base` accanto a `reset_user_password`; prompt riscritto con regola anti-allucinazione (rispondere solo dai passaggi della KB).
- **Frontend**: pagina Knowledge (upload, lista, ricerca di prova) e badge Reset/Sblocco nella cronologia.

### Fase 2 — Web chat + handoff operatore
- **`chat_service` (8004)**: assistente "Sofia" in chat via `gemini-2.5-flash` con **function calling** (loop tool server-side); sessioni in-memory con cap. Logica condivisa con la voce tramite `shared/operations.py`.
- **Canale chat** nei modelli e nei grafici della dashboard (donut generalizzato a N segmenti, card "Via Chat"); widget **ChatPanel** nel frontend.
- **Handoff operatore**: `GET /rooms` (LiveKit server API) + `GET /operator-token`; l'agente lascia la room quando entra un operatore; pagina **Chiamate Live** con "Prendi in carico" (join WebRTC). *Il passaggio audio va validato con una chiamata SIP reale.*

### Fase 3 — Ticketing + analisi AI
- **`ticket_service` (8005)**: mock ServiceNow — numeri `INCxxxxxxx`, persistenza JSON atomica, PATCH stato/note. Tool `open_support_ticket` e `check_ticket_status` (voce + chat). Pagina Ticket con controlli operatore.
- **`analytics_service` (8006)**: analisi AI post-chiamata delle trascrizioni con Gemini (**output strutturato**): riassunto, esito, sentiment, intento, qualità 1-5. Job on-demand; pagina Analisi con metriche aggregate.

### Refactor & organizzazione
- Servizi sotto `services/`, script sotto `scripts/`, `frontend/` (ex `frontend-react`), `shared/` come libreria alla radice.
- Path della repo root risolti con un finder robusto (marker `.env.example`), non più con conteggio dei livelli.
- Script portabili (nessun path conda hardcoded, `python -m uvicorn` dall'ambiente attivo).

---

## Fasi candidate

### A — Robustezza e qualità ✅
- Fix dei bug frontend noti (leak `<audio>` in CallPanel, "X" del DatePicker, errori di rete silenziati) e rimozione di codice morto.
- **ESLint + Prettier** configurati, **vitest** con test su `utils`.
- **CI GitHub Actions**: pytest dei servizi + lint/test/build del frontend a ogni push/PR.
- **Docker Compose**: `docker compose up --build` avvia l'intero stack (6 servizi + email processor + dashboard nginx); stato su volumi persistenti.

### B — Nuove funzionalità dell'agente
Verifica identità con **OTP**, **chiamate outbound** (l'agente richiama), **voicemail + callback**, **multi-persona** (registry di configurazioni per più casi d'uso/clienti).

### C — Produzione su AWS
Il salto descritto in [`docs/`](docs/README.md): Amazon **Nova Sonic** su Bedrock, LiveKit self-hosted, **ServiceNow** reale, **Active Directory**, infrastruttura ECS/DynamoDB/S3/Secrets Manager con IaC. È un progetto a sé (settimane).

---

## Passi manuali (a carico del maintainer)
- Rotazione delle credenziali SIP Twilio.
- Gestione del vecchio repository pubblico `aria-agent` (contiene credenziali reali nella history).
