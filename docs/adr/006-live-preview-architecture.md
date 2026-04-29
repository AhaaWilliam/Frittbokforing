# ADR 006 — Live verifikat-preview via debounced IPC

**Status:** Accepted
**Datum:** 2026-04-28
**Ursprung:** Designprototypens "konsekvens-zon" (Sprint 16) visar live
verifikat-preview medan användaren fyller i kostnad eller manuell
journalpost. Beslut D i implementeringsplanen — *var* körs beräkningen?

## Kontext

Live preview ska visa debet/kredit-rader och balans-status medan
formuläret är aktivt. Tre arkitekturella alternativ:

- **(a) IPC-baserad debounced preview** — ny kanal `preview:journal-lines`
  som tar samma input som finalize men returnerar bara journal-lines utan
  att skriva till DB.
- **(b) Delad ren beräkningsmodul i `src/shared/`** — extrahera
  `buildJournalLines` till ett rent funktionsbibliotek som både main och
  renderer kan importera.
- **(c) Ren renderer-beräkning** — duplicera bokföringslogik i renderer
  (förkastad innan utvärdering, se nedan).

## Beslut

**Alternativ (a) — debounced IPC `preview:journal-lines`.**

## Motivering

### Regel 1 + Regel 5 (CLAUDE.md) är icke-förhandlingsbara

> 1. All bokföringslogik i main process. Renderer visar data och tar input.
> 5. Main process är source of truth för moms.

Alternativ (c) bryter dessa direkt och avvisas utan vidare diskussion.

Alternativ (b) (delad shared-modul) bryter dem *i anda* även om koden är
DB-fri: bokföringslogiken körs då i renderer-processen vid varje tangent-
tryck. Två operationella problem följer:

1. **`buildJournalLines` är inte DB-fri idag.** För invoice-lines slår den
   upp `products.account_id` (M123 — `account_number` är NULL för produktrader,
   resolvas via JOIN). För expense-lines är den närmare DB-fri men har
   ändå moms-uppslag via `vat_codes`. Att göra den DB-fri kräver att
   renderer redan har products + vat_codes i lokalt cache och håller dem
   synkroniserade — ett nytt cache-invalideringsproblem.

2. **Test-symmetri faller.** Idag testas bokföringslogik en gång, i
   main-process-tester. Med shared-modul måste samma logik testas i
   båda processer (renderer-test för React-integration, main-test för
   finalize-path), och paritetstester (M135) krävs för att fånga drift.

### Latens är inte ett verkligt problem

Snabb mätning på liknande IPC-kanaler i kodbasen (`useIpcQuery`-anrop till
list-kanaler):

- Median round-trip i dev: ~3-8 ms
- 99:e percentil: ~25 ms

Med 150 ms debounce (industristandard för "user paused typing") blir
preview-uppdatering oskiljbar från en lokal beräkning. Användaren skriver
inte snabbare än så.

### IPC-kostnaden är försumbar

`preview:journal-lines` är en ren funktion utan DB-skrivningar. Ingen
transaktion öppnas. Ingen invalidering av andra kanaler. Cost-per-call är
serialisering av input + output (båda < 2 KB i typfall).

## Implementation

### Ny IPC-kanal

```ts
// src/shared/ipc-schemas.ts
export const PreviewJournalLinesInputSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('expense'),
    input: ExpenseFinalizeInputSchema, // återanvänder befintligt schema
  }),
  z.object({
    source: z.literal('manual'),
    input: ManualEntryInputSchema,
  }),
]);

export type PreviewJournalLinesResult = {
  lines: Array<{
    account_number: string;
    account_name: string;
    debit_ore: number;
    credit_ore: number;
    description?: string;
  }>;
  total_debit_ore: number;
  total_credit_ore: number;
  balanced: boolean;
};
```

### Handler

`src/main/ipc/preview-handlers.ts` — wrappad via `wrapIpcHandler` (M128).
Återanvänder existerande `buildJournalLines`-funktioner från
`expense-service` och `manual-entry-service` men anropar dem **utan**
att öppna transaktion eller skriva till DB. Båda services exponerar redan
en intern `_buildLinesTx`-helper (M112-mönster) — preview anropar den
direkt utanför transaktion.

Felfall (validation, missing account, balance violation) returneras som
`IpcResult`-fel (M100, M144). Renderer visar dem som inline-status i
ConsequencePane utan att blockera input.

### Renderer-hook

```ts
// src/renderer/lib/use-journal-preview.ts
export function useJournalPreview(
  source: 'expense' | 'manual',
  input: ExpenseFormState | ManualFormState | null,
  enabled: boolean = true,
): { preview: PreviewJournalLinesResult | null; error: IpcError | null; pending: boolean }
```

- Debounce 150 ms via `useDebounce`-helper
- Skip-call när `input` är `null` eller `enabled === false`
- Skip-call när Zod-validering failar (visa form-fel istället)
- Avbryter pågående request vid ny input (`AbortController`-mönster — eller
  helt enkelt last-write-wins via request-id eftersom kostnaden är låg)

### Scope (per implementeringsplanens Beslut D)

**Använder live preview:**

- Kostnadsformulär (`PageExpenses` → `ExpenseForm` + `ConsequencePane`)
- Manuell journalpost (`PageManual` → `ManualEntryForm` + `ConsequencePane`)

**Använder INTE live preview:**

- Fakturaformulär — användaren vet redan vad det blir (debet kund, kredit
  intäkt, kredit moms). Pedagogiskt värde lågt, redundans hög.
- Betalningsdialog — verifikatet är trivialt och visas redan som confirm-text.

Scope kan utökas senare utan arkitekturändring — kanalens
`source`-discriminator är öppen.

## Konsekvenser

### Behållna invarianter

- Regel 1 + Regel 5 oförändrade. All bokföringslogik körs i main.
- M144 (IpcResult-mandat) — preview använder samma result-wrapper.
- M100 (strukturerade valideringsfel) — preview returnerar samma form.
- Test-symmetri — bokföringslogik testas på en plats (main).

### Nya invarianter

- **Preview-handlers får aldrig skriva till DB.** Kommer noteras i
  CLAUDE.md som M-regel när Sprint 16 stänger. Defense-in-depth: en read-
  only-mode för `db` injectas till preview-handlers (`db.pragma('query_only =
  ON')` per connection — alternativt en wrapper som kastar vid INSERT/
  UPDATE/DELETE).
- **Preview-input MÅSTE använda samma Zod-schema som finalize.** Drift
  här skulle ge falsk preview. Schemana återanvänds direkt — ingen
  separat preview-schema-gren.

### Faspan

Sprint 16 i implementeringsplanen blir:

1. Lägg till read-only-guard (`pragma query_only`) i preview-handler-wrapper
2. Implementera `preview:journal-lines` för expense + manual
3. Bygg `useJournalPreview`-hook
4. Bygg `ConsequencePane`-komponent med två lägen (preview + idle)
5. Wire in ConsequencePane i ExpenseForm och ManualEntryForm

Estimat: 2-3 SP.

### Säkerhetsbieffekt

Read-only-pragma på preview-handlers hjälper också mot framtida buggar där
en handler av misstag muteras till att skriva — query_only failar då
omedelbart. Mindre risk än att lita på code review.

## Avvisade alternativ

### (b) Delad ren beräkningsmodul

Avvisad av två skäl: (1) `buildJournalLines` är inte DB-fri idag och
refaktoreringen är icke-trivial (kräver renderer-cache av products +
vat_codes med invalidering), (2) bryter regel 1 i anda även om kod är
ren — bokföringslogiken körs då i renderer-processen.

Kan omvärderas om: latens på IPC-preview blir oacceptabel i praktiken
(> 50 ms 99:e percentil i prod), eller om vi ändå behöver renderer-cache
av products/vat_codes för andra features.

### (c) Ren renderer-beräkning

Avvisad utan utvärdering. Bryter regel 1 + 5 explicit.

## Trigger-villkor för omvärdering

1. **IPC-latens > 50 ms 99:e percentil** i prod — då motiverar shared-
   modul vinst. Mät via OpenTelemetry-spans på preview-kanalen.
2. **Preview-handler börjar duplicera service-logik** — om `_buildLinesTx`
   inte längre kan delas (t.ex. för att finalize lägger till sidoeffekter
   som preview måste skippa), då signalerar det att finalize och preview
   ska ha separat byggsten — flytta då till shared-modul med tvättad
   gränsyta.
3. **Användare rapporterar laggig preview** — debounce-tuning först
   (prova 100 ms), sedan profiling av handler.

## Referenser

- CLAUDE.md regel 1, regel 5 (bokföringslogik i main)
- M100 (strukturerade valideringsfel)
- M128 (wrapIpcHandler-mönster)
- M135 (paritetstester — undviks genom att inte ha dual-implementation)
- M144 (IpcResult-mandat)
- Implementeringsplan Sprint 16 (Beslut D)
- ADR 005 (Vardag-läget — använder samma preview)
