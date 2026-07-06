# 04 — Sicurezza e compliance

---

## 1. Modello di rischio del caso d'uso

Lo **sblocco di un account** è un'operazione a rischio intrinsecamente più
basso del reset password: non viene generata né comunicata alcuna credenziale.
Un attaccante che ottiene lo sblocco di un account altrui **non ottiene
l'accesso** — gli serve comunque la password. Il rischio residuo principale è
l'**abilitazione di attacchi brute-force**: sbloccare ripetutamente un account
sotto attacco vanifica la lockout policy.

Mitigazioni dedicate (sezione 5): rate limiting per account, rilevamento
sblocchi ripetuti, audit completo.

I dati trattati (UserID, nome/cognome) sono classificati come
**confidenziali ma non critici**, utilizzabili per l'identificazione;
l'offuscamento dei dati è stato valutato **non necessario** in fase di
analisi. Le misure seguenti partono da questa baseline e applicano comunque
minimizzazione e cifratura standard.

## 2. Trust boundary e validazione

```
[Utente/PSTN ]─TB1─[SIP/LiveKit]─TB2─[Voice Agent]─┐
                                                    ├─TB3─[Orchestrator]─TB4─[ServiceNow]─TB5─[MID/AD]
[Utente/email]─TB1─[ServiceNow: email→ticket]─TB2─[Text Agent]─┘
```

(ServiceNow compare due volte: come **punto di ingresso** del canale testo
— Inbound Email Action — e come **sistema di record/AD-executor** a valle.)

- **TB1 (ingresso):** SIP trunk con allow-list IP del carrier + SRTP; il canale
  testo entra via **email → ServiceNow Inbound Email Action**. Il **mittente
  dell'email non è un fattore di autenticazione** (spoofabile, esattamente come
  il CLI sul canale voce): l'identità si verifica solo sui dati del ticket
  (UserID, nome/cognome) contro AD, non sull'origine del messaggio. Rate
  limiting per mittente/UserID; il contenuto del ticket è trattato come input
  non fidato.
- **TB2 (media→agente):** l'agente tratta tutto l'input vocale/testuale come
  **non fidato**. L'output del modello (parametri dei tool call) è anch'esso
  non fidato finché non validato.
- **TB3 (agente→orchestrator):** API interna (ALB interno, security group,
  mTLS o token di servizio). Validazione schema Pydantic di ogni richiesta:
  `user_id` con whitelist charset (`[a-zA-Z0-9._-]`, max 64), `full_name`
  max 128 con charset esteso; rifiuto di tutto il resto. Lo `user_id` non è
  mai interpolato in query/comandi: passa solo come parametro tipato verso
  ServiceNow.
- **TB4/TB5:** OAuth2 + TLS ≥ 1.2 verso ServiceNow; il MID Server esegue le
  azioni AD con service account a privilegio delegato minimo (solo
  read + unlock sulle OU utenti).

**Prompt injection:** l'utente può dire qualsiasi cosa al modello, quindi la
difesa non è nel prompt ma nei vincoli strutturali — l'agente dispone *solo*
dei tool di sblocco; l'orchestrator applica le regole indipendentemente da ciò
che il modello chiede (default deny: nessun tool può fare altro che
verificare/sbloccare/escalare, e ogni richiesta è rivalidata server-side).

## 3. Identificazione utente e anti-enumeration

- Livello di verifica configurabile: solo UserID, oppure UserID + nome/cognome
  coerenti con AD (raccomandato in produzione).
- In caso di mismatch l'agente **non rivela quale dato è errato** né conferma
  l'esistenza dell'account: messaggio uniforme + escalation al service desk.
- Né il CLI (numero chiamante, voce) né il **mittente dell'email** (testo) sono
  fattori di autenticazione: registrati a fini di audit ma spoofabili.
  Sul canale testo l'identità deriva quindi solo dai dati del ticket (UserID,
  nome/cognome), verificati contro AD con lo stesso livello configurabile.
- Possibile estensione futura (qualora il requisito venga alzato): callback al
  numero registrato in AD/HR, o verifica tramite ticket pre-esistente.

## 4. Protezione dei dati

| Dato | Misura |
|---|---|
| Audio conversazione | Solo streaming verso Bedrock via **VPC endpoint** (nessun transito internet); Bedrock non utilizza i dati trattati per l'addestramento dei modelli; nessuna registrazione audio persistita salvo requisito esplicito |
| Trascrizioni | S3 con cifratura **KMS** (chiave dedicata), bucket policy restrittiva, **lifecycle: retention 90 giorni** (da validare con il DPO), access logging |
| Stato richieste (DynamoDB) | Cifratura at-rest KMS, TTL allineato alla retention |
| Credenziali (ServiceNow, LiveKit, ev. LDAP) | Secrets Manager, rotazione ≤ 90 giorni, accesso via IAM role per task, mai in env/log |
| Log | JSON strutturato; UserID ammesso nei log (necessario all'audit), mai nome completo né trascrizioni nei log applicativi; nessun token/secret, nessuno stack trace verso l'utente |
| In transito | TLS ≥ 1.2 ovunque; SRTP sul media; email verso ServiceNow su TLS (STARTTLS). (HSTS + cookie `HttpOnly; Secure; SameSite` + CSP restrittiva solo se in futuro si aggiunge un portale web) |

**Data residency:** tutti i dati persistiti restano nella regione AWS
selezionata. Punto aperto di fase 2: disponibilità regionale di Nova Sonic 2 —
se serve un cross-region inference profile, l'impatto va validato con il DPO.

## 5. Anti-abuso

| Controllo | Soglia (configurabile) | Azione |
|---|---|---|
| Sblocchi per stesso UserID | > 2 in 24 h | L'agente non procede, escalation obbligatoria; il pattern "lock→unlock ripetuto" è il segnale di un possibile brute-force in corso |
| Richieste per stesso CLI / mittente email | > 5 in 1 h | Rifiuto cortese + log di sicurezza |
| Richieste totali (backpressure) | Cap su sessioni/ticket concorrenti | Il SIP trunk risponde occupato / i ticket si accodano; 503 con `Retry-After` sulle API |
| Tentativi UserID falliti nella stessa sessione | > 2 | Escalation, nessun ulteriore lookup |

Gli eventi anti-abuso generano metriche CloudWatch dedicate + allarme verso il
SOC aziendale (formato integrabile col SIEM via CloudWatch → Kinesis/
EventBridge, da definire in fase 6).

## 6. Audit e accountability

Ogni richiesta produce una catena verificabile:

1. **Ticket ServiceNow** (sistema di record): chi, quando, canale, esito,
   correlation ID.
2. **DynamoDB**: macchina a stati con timestamp per transizione.
3. **CloudWatch Logs**: log applicativi correlati via `correlation_id`.
4. **CloudTrail**: ogni chiamata AWS (Bedrock, KMS, Secrets Manager).
5. **Event log dei Domain Controller**: l'unlock eseguito dal service account
   è tracciato nativamente da AD (Event ID 4767) — il service account dedicato
   rende gli sblocchi dell'agente distinguibili da quelli manuali.

## 7. Compliance (GDPR)

- **Minimizzazione:** si trattano solo UserID, nome/cognome (opzionale), CLI e
  trascrizione — il minimo per erogare il servizio e garantire l'audit.
- **Base giuridica e informativa:** trattandosi di dipendenti
  dell'organizzazione, tipicamente legittimo interesse/contratto — da
  confermare col DPO.
  **Annuncio a inizio chiamata**: l'utente è informato che parla con un
  assistente automatico e che la conversazione è trascritta.
- **Retention:** trascrizioni 90 giorni (proposta), ticket secondo la policy
  ITSM aziendale; nessun dato conservato da Bedrock.
- **Diritti dell'interessato:** le trascrizioni sono ricercabili per
  correlation ID/UserID → cancellazione puntuale possibile.
- **Registro dei trattamenti:** la presente documentazione fornisce gli
  elementi per il suo aggiornamento.

## 8. Checklist di hardening pre-produzione (fase 6)

- [ ] Threat model review congiunto (questo documento come input).
- [ ] Pen test su API e sul flusso **email → ticket** (spoofing del mittente,
      injection nel corpo dell'email che finisce nel ticket e poi nel prompt);
      test di social engineering sul flusso voce (tentativi di sblocco di
      account altrui, prompt injection).
- [ ] Verifica delega minima del service account AD (no admin di dominio).
- [ ] Secret scan + dependency/container scan in CI (gate bloccante).
- [ ] Test RBAC: l'account di integrazione ServiceNow non può operare fuori
      dalle tabelle/flow previsti.
- [ ] Game day: ServiceNow giù, MID Server giù, Bedrock throttling, caduta
      chiamata durante `UNLOCKING`.
- [ ] Validazione retention/cancellazione con DPO.
- [ ] Runbook per ogni allarme + test end-to-end della notifica on-call.
