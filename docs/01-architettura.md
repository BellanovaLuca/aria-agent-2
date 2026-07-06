# 01 — Architettura di sistema

Architettura target su AWS per l'agente di sblocco utenze, canali voce e
testo, con integrazione ServiceNow e Active Directory.

---

## 1. Vista d'insieme

```
   CANALE VOCE — sincrono (real-time)              CANALE TESTO — asincrono (su ticket)
   ─────────────────────────────────              ─────────────────────────────────────
   [Utente al telefono]                            [Utente · email]
          │ PSTN (deviazione centralino)                   │ email
          ▼                                                ▼
   ┌──────────────────────────┐                     ┌──────────────────────────────┐
   │   SIP Trunk Provider     │                     │           SERVICENOW         │
   │ (carrier / Chime SDK)    │                     │  email → ticket (automatico) │
   └────────────┬─────────────┘                     │  sistema di record ITSM      │
                │ SIP/SRTP                           └──────┬─────────────────▲─────┘
┌───────────────│──────── AWS · VPC ────────────────────────│ investiga       │ ticket+esito
│               ▼                                            ▼ ticket sblocco  │  (OAuth2)
│  ┌──────────────┐ WebRTC ┌────────────────────┐   ┌────────────────────┐    │
│  │ LiveKit      │───────►│ Voice Agent Worker  │   │ Text Agent Service │    │
│  │ server + sip │        │ (Nova Sonic 2)      │   │ (Bedrock Converse) │    │
│  └──────────────┘        └─────────┬──────────┘    └─────────┬──────────┘    │
│                                    │ tool call               │ tool call     │
│                                    ▼                         ▼               │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   UNLOCK ORCHESTRATOR (ECS Fargate)                   │──┘
│  │   identify_user / get_account_status / unlock_account                │
│  │   Stato: DynamoDB · Secrets: Secrets Manager · Audit: CloudWatch      │
│  └──────────────────────────────────┬───────────────────────────────────┘
└─────────────────────────────────────│────────────────────────────────────────┘
                                       │ Opzione A: trigger flow ServiceNow
                                       │ AD Spoke → MID Server (on-prem)
                                       ▼
                          ┌───────────────────────────────────────┐
                          │       ACTIVE DIRECTORY (on-prem)       │
                          │   stato account + unlock               │
                          │   (Opzione B: LDAPS diretto via DX/VPN)│
                          └───────────────────────────────────────┘
```

Principio chiave: **i due canali condividono lo stesso Unlock Orchestrator**.
Il canale è solo il punto di ingresso; tutta la logica di business
(identificazione, verifica stato, sblocco, ticketing, audit) vive in un unico
servizio. È lo stesso pattern della PoC (voice agent ed email processor che
condividono lo user service), portato a livello enterprise.

I due canali differiscono per **natura e punto di ingresso**:

- **Voce — sincrono.** Conversazione in tempo reale: l'agente raccoglie lo
  UserID a voce e invoca subito l'orchestrator.
- **Testo — asincrono, guidato dal ticket.** L'utente invia un'**email**, che
  ServiceNow converte **automaticamente in ticket** (Inbound Email Action). Il
  **Text Agent Service** esamina i ticket, individua quelli di sblocco, ne
  estrae i dati (UserID, eventuale nome/cognome) e invoca l'orchestrator. Non
  esiste un frontend web pubblico per il testo: la sorgente di lavoro è
  ServiceNow stesso, che è quindi sia **punto di ingresso** del canale testo
  sia **sistema di record** per entrambi i canali.

> Punti aperti del canale testo (vedi anche [04 — Sicurezza](04-sicurezza-compliance.md)):
> (a) **trigger** del Text Agent — *push* via Business Rule/Flow ServiceNow su
> nuovo ticket di sblocco, oppure *polling* periodico (il push è preferibile:
> niente latenza di poll né query a vuoto); (b) **verifica identità** — il
> mittente dell'email è **spoofabile**, quindi non è un fattore di
> autenticazione (stessa limitazione del CLI sul canale voce).

---

## 2. Componenti

### 2.1 Canale voce

| Componente | Tecnologia | Ruolo |
|---|---|---|
| Ingresso telefonico | Deviazione dal centralino aziendale verso numero dedicato su SIP trunk | Porta la chiamata verso AWS |
| SIP termination | Carrier SIP trunk oppure Amazon Chime SDK Voice Connector | Converte PSTN → SIP verso LiveKit |
| Media server | LiveKit self-hosted (`livekit-server` + `livekit-sip`) su EKS/ECS + Redis (ElastiCache) | SIP → WebRTC, room per chiamata, dispatch verso il worker |
| Voice Agent | Python, LiveKit Agents + `livekit-plugins-aws[realtime]`, ECS Fargate | Sessione conversazionale, tool calls, trascrizione |
| Motore voice | **Amazon Nova Sonic 2** su Amazon Bedrock (stream bidirezionale) | STT + LLM + TTS in un unico modello speech-to-speech, supporto it-IT nativo |

Perché LiveKit self-hosted e non LiveKit Cloud: requisito di compliance — tutto
il media path resta nell'account AWS di destinazione. La PoC usa LiveKit Cloud solo
per comodità di setup; il codice agente è identico nei due casi.

Alternative di telefonia valutate (documentate da AWS nella
[Nova Sonic Telephony Integration Guide](https://aws.amazon.com/blogs/machine-learning/building-ai-powered-voice-applications-amazon-nova-sonic-telephony-integration-guide/)):

| Opzione | Pro | Contro | Verdetto |
|---|---|---|---|
| **SIP trunk → LiveKit self-hosted → Nova Sonic** | Massimo riuso PoC, media in-account, plugin ufficiale AWS↔LiveKit | Gestione operativa di LiveKit (EKS, Redis, porte UDP) | **Consigliata** |
| Amazon Connect | Telefonia completamente gestita, numeri inclusi | Nessuna integrazione nativa Nova Sonic: serve comunque un media bridge custom; costo per minuto più alto | Solo se Connect è già in uso |
| SIP server custom (EC2 + RTP → Bedrock) | Nessuna dipendenza da framework | Reinventa quello che LiveKit/Pipecat fanno già; alto effort | Scartata |

### 2.2 Canale testo

| Componente | Tecnologia | Ruolo |
|---|---|---|
| Ingresso | Casella email del service desk → **ServiceNow Inbound Email Action** | Converte automaticamente l'email in ticket |
| Sorgente di lavoro | **ServiceNow** (ticket di sblocco), via Table API / trigger — non un frontend web | L'agente legge i ticket, non una sessione chat |
| Text Agent | Python su ECS Fargate, Amazon Bedrock **Converse API** con tool use | Individua i ticket di sblocco, estrae i dati e invoca l'orchestrator |
| Modello | Nova (Pro/Lite) o Claude su Bedrock — scelta da validare su qualità it-IT e costi | LLM |

Il Text Agent espone **gli stessi tool** del Voice Agent (definiti una sola
volta nell'Unlock Orchestrator): la differenza è il binding (JSON schema
Bedrock tool-use vs `@llm.function_tool` LiveKit) e il **trigger** (ticket
ServiceNow invece di una sessione vocale).

Essendo **asincrono**, se al ticket mancano dati (UserID assente, identità da
verificare) l'agente aggiorna il ticket / risponde via email richiedendo le
informazioni e riprende alla risposta dell'utente, anziché dialogare in tempo
reale. Trigger (*push* vs *polling*) e verifica identità sono punti aperti:
vedi §1 e [04 — Sicurezza](04-sicurezza-compliance.md).

### 2.3 Unlock Orchestrator (core)

Sostituto di produzione dello `user_service` mock della PoC. FastAPI su ECS
Fargate (≥ 2 task, multi-AZ), API interna non esposta a internet (ALB interno,
security group che accetta solo i task agente).

| Endpoint interno | Funzione |
|---|---|
| `POST /requests` | Apre una richiesta di sblocco (crea correlazione + ticket ServiceNow in stato "in lavorazione") |
| `GET /accounts/{user_id}/status` | Verifica esistenza account e stato lock su AD |
| `POST /requests/{id}/unlock` | Esegue lo sblocco e aggiorna il ticket con l'esito |
| `POST /requests/{id}/escalate` | Escalation: assegna il ticket al gruppo service desk |
| `GET /health`, `GET /ready` | Liveness / readiness |

Stato e persistenza:

- **DynamoDB** — stato richieste, correlation ID, idempotency key (lo sblocco è
  naturalmente idempotente: sbloccare un account già sbloccato è un no-op, ma
  l'idempotency key evita ticket duplicati su retry).
- **Secrets Manager** — credenziali OAuth ServiceNow, eventuale service account LDAP.
- **S3 (cifrato KMS, lifecycle policy)** — trascrizioni conversazioni.

### 2.4 Integrazioni esterne

Dettaglio completo in [03 — Integrazione ServiceNow e AD](03-integrazione-servicenow-ad.md). In sintesi:

- **ServiceNow** — REST (Table API / Flow trigger), OAuth2 client credentials.
  Ogni richiesta di sblocco genera un ticket; l'esito (successo, fallimento,
  escalation) aggiorna e chiude il ticket. ServiceNow è il **sistema di record**.
- **Active Directory** — **Opzione A (consigliata):** lo sblocco è eseguito da
  ServiceNow stesso tramite IntegrationHub **Microsoft AD Spoke** + MID Server
  on-prem. L'orchestrator non tocca mai AD direttamente. **Opzione B:** LDAPS
  diretto dall'orchestrator via Direct Connect/VPN.

---

## 3. Gap analysis: PoC → produzione

| Aspetto | PoC (questo repo) | Produzione |
|---|---|---|
| Caso d'uso | Reset password (genera password temporanea) | **Solo sblocco utenze** — nessuna password trattata |
| Motore voice | Google Gemini Live (`gemini-2.5-flash-native-audio`) | Amazon Nova Sonic 2 su Bedrock (`livekit-plugins-aws[realtime]`) |
| Media server | LiveKit Cloud | LiveKit self-hosted in VPC (EKS/ECS) |
| PSTN gateway | Twilio + TwiML Bin | SIP trunk carrier / Chime SDK Voice Connector |
| Canali | Voce + email + web call | Voce (telefono) + testo (email → ticket ServiceNow) |
| Sistema utenti | Mock FastAPI + `db.json` | Active Directory (via ServiceNow AD Spoke) |
| Ticketing | Assente (history su JSON) | ServiceNow (sistema di record) |
| Hosting servizi | Processi locali (`run_all.sh`) | ECS Fargate multi-AZ, IaC (Terraform/CDK) |
| Segreti | `.env` | AWS Secrets Manager + IAM |
| Trascrizioni | File `.txt` locali | S3 cifrato KMS, retention policy |
| Osservabilità | Log su `/tmp/run_all.log` | CloudWatch Logs/Metrics/Alarms, X-Ray, dashboard |
| Autenticazione utente | Nessuna (fornisce solo username) | UserID + verifica nome/cognome + CLI logging (vedi doc 04) |

**Cosa si riusa della PoC:** il framework LiveKit Agents e la struttura
dell'agente (`AgentSession`, eventi di trascrizione, `@llm.function_tool`),
il pattern "agente sottile + servizio di orchestrazione", il prompt design
(persona, regola "tool call silenziosa" che ha risolto i problemi di
interruzione osservati nei transcript), la dashboard React come base per il
monitoraggio.

---

## 4. Infrastruttura AWS

| Servizio | Uso |
|---|---|
| **VPC** | Subnet private per tutti i workload; NAT solo dove serve; VPC endpoint per Bedrock, DynamoDB, S3, Secrets Manager, CloudWatch (il traffico verso Bedrock non esce su internet) |
| **EKS o ECS** | LiveKit server/SIP (richiede rete host/UDP → EKS con node group dedicato, oppure ECS EC2); agenti e orchestrator su ECS Fargate |
| **ElastiCache Redis** | Coordinamento nodi LiveKit |
| **Amazon Bedrock** | Nova Sonic 2 (voce), Nova/Claude (testo). Verificare disponibilità regionale di Nova Sonic 2 nella regione target (es. `eu-central-1`) in fase 2; in assenza, valutare l'impatto data-residency di un cross-region inference profile |
| **DynamoDB** | Stato richieste, idempotency |
| **S3 + KMS** | Trascrizioni, registrazioni (se richieste), cifratura at-rest |
| **Secrets Manager** | Credenziali ServiceNow/LDAP, chiavi API LiveKit |
| **CloudWatch + X-Ray** | Log strutturati JSON, metriche RED, tracing, allarmi |
| **WAF + CloudFront + API Gateway** | *(opzionale)* solo se in futuro si aggiunge un portale web self-service; nel modello a ticket il canale testo non ha ingress pubblico (l'email entra in ServiceNow, che il Text Agent interroga via REST) |
| **Direct Connect / Site-to-Site VPN** | Solo se Opzione B per AD (LDAPS diretto) |

Deploy via IaC (Terraform o CDK), ambienti separati dev/staging/prod,
pipeline CI/CD con gate (lint, test, scan dipendenze e immagini).

---

## 5. Osservabilità

- **Logging:** JSON strutturato, `correlation_id` generato all'ingresso
  (chiamata o apertura del ticket) e propagato fino a ServiceNow (campo del ticket)
  e nei log di tutti i componenti. Mai PII in chiaro oltre lo UserID; mai
  audio nei log.
- **Metriche RED per canale:** chiamate/ticket al minuto, errori, durata
  (P50/P95/P99); più metriche di business: sblocchi riusciti/falliti,
  escalation, latenza voice-to-voice.
- **Tracing:** X-Ray su orchestrator → ServiceNow (l'hop verso AD è visibile
  nel ticket ServiceNow).
- **Allarmi:** sintomi, non cause — es. "success rate < 90% su 15 min",
  "nessuna chiamata gestita in orario lavorativo da 30 min", "P95 latenza
  voce > 3 s". Ogni allarme con runbook.

I KPI di prodotto (containment, AHT, success rate) si derivano da queste
metriche + dai ticket ServiceNow; la dashboard React della PoC si evolve in
dashboard di monitoraggio leggendo da CloudWatch/DynamoDB invece che dal mock.

---

## Riferimenti

- [Amazon Nova Sonic — Telephony Integration Guide (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/building-ai-powered-voice-applications-amazon-nova-sonic-telephony-integration-guide/)
- [Build real-time conversational AI using Nova Sonic and LiveKit (AWS ML Blog)](https://aws.amazon.com/blogs/machine-learning/build-real-time-conversational-ai-experiences-using-amazon-nova-sonic-and-livekit/)
- [Nova Sonic integration guide — LiveKit Docs](https://docs.livekit.io/agents/integrations/realtime/nova-sonic/)
- [livekit-plugins-aws — PyPI](https://pypi.org/project/livekit-plugins-aws/)
- [Amazon Nova — Integrations (docs AWS)](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-integrations.html)
