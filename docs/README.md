# Agente AI per Sblocco Utenze — Documentazione Tecnica

> Documentazione di progetto per l'evoluzione della PoC (LiveKit + Gemini Live)
> verso una **possibile soluzione di produzione** su ambiente **AWS** con
> **Amazon Nova Sonic** e possibili integrazioni con **ServiceNow** e
> **Active Directory**.

## Scope

L'agente gestisce **esclusivamente lo sblocco di utenze di dominio** (account
Active Directory in stato `locked-out`), tramite due canali:

| Canale | Ingresso | Motore conversazionale |
|---|---|---|
| **Voce** | Chiamata telefonica deviata verso numero dedicato (sincrono) | Amazon Nova Sonic 2 (speech-to-speech, it-IT) su Amazon Bedrock |
| **Testo** | Email → ticket ServiceNow automatico, esaminato dal Text Agent (asincrono) | Amazon Bedrock (Converse API) con lo stesso layer di tool |

A differenza della PoC (reset password con servizio utenti mock e canale
email diretto), la soluzione di produzione:

- **non genera né gestisce password** — esegue solo l'operazione di unlock;
- usa **ServiceNow** come sistema di record (ticket ITSM per ogni richiesta);
- usa **Active Directory** come sistema di identità (verifica stato + unlock);
- gira interamente in un **ambiente AWS dedicato**.

## Indice dei documenti

| Documento | Contenuto |
|---|---|
| [01 — Architettura di sistema](01-architettura.md) | Architettura target AWS (voce + testo), componenti, gap analysis PoC → produzione |
| [02 — Workflow end-to-end](02-workflow.md) | Flussi conversazionali e di sistema: happy path, casi di errore, escalation |
| [03 — Integrazione ServiceNow e Active Directory](03-integrazione-servicenow-ad.md) | Pattern di integrazione, API, autenticazione, opzioni a confronto |
| [04 — Sicurezza e compliance](04-sicurezza-compliance.md) | Trust boundary, minimizzazione dati, cifratura, audit, GDPR, anti-abuso |
| [TAV.01 — Tavola di architettura](architettura.html) | Diagramma grafico vettoriale (aprire nel browser; stampabile/esportabile in PDF-PNG) |
| [architettura.drawio](architettura.drawio) | Sorgente editabile del diagramma per [draw.io / diagrams.net](https://app.diagrams.net) |

## Dati trattati

| Dato | Ruolo | Classificazione |
|---|---|---|
| UserID (sAMAccountName) | Identificativo primario | Confidenziale, non critico |
| Nome e cognome | Verifica secondaria opzionale | Confidenziale, non critico |
| Numero chiamante (CLI) | Correlazione/audit, anti-abuso | Confidenziale |
| Trascrizione conversazione | Audit e quality assurance | Confidenziale, retention limitata |

Non vengono trattati: password, OTP, dati di pagamento, dati sanitari.
Dettagli in [04 — Sicurezza e compliance](04-sicurezza-compliance.md).

## KPI di prodotto (baseline da definire con gli stakeholder)

| KPI | Definizione | Target indicativo |
|---|---|---|
| **Containment rate** | % richieste risolte senza intervento umano | ≥ 80% |
| **Success rate** | % sblocchi completati / richieste valide | ≥ 95% |
| **Tempo medio di gestione (AHT)** | Durata media chiamata / gestione ticket | ≤ 2 min |
| **Escalation rate** | % richieste passate al service desk | ≤ 15% |
| **Latenza di risposta vocale** | Tempo percepito tra fine frase utente e risposta | ≤ 1,5 s P95 |
| **Disponibilità** | Uptime del servizio (canale voce) | ≥ 99,5% |

Tutti i KPI sono misurabili dai dati già strumentati nell'architettura
(CloudWatch metrics + ticket ServiceNow), vedi [01 — Architettura](01-architettura.md#osservabilità).

## Roadmap di progetto

| Fase | Contenuto | Output |
|---|---|---|
| **1. Design** *(questa fase)* | Architettura finale + documentazione tecnica | Questi documenti, approvazione degli stakeholder |
| **2. Foundation AWS** | Landing zone, VPC, connettività verso ServiceNow/AD, IAM, KMS | Ambiente dev/staging funzionante |
| **3. Core build** | Unlock Orchestrator, integrazione ServiceNow (sandbox), integrazione AD (ambiente di test) | Flusso unlock end-to-end via API |
| **4. Canale voce** | LiveKit self-hosted + Nova Sonic + SIP trunk, deviazione numero | Chiamata reale end-to-end in staging |
| **5. Canale testo** | Inbound email → ticket ServiceNow + agente testuale Bedrock | Flusso email → ticket → sblocco end-to-end in staging |
| **6. Hardening** | Pen test, threat model review, load test, runbook, alerting | Go-live checklist completata |
| **7. Produzione** | Rollout progressivo (es. % traffico deviata), misurazione KPI | Servizio in produzione, report KPI |
