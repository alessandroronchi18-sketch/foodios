# I due metodi di produzione — audit del 21/09/2026

Foodos registra la produzione in due modi, e si sceglie dalle impostazioni:

- **il metodo diretto** — «oggi ho fatto tre stampi di sacher»;
- **il metodo differenziale** — si conta quello che c'è in vetrina, e la
  produzione è la differenza. È quello che usa Mara.

Sono due modi di scrivere la stessa cosa. Da qui nasce la regola che tiene in
piedi tutto il resto: **quello che esce dal magazzino, e quello che finisce
nei conti, deve essere identico**. È lo stesso gelato.

---

## 1. Le prove c'erano. Mancava quella che conta

La prima domanda era se i due metodi fossero provati. Contate:

| | prove |
|---|---:|
| diretto — la pagina | 141 |
| diretto — il server del dipendente | 28 |
| differenziale — la pagina | 128 |
| differenziale — il motore dei conti | 317 |
| differenziale — la quadratura | 51 |
| in comune — il food cost | 541 |
| in comune — lo stock in vetrina | 333 |

Il metodo differenziale è **più** provato dell'altro, non meno. Ma tutte
quelle prove guardano un metodo per volta: nessuna metteva i due numeri uno
accanto all'altro. I tre difetti qui sotto stavano esattamente in quello
spazio, e sono rimasti lì per mesi con millequattrocento prove verdi intorno.

---

## 2. I tre difetti trovati, e cosa costavano

### a) Il food cost del metodo differenziale usciva **+9,08%** più alto del vero

Il pezzo di programma che porta l'inventario nelle altre pagine diceva
«un chilo prodotto = un impasto». Ma un impasto di gelato non pesa un chilo
tondo: nel tuo ricettario va **da 965 a 1.262 grammi**, e solo **18 ricette su
63** stanno esatte a mille.

Su dodici mesi di produzione registrata — **18.526 kg** — il costo veniva
calcolato su 18.526 impasti invece che su 16.984.

Dove si vedeva: P&L, storico produzione, home, confronto sedi, simulatore
prezzi. Costi e ricavi gonfiati tutti e due del nove per cento. Il margine in
percentuale reggeva quasi (i due errori si accompagnano), **il margine in euro
no** — ed è quello che si guarda per decidere.

**Corretto.** Adesso i chili si convertono in impasti con la resa della
ricetta, che è lo stesso numero con cui il ricavo fa il suo conto.

### b) «Porta in produzione» diceva di sì, e non succedeva niente

Quando da un'ordinazione si preme «Porta in produzione», il programma scrive
una sessione di produzione. Col metodo differenziale quella sessione veniva
**cancellata dallo schermo** un istante dopo: il ponte che proietta
l'inventario sostituiva tutto invece di cucire.

Sul tuo database: **2 produzioni invisibili**, una nata da un'ordinazione
portata in produzione il 30 settembre. Il programma aveva risposto «righe
portate in Produzione».

**Corretto.** Regola del cucito: per ogni giorno, se l'inventario ha righe
vince l'inventario — contare due volte lo stesso gelato è peggio che non
vederlo — e i giorni che l'inventario non conosce tengono la loro sessione.
I tuoi due giorni non hanno righe di inventario: tornano visibili senza
sovrapporsi a niente.

### c) Il metodo differenziale non apriva i semilavorati

Una ricetta che contiene «pasta frolla» fatta in casa: il metodo diretto
scende nella ricetta della frolla e toglie dal magazzino farina, burro,
zucchero a velo, uovo e sale. Il differenziale cercava una voce «pasta
frolla», non la trovava, **e la creava** con giacenza negativa: una riga
fantasma che scende per sempre, mentre farina e burro restano sullo scaffale a
quota piena.

Misurato su un'altra azienda che lavora col differenziale: **3 ricette su 13**.

Mancavano anche:

- **il riconoscimento dei nomi al plurale**: il magazzino tiene «uova»,
  «noci», «mandorle» come sono state scritte, e si cercava «uovo», «noce» →
  nasceva un doppione accanto alla voce piena;
- **l'avviso**: quando un ingrediente non c'è, il metodo diretto lo dice a chi
  ha appena registrato. Qui non lo diceva nessuno.

**Corretto.** Le due strade passano adesso dalla stessa funzione.

**Da dire con onestà: sul TUO ricettario questo difetto non aveva ancora
morso.** I tuoi due semilavorati usati davvero — base bianca (in 28 ricette) e
salsa zabaione — sono tenuti in magazzino, e in quel caso i due metodi si
comportavano già uguale. Avrebbe morso il giorno che qualcuno avesse usato
crema pasticcera o uno dei due croccanti, che in magazzino non ci sono.

---

## 3. Quello che ho verificato e NON era rotto

Lo scrivo perché un audit che elenca solo i guasti non dice quanto è solido il
resto:

- **il dipendente può lavorare col metodo differenziale**: la pagina è fra le
  sue, e il magazzino è fra le cose che il database gli lascia scrivere;
- **le venti pagine che leggono la produzione vedono i dati del
  differenziale**: il ponte esiste ed è agganciato alle sedi che producono;
- **il salvataggio è nell'ordine giusto** su tutte e due le strade: prima il
  magazzino, poi la registrazione — se cade la rete non resta una produzione
  scritta con un magazzino non aggiornato;
- **la giacenza può andare sotto zero senza essere tagliata**, il che sembra
  strano ma è giusto: serve a far tornare i conti quando si corregge al
  ribasso una produzione registrata di troppo.

---

## 4. Quello che resta aperto, e perché non l'ho toccato

### Lo scarto registrato nell'inventario non arriva in «Perdite & cessioni»

Nella griglia settimanale c'è una colonna «scarto». Quel numero oggi lo legge
solo la Quadratura: non entra nella pagina delle perdite né nel conto del
P&L.

**Non l'ho collegato** perché sui tuoi dati quella colonna è a zero su tutte e
7.013 le righe: nessuno la usa. Collegare un tubo che non porta acqua vuol
dire scrivere codice che nessuno verifica. Se invece la volete usare, si fa —
ma prima va deciso se lo scarto del gelato è una perdita di magazzino o una
riga di costo.

### Il cambio di metodo non avvisa di niente

Quando si passa da un metodo all'altro (la richiesta va all'amministratore,
che la approva) nessuno dice all'utente cosa succede ai dati già registrati.
Non si perde niente — la produzione vecchia resta dov'è, e adesso resta anche
visibile grazie al cucito del punto (b) — ma la pagina «Produzione» cambia
sotto i piedi senza una parola.

**È una decisione tua, non mia**: si può scrivere un avviso con scritto cosa
cambia, oppure lasciare che sia l'amministratore a spiegarlo quando approva.

### Il conto della resa

Oggi nessuna delle tue 63 ricette dichiara una **resa** — quanto gelato esce
da un impasto. Il programma la deduce sommando gli ingredienti, che è
un'approssimazione: nel gelato l'aria montata cambia il volume ma non il peso,
e nei prodotti da forno l'acqua evapora. Finché si parla di peso il conto
regge. Se un giorno volete dichiararla, il campo c'è già e tutti i conti la
usano.
