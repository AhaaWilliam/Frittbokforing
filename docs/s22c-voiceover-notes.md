# S22c VoiceOver-sanity — Delta-runthrough

**Status:** Manuell VO-test krävs. Checklista nedan.

## Vad som behöver verifieras

Kör `npm run dev`, aktivera VoiceOver (Cmd+F5), testa:

### InvoiceForm
- [ ] Labels uttalas korrekt (kund, fakturadatum, betalningsvillkor, etc.)
- [ ] Error-meddelanden announceras automatiskt vid submit-failure (role="alert")
- [ ] Fokus flyttas till första felfältet vid submit-failure
- [ ] "Lägg till rad" announceras via live-region

### ExpenseForm
- [ ] Samma som InvoiceForm (leverantör istället för kund)

### ManualEntryForm
- [ ] Datum och beskrivning har korrekta labels
- [ ] Per-rad-inputs ("Rad 1 konto", "Rad 1 debet") uttalas

### Dialoger
- [ ] "Registrera betalning" annonseras som dialog
- [ ] "Bokför"-dialogen annonseras som dialog
- [ ] Focus-trap fungerar (Tab stannar inom dialogen)

### Spinner
- [ ] Loading-state annonseras som "Laddar…"

## Kända VO-quirks att vara uppmärksam på

Dessa tre saker fångas INTE av axe men kan avslöjas av VO:

### 1. Submit-failure focus-flytt: announcement-ordning
**Risk:** VO kan läsa upp hela formuläret från början när fokus flyttas,
istället för bara felfältets label + error.
**Vad att lyssna efter:** När submit failar ska VO säga ungefär
"Sök kund, invalid, [felmeddelande]" — inte börja om från "Kund"-labeln
uppåt i DOM.
**Om det händer:** Verifiera att `errorIdFor`-elementet (`<p id="...-error">`)
INTE är en föräldernode till input — det ska vara ett syskon. I vår
implementation är det alltid syskon (`<input>` följt av `<p>`) inom
en gemensam `<div>` — bör vara OK.

### 2. Dynamiska invoice-lines i aria-live="polite"
**Risk:** `polite`-regioner kan tystas om DOM-mutationen är "för stor".
En hel `<tr>` med 7 celler kan bedömas som "för mycket" av VO.
**Vad att lyssna efter:** Vid klick "Lägg till rad" — annonserar VO
något om den nya raden?
**Om det inte funkar:** Wrappa radens primära text i ett `<span>` som
tillkommer ensamt i live-regionen, istället för hela rad-strukturen.
Alternativt: flytta `aria-live` till en separat status-span som
uppdateras med "N rader" efter mutation. Öppna F49-c om detta behövs.

### 3. Dialog aria-labelledby dubbel-announcement
**Risk:** VO på macOS läser ibland dialog-titeln två gånger — en gång
från `aria-labelledby`, en gång när fokus landar i dialogen.
**Inte en bugg** — känt VO-beteende. Notera om det uppstår men öppna
inte backlog-item om det inte stör UX påtagligt.

## Follow-ups att öppna vid problem

- Om focus-trap läcker i dialoger: öppna F49-c
- Om live-regions inte announceras: öppna F49-c (alt. implementation)
- Om radio-buttons i wizard inte grupperas korrekt: öppna F49-d
- Om VO-announcement-ordning vid focus-flytt är fel: verifiera DOM-ordning
