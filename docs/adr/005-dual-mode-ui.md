# ADR 005 — Dual-mode UI: Vardag + Bokförare som likvärdiga skal

**Status:** Accepted
**Datum:** 2026-04-28
**Ursprung:** Designprototypen "Fritt Bokföring v2" introducerar två
parallella användarlägen — *Vardag* (snabb-input för icke-bokförare)
och *Bokförare* (full kontroll, tre-zonslayout). Beslut A i
implementeringsplanen från Sprint 11+: bygga, skippa eller minimera?

## Kontext

Designprototypen särskiljer två persona-flöden:

- **Vardag-läget** — riktat till företagare som inte själva bokför.
  Bottom-sheet-baserad input, minimal terminologi, fokus på "vad gjorde
  jag" snarare än "vilket konto". Förväntat dagligt bruk.
- **Bokförare-läget** — riktat till revisor/bokförare. Tre-zonslayout
  (Inkorg ⟶ Arbetsyta ⟶ Konsekvens), full verifikat-vy, command palette,
  keyboard-genvägar. Förväntat per-månads-bruk.

De två lägena delar samma underliggande data (samma `useIpcQuery`-kanaler,
samma main-process-services). Skillnaden ligger i layout, terminologi och
input-modaliteter.

Tre vägar övervägdes:

1. **Full dual-mode** — eget routing-träd och egna komponentfilträd per läge
2. **Skippa Vardag** — bara visuella vinster i nuvarande Bokförare-yta
3. **Tunt Vardag-skal** — enklare layout som omskribar samma komponenter

## Beslut

**Variant 1 — full dual-mode.** Båda lägena byggs som likvärdiga skal
runt samma data-lager.

## Konsekvenser

### Routing

`App.tsx` introducerar en ny topp-nivå-state `mode: 'vardag' | 'bokforare'`,
persisterad via `settings:get/set` (key: `ui_mode`). Hash-routern blir
mode-medveten:

- Bokförare: `#/dashboard`, `#/invoices`, `#/expenses`, `#/manual`, ...
- Vardag: `#/v/inbox`, `#/v/spend`, `#/v/income`, `#/v/status`

Routrar i de två trädena delar inte komponentinstanser. Mode-byte unmountar
hela trädet och remountar det andra. Acceptabelt eftersom IPC-cachen
(useIpcQuery) bevaras.

### Tokens-arkitektur (påverkar Sprint 12)

CSS-variabler scopas både på `:root` (gemensamma tokens) och på
`[data-mode="vardag"]` / `[data-mode="bokforare"]` (mode-specifika
overrides — typografi-skala, surface-färger, spacing-rytm).
`document.documentElement.dataset.mode` sätts av mode-state.

Detta innebär att Sprint 12 (token-grunden) **från start** måste:

1. Definiera bas-tokens på `:root`
2. Reservera `[data-mode="..."]`-scope för framtida mode-overrides
3. Inte hårdkoda mode-specifika värden i komponenter — alla färger,
   spacing, typografi går via tokens

### Komponentstrategi

Tre kategorier:

- **Delade primitiver** (Pill, StatusCard, KbdChip, Callout, ConfirmDialog)
  — en implementation, mode-agnostisk. Bor i `src/renderer/components/ui/`.
- **Delade affärsbyggstenar** (CounterpartyPicker, ProductPicker, formulär)
  — en implementation, parametriserad via props. Bor i
  `src/renderer/components/`.
- **Mode-specifika skal** — `src/renderer/modes/vardag/` och
  `src/renderer/modes/bokforare/`. Innehåller layout-komponenter,
  page-komponenter, mode-specifik routing. Återanvänder kategori 1+2.

Mål: ≤ 30 % kod-duplikation mellan modes. Allt över det är ett tecken på
att en byggsten ska lyftas till delat lager.

### M156 (keyboard-navigation-kontrakt)

Gäller båda modes. Vardag-läget ärver skip-links, roving-tabindex,
Radix-dialoger, Enter-på-rad-aktivering. Bottom sheets implementeras via
`@radix-ui/react-dialog` med `data-vaul-style`-CSS — samma a11y-garantier.

Command palette (cmdk, Sprint 15) finns i båda modes men har olika
kommando-registry per mode.

### Testning

E2E-tester får ny dimension: `--mode=vardag` vs `--mode=bokforare`. Kritiska
flöden (skapa kostnad, bokför faktura, betala) testas i båda. Övriga
(rapporter, export, settings) testas i Bokförare-läget.

`window.__testApi.setMode(mode)` läggs till i `test-handlers.ts` (M148 —
fixtures via IPC).

### Faspan-påverkan

Sprint 17 (Vardag-skal) i ursprungsplanen kvarstår *sist* — Vardag byggs
ovanpå tokens (Sprint 12), primitiver (Sprint 13), workspace (Sprint 14)
och command palette (Sprint 15). Men *arkitekturella förberedelser* görs
från Sprint 12:

- Sprint 12: tokens med `[data-mode="..."]`-scope reserverat
- Sprint 13: primitiver mode-agnostiska (testas isolerat utan mode)
- Sprint 14: WorkspacePage i `modes/bokforare/` (inte top-level)
- Sprint 17: `modes/vardag/` byggs

## Avvisade alternativ

### Variant 2 (skippa Vardag)

Förenklar implementation men kastar bort designprototypens centrala
produktdifferentiering. Vardag-flödet är en av de starkaste argumenten för
att en icke-bokförande företagare ska välja Fritt över alternativ.

### Variant 3 (tunt skal)

Lockande som mellanväg men i praktiken sämre än både 1 och 2. Tunt skal
betyder att Vardag-komponenterna måste böja sig efter Bokförar-API:er, vilket
gör Vardag-UX:en kompromissad. Bottom sheets, snabb-input och minimal
terminologi är inte "samma komponent med annan styling" — det är ett annat
interaktionsmönster.

## Trigger-villkor för omvärdering

1. **Vardag-användning < 10 % efter 6 månader i produktion** — då har vi
   fel produkt-hypotes. Konsolidera till Bokförare-läget, deprekera Vardag.
2. **Kod-duplikation > 30 %** — då har komponentstrategin misslyckats.
   Refaktorera delade lager innan nya features läggs till.
3. **A11y-regression i mode-byte** — fokus tappas, screen reader förvirras.
   Då krävs explicit mode-byte-flöde med `aria-live`-meddelande.

## Referenser

- ADR 003 — Radix UI (dialog/sheet-primitives för båda modes)
- M156 (CLAUDE.md § 59 — keyboard-navigation, gäller båda modes)
- Implementeringsplan Sprint 12–17 (Beslut A)
