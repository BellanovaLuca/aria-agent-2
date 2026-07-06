# 03 — Integrazione ServiceNow e Active Directory

---

## 1. Ruoli dei sistemi

| Sistema | Ruolo | Principio |
|---|---|---|
| **ServiceNow** | Sistema di record ITSM: ogni richiesta di sblocco è un ticket con ciclo di vita completo | Nessuna operazione su AD senza ticket corrispondente |
| **Active Directory** | Sistema di identità: stato dell'account (`lockedOut`, `enabled`) e operazione di unlock | L'agente non modifica mai altri attributi oltre allo sblocco |

> Nel progetto questo ruolo è simulato dal mock `ticket_service` (numeri `INCxxxxxxx`,
> stati `new/in_progress/resolved/closed`, note di lavorazione): stessa forma del
> ciclo di vita del ticket, così l'integrazione con ServiceNow reale è una
> sostituzione del backend dietro le stesse operazioni (`open_ticket`,
> `get_ticket_status` in `shared/operations.py`).

---

## 2. Integrazione ServiceNow

### 2.1 Autenticazione

- **OAuth 2.0 client credentials** (endpoint `/oauth_token.do`), client dedicato
  per l'orchestrator con scope minimi.
- Credenziali in AWS Secrets Manager, rotazione documentata (≤ 90 giorni).
- Account di integrazione ServiceNow con ruolo custom limitato alle tabelle e
  ai flow necessari (no `admin`, no `itil` completo).
- Access token cachato e rinnovato a scadenza; mai loggato.

### 2.2 Operazioni

| Operazione | API ServiceNow | Quando |
|---|---|---|
| Ingresso email (canale testo) | **Inbound Email Action** (nativa ServiceNow) | L'email dell'utente viene convertita automaticamente in ticket di sblocco |
| Lettura ticket di sblocco (canale testo) | Table API `GET /api/now/table/incident` (filtro categoria/stato) o trigger Flow | Il Text Agent individua i ticket da lavorare |
| Creazione ticket (canale voce) | Table API `POST /api/now/table/incident` (o `sc_request` se si preferisce il modello richiesta — da decidere con il process owner ITSM) | All'avvio di una richiesta vocale (sul canale testo il ticket **esiste già**, creato dall'email) |
| Aggiornamento work notes | `PATCH /api/now/table/incident/{sys_id}` | Ad ogni transizione di stato |
| Chiusura con esito | `PATCH` con `state=Resolved`, `close_code`, `close_notes` | Sblocco riuscito / non necessario |
| Escalation | `PATCH` con `assignment_group=<service desk>` | Tutti i casi non risolvibili dall'agente |
| Esecuzione azioni AD | Trigger di un **Flow** IntegrationHub (REST trigger) che incapsula le azioni dell'AD Spoke | Verifica stato + unlock (Opzione A) |

Campi del ticket valorizzati dall'agente: `caller_id` (lookup da UserID),
`short_description` ("Sblocco utenza — canale voce/testo"), `category`,
`u_correlation_id` (correlation ID end-to-end), `contact_type`
(`phone`/`email`), work notes con la timeline delle operazioni
(mai la trascrizione integrale — solo eventi).

### 2.3 Resilienza

- Timeout espliciti (connect 5 s / read 15 s), retry con backoff + jitter solo
  su errori transient (timeout, 5xx, 429), max 2 tentativi.
- **Idempotency**: la creazione ticket usa il `correlation_id` come chiave —
  prima della creazione si verifica l'esistenza di un ticket aperto con lo
  stesso correlation ID (previene duplicati su retry).
- Circuit breaker: se ServiceNow è giù, il canale comunica indisponibilità
  e non opera su AD (il ticket è precondizione dell'unlock).
- Rate limit ServiceNow (REST API quota): budget richieste monitorato.

---

## 3. Integrazione Active Directory

### 3.1 Opzione A — via ServiceNow IntegrationHub AD Spoke (consigliata)

L'orchestrator **non parla mai direttamente con AD**: invoca flow ServiceNow
che eseguono le azioni del [Microsoft AD Spoke](https://www.servicenow.com/docs/r/integrate-applications/integration-hub/microsoft-ad-spoke.html)
tramite **MID Server** installato nella rete on-premise aziendale.

```
Orchestrator (AWS) ──HTTPS/OAuth2──► ServiceNow ──(coda MID, outbound)──► MID Server (on-prem)
                                                                              │ PowerShell
                                                                              ▼
                                                                       Domain Controller
                                                                       Get-ADUser / Unlock-ADAccount
```

Azioni dello spoke utilizzate:

| Azione AD Spoke | Uso |
|---|---|
| *Look Up User* / *Get User Details* | Esistenza account, `lockedOut`, `enabled`, `displayName` (per verifica nome/cognome) |
| *Unlock User account* | Sblocco (`lockoutTime = 0`) |

Prerequisiti dell'ambiente di destinazione:

- ServiceNow con plugin **IntegrationHub** e **Microsoft AD Spoke** attivi
  (verificare il licensing IntegrationHub: le azioni spoke consumano
  transazioni).
- **MID Server** (di norma già presente per Discovery) con accesso ai DC.
- **Service account AD** con privilegio delegato minimo: *Read* +
  *Unlock account* sulle OU degli utenti — non un account admin di dominio
  (delega granulare via "Delegate Control" sulla OU).
- Credenziale Windows del service account configurata in ServiceNow
  (credential store, cifrata).

Vantaggi: nessuna connettività di rete AWS→on-prem da costruire (il MID Server
fa solo outbound verso ServiceNow), audit unificato nell'ITSM, riuso della
governance ITSM esistente, superficie d'attacco minima.
Svantaggio: latenza più alta (ServiceNow → coda MID → PowerShell, tipicamente
2–10 s) — accettabile per questo caso d'uso e gestita dal budget di 20 s del
tool call con fallback "presa in carico asincrona".

### 3.2 Opzione B — LDAPS diretto dall'orchestrator

Solo se IntegrationHub/AD Spoke non è disponibile o servono latenze minime:

- Connettività **Direct Connect o Site-to-Site VPN** tra VPC e rete on-prem.
- LDAPS (636/TCP) verso ≥ 2 domain controller, certificati validati.
- Service account dedicato (stesso principio di delega minima), credenziali in
  Secrets Manager, rotazione.
- Operazioni: bind, search per `sAMAccountName`, lettura `lockoutTime` /
  `userAccountControl`, write `lockoutTime = 0`.
- Il ticket ServiceNow resta comunque obbligatorio (creato prima, aggiornato dopo).

Costi/effort maggiori (rete ibrida, firewall, gestione credenziali AD in
cloud, audit separato da costruire) — da scegliere solo su requisito esplicito.

### 3.3 Confronto

| Criterio | A — AD Spoke via ServiceNow | B — LDAPS diretto |
|---|---|---|
| Connettività da costruire | Nessuna | DX/VPN + firewall |
| Audit | Unificato in ServiceNow | Da costruire (CloudWatch + eventi DC) |
| Latenza unlock | 2–10 s | < 1 s |
| Credenziali AD esposte | Solo on-prem (MID) | In cloud (Secrets Manager) |
| Dipendenze licensing | IntegrationHub | Nessuna |
| **Raccomandazione** | ✅ Default | Solo su requisito di latenza |

---

## 4. Identificazione dell'utente

Dati disponibili (da analisi dei requisiti: confidenziali ma non critici,
utilizzabili per l'identificazione):

1. **UserID** — chiave primaria di ricerca su AD (`sAMAccountName`).
2. **Nome e cognome** — verifica di coerenza opzionale contro `displayName` /
   `givenName` + `sn` (match normalizzato: case-insensitive, accenti).
3. **Numero chiamante (CLI)** — non usato come fattore di autenticazione
   (spoofabile), ma registrato nel ticket per audit e usato per il rate
   limiting.

Politica: il livello di verifica è **configurabile** (solo UserID / UserID +
nome-cognome obbligatorio) per adeguarsi alla policy di sicurezza aziendale
senza modifiche al codice. Razionale completo e misure anti-abuso in
[04 — Sicurezza e compliance](04-sicurezza-compliance.md).

---

## Riferimenti

- [Microsoft Active Directory Spoke — ServiceNow Docs](https://www.servicenow.com/docs/r/integrate-applications/integration-hub/microsoft-ad-spoke.html)
- [Microsoft AD V2 Spoke — ServiceNow Docs (Zurich)](https://www.servicenow.com/docs/bundle/zurich-integrate-applications/page/administer/integrationhub-store-spokes/concept/ms-ad-v2-spoke.html)
- [How To Set Up Microsoft AD Spoke — ServiceNow KB0852206](https://support.servicenow.com/kb?id=kb_article_view&sysparm_article=KB0852206)
