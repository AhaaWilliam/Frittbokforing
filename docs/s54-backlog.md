# Sprint 54 — Backlog (från S53-scope)

**Datum:** 2026-04-17 • **Status:** Inväntar prioritering

Detta dokument samlar arbete som medvetet flyttades från Sprint 53 för att
hålla sprinten fokuserad (8–12 SP). Varje post har uppskattad storlek,
motivering för nedprioritering, och eventuella länkar till S53-artefakter.

## Från Sprint 53-scope (flyttade vid sprintstart)

### F46b — CHECK `quantity ≤ 9999` (0.5 SP)

**Scope:** Lägg till CHECK-constraint på `invoice_lines.quantity` och
`expense_lines.quantity`: `quantity > 0 AND quantity <= 9999.99`.

**Kräver:** M121 (bara trigger-reattach, inte M122 — invoice_lines och
expense_lines saknar inkommande FK enligt M122-listan i CLAUDE.md).

**Motivering för nedprioritering:** Redan levererat i migration 032 (se
migrations.ts:2070). Denna post är bara ett eventuellt efterfinåt-arbete
om nya edge-cases upptäcks.

### F47 — M131 heltalsaritmetik i LineRow display-lager (1 SP)

**Scope:** Migrera `InvoiceLineRow.tsx` och `ExpenseLineRow.tsx` display-
beräkningar till heltalsaritmetik via `src/shared/money.ts`-helper.

**Motivering för nedprioritering:** Display-lager, inte bokföring. M131
garanterar att totals-komponenterna (som driver bokföring) använder heltals-
aritmetik. Lågrisk att lämna display-lagret med float-math tills en faktisk
avrundningsbugg rapporteras.

### F49-b — AST-baserad M133-utökning (1–2 SP)

**Scope:** Utöka `scripts/check-m133.mjs` med AST-baserad verifiering av
`role="alert"` på error-rendering. Regex-pattern är inte pålitligt för
multi-line JSX.

**Förutsättningar:** Beslut om parser (@typescript-eslint/parser vs
TypeScript compiler API vs ts-morph). Whitelist-strategi för legitima
undantag.

**Motivering för nedprioritering:** M133-guarden (`axeCheck: false`-
check) fångar redan bortkopplade a11y-tester. Error-renderings-check
är en kvalitetshöjning, inte regression-skydd.

**Kopplad post:** ~80 `axeCheck: false`-violations i committed HEAD
(acceptera som teknisk skuld eller rensa i egen städtask).

### A11y-bredd — aria-invalid/aria-describedby på alla formulär (2–3 SP)

**Scope:** Inventera alla `<input>`/`<select>`-fält med fel-rendering och
säkerställ att `aria-invalid={!!fieldError}` + `aria-describedby={errorId}`
är satta. Skapa eller utöka `FormField`-komponenten att göra detta automatiskt.

**Motivering för nedprioritering:** Axe täcker grundläggande a11y men inte
per-fält error-associering. Högre investering än S53 hade budget för.

### Pagination — kontroller i InvoiceList/ExpenseList (2 SP)

**Scope:** Lägg till pagineringskontroller (page/pageSize) i fakturasidorna
och expenses-sidorna. IPC-lagret stödjer redan offset/limit.

**Motivering för nedprioritering:** Nuvarande UI antar rimlig list-storlek.
Pagination blir nödvändigt först när kunder har >1000 fakturor — inte ännu.

### Bankavstämning (camt.053-import) (8–13 SP)

**Scope:** Import av camt.053-banktransaktioner, automatisk matchning mot
invoice_payments/expense_payments, rekon-vy för manuell matchning av
omakade rader.

**Motivering för nedprioritering:** Egen sprint. Stor feature med stora
design-beslut (matchningsalgoritm, UI-flow, felhantering). S53-scopet
var explicit fokuserat på avskrivningar + kassaflöde.

## Nya poster upptäckta under S53

### F65-b — Year-end booking-hantering i kassaflöde (1 SP)

**Scope:** `getCashFlowStatement` förutsätter att antingen årsresultatet
är bokfört via `bookYearEndResult` (debit 8999, credit 2099) ELLER att
2000-2099 inte har förändrats i FY utöver netResult.

**Edge-case som inte täcks:** FY där netResult ≠ 0 men year-end-booking
inte körts — financing-sektionen visar `-netResult` istället för 0.

**Fix-alternativ:**
1. Detektera om `bookYearEndResult`-verifikat existerar i FY och hoppa
   över netResult-subtraktion om inte.
2. Alltid exkludera konto 2099 från `financing_equity`-deltan och räkna
   2099-rörelser separat i operating.
3. Körning av `bookYearEndResult` blir del av cash flow-rapportgenereringen.

Korsreferens: [docs/s53-summary.md](s53-summary.md) F65-sektion.

### F65-c — Cash flow UI-flik i PageReports (1–2 SP)

**Scope:** Lägg till "Kassaflöde"-flik i `PageReports.tsx` med tre
sektioner + IB/UB likvida medel + Excel-export. Backend (IPC +
service) är klart i S53 F65.

**Motivering för nedprioritering:** Sprint 53 levererade service +
IPC-kontrakt. UI utan feedback från användaren om layout-preferenser
är spekulativt.

### F62-b — Asset detail-vy + schedule-tabell (1 SP)

**Scope:** `PageFixedAssets` länkar varje rad till en detail-vy som visar
full schedule-tabell, ack. avskrivning per månad, och action-knappar
(redigera, regenerera schedule, skapa disposal-verifikat).

**Motivering för nedprioritering:** MVP-lista + createDialog täcker
primär use-case. Detail-vy är polish när första feedback-rundan visat
behov av djupare per-asset-kontroll.

### F62-c — Disposal-verifikat-generering (2 SP)

**Scope:** När `disposeFixedAsset` körs, erbjud att skapa disposal-
verifikat (Debit 1229, Credit 1220 för bokfört värde; saldo mot resultat-
konto vid försäljningspris ≠ bokfört värde).

**Motivering för nedprioritering:** MVP:s dispose() markerar status
utan bokföringsförändring; användaren skapar disposal-verifikat manuellt.
Auto-generation kräver användarinmatning (försäljningspris, köpare) —
egen workflow.

### F63-polish-b — SIE4 konflikt-resolution-UI (2 SP)

**Scope:** I preview-fasen: visa duplicerade konton med olika namn mellan
DB och fil. Radio-val per konflikt (keep existing / overwrite from file).
Service-lagret utökas med `resolveConflicts: Map<string, 'keep'|'overwrite'>`
parameter.

**Motivering för nedprioritering:** F63-polish i S53 levererade minimal
warning-banner. Full resolution-UI är nästa steg om användare rapporterar
friction.

## Teknisk skuld (ej direkt scope-flytt)

### M133-städning (~80 violations) (3–5 SP)

**Status:** Röd baseline på committed HEAD (verifierat vid S53-start).
Historiska test-filer och nyare men inte F49-komplianta filer har
`axeCheck: false` utan `M133 exempt`-markering.

**Alternativ:**
1. Rensa alla och uppdatera tester att passera a11y.
2. Markera varje som `M133 exempt` med motivering.
3. Uppdatera `check:m133` att acceptera komplett whitelist.

**Motivering för nedprioritering:** Varje `axeCheck: false` antyder att
komponenten har a11y-issues som behöver separata fixar innan flaggan kan
tas bort. Inte ett "ändra en rad"-arbete per fil.

### Historiska commit-rewrites för author (0 SP, men beslut)

**Status:** S51 satte `user.email` + `user.name` lokalt. Framtida commits
får korrekt författare men historiska commits har `william@Williams-
MacBook-Pro.local` som author.

**Beslut krävs:** Destruktivt `git rebase` med author-rewrite påverkar
delad historik och kräver force-push. Stryk eller utför med explicit
godkännande.
