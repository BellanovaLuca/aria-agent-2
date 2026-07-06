# Guida IT aziendale — Domande frequenti

Documento di esempio per la knowledge base. Carica questo file nella pagina
**Knowledge** della dashboard (o vedi lo script in `samples/`) per far sì che
l'assistente "Sofia" risponda alle domande IT attingendo a questi contenuti.

## VPN — accesso remoto

Per collegarti alla rete aziendale da casa:

1. Apri l'applicazione **GlobalConnect** (icona blu sul desktop o nel menu Start).
2. Inserisci il tuo username aziendale e la password.
3. Nel campo "Gateway" seleziona **Sede-Milano-Nord** oppure **Sede-Roma-Sud** in
   base alla tua sede di appartenenza.
4. Premi **Connetti** e approva la notifica push sull'app **Authenticator** del
   telefono (secondo fattore).

Se la connessione cade spesso, passa da rete Wi-Fi a un cavo ethernet e verifica
di avere almeno 5 Mbit in upload. Per errori con codice **VPN-812** contatta il
supporto: indica il codice e l'orario del tentativo.

## Posta elettronica — configurazione sul telefono

Per configurare la posta aziendale su smartphone:

- Server in arrivo: **imap.azienda.local**, porta **993**, SSL attivo.
- Server in uscita: **smtp.azienda.local**, porta **587**, STARTTLS attivo.
- Nome utente: il tuo indirizzo email completo; password: quella aziendale.

Sui dispositivi gestiti dall'azienda usa l'app **Outlook**, che si configura da
sola dopo il login con le credenziali aziendali. La casella ha un limite di
**50 GB**; oltre l'85% ricevi un avviso e conviene archiviare i messaggi vecchi.

## Stampanti di rete

Per aggiungere una stampante:

1. Vai su **Impostazioni → Dispositivi → Stampanti e scanner → Aggiungi**.
2. Scegli la stampante dal nome del piano, ad es. **STAMP-P3-Colori** (terzo
   piano, a colori) o **STAMP-P2-BN** (secondo piano, bianco e nero).
3. Se richiesto, installa il driver **Universal Print** proposto automaticamente.

La stampa fronte-retro è predefinita per risparmiare carta. Per sbloccare una
coda di stampa bloccata, spegni e riaccendi la stampante e riprova; se persiste,
apri un ticket indicando il nome della stampante.

## Wi-Fi ospiti

Per far collegare un ospite:

- Rete: **Azienda-Guest**. La password giornaliera è generata dalla reception e
  cambia ogni giorno alle 6:00.
- La rete ospiti è isolata da quella interna: non dà accesso a stampanti,
  cartelle condivise o applicazioni aziendali.

## Password e autenticazione a due fattori (MFA)

- La password aziendale scade ogni **90 giorni**; ricevi un promemoria 7 giorni
  prima. Deve avere almeno 12 caratteri, con maiuscole, minuscole e numeri.
- Se hai dimenticato la password, chiedi il **reset** all'assistente IT: riceverai
  una password temporanea via email da cambiare al primo accesso.
- Se il tuo account è **bloccato** dopo troppi tentativi errati, chiedi lo
  **sblocco** all'assistente (ti verrà chiesto nome e cognome per verifica).
- L'MFA usa l'app **Authenticator**: se cambi telefono, registra di nuovo il
  dispositivo dal portale **mfa.azienda.local** prima di dismettere il vecchio.
