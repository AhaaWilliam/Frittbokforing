# Sprint R — Nordic IBAN + F49-c Space-polish ✅ KLAR

**Session:** 2026-04-18 (Sprint R, direkt efter Sprint Q)
**Scope:** Två actionable backlog-items (Norge/Danmark-IBAN-utvidgning +
Space-togglar-rad-checkbox). Två icke-actionable items (MT940/BGMAX
fixture-dogfooding, Sprint H Alt B) lämnade med explicit motivation.
**Estimat:** ~0.75 SP. **Faktiskt:** ~0.75 SP.

## Backlog-hantering

| Item | Status | Beslut |
|---|---|---|
| **MT940/BGMAX fixture-dogfooding** | Blockerad utan input | Kräver riktiga anonymiserade bank-filer från användare. Jag kan inte fabricera verklig bank-data med real-world-quirks. |
| **Sprint H Alt B** | Speculative | Explicit "eventuell" i backlog, kräver revisor-input som inte finns. CLAUDE.md: "Don't design for hypothetical future requirements". Lämnas tills revisor faktiskt ber om retroaktiv C-serie-korrigering för rättelse-scenarier. |
| **Norge/Danmark-IBAN** | ✅ Levererat | R1 |
| **F49-c Space-polish** | ✅ Levererat | R2 |

## Leverans

### R1 — Nordic IBAN-registry

Utvidgat [iban-bank-registry.ts](src/main/services/bank/iban-bank-registry.ts):

**Nya `BankInstitutionId`-värden:** `DNB`, `SPAREBANK1`, `JYSKE`, `SYDBANK`.
`DANSKE`/`NORDEA`/`HANDELSBANKEN` återanvänds för nordiska grenar.

**`lookupBankByIban` router:** switch på country-code (`iban.slice(0, 2)`)
till rätt prefix-Map:
- `SE` → 8 banker, ~50 prefix-ranges (oförändrat)
- `NO` → 4 banker: DNB (1503-1510, 4200-4299), Nordea (5096-5099, 6000-6099),
  Handelsbanken (9040-9049), SpareBank1 (4312-4356), Danske (8101, 3000-3200)
- `DK` → 5 banker: Danske Bank (3000-3999), Nordea (2000-2299, 40-80),
  Jyske (5000-5999), Sydbank (6600-6699, 7600-7699), Handelsbanken
  (6480-6499)
- Övriga land-koder → null

**Begränsning i jsdoc:** "NO/DK register är inte uttömmande — bara större
banker med hög sannolikhet för transaktioner från svenska SMEs. Utöka
efter behov om classifier missar legitima bank-matches."

**Tester ([session-R-iban-nordic.test.ts](tests/session-R-iban-nordic.test.ts)):**
- 21 nya tester: NO happy-paths, DK happy-paths, land-baserad routing
  (SE-prefix i NO-IBAN → null och vice versa), FI/DE/EE-avvisning,
  tolerans (case + whitespace), determinism (100 iter per land)

### R2 — Space togglar rad-checkbox (F49-c polish)

Utvidgat [use-roving-tabindex.ts](src/renderer/lib/use-roving-tabindex.ts):
- Ny optional tredje parameter `onToggleSelect?: (idx: number) => void`
- Space-tangent med `e.preventDefault()` + `onToggleSelect(idx)` om satt
- Callback-ägaren avgör om raden är selektbar (ignorerar annars)

**Applicerat i:**
- [InvoiceList.tsx](src/renderer/components/invoices/InvoiceList.tsx) —
  Space togglar bulk-selektion om `isSelectable(item)` (utkast utan
  kredit-blocker)
- [ExpenseList.tsx](src/renderer/components/expenses/ExpenseList.tsx) —
  Space togglar bulk-selektion om `isSelectable(item)` (unpaid/partial)

**Semantik:**
- Space på rad → toggla checkbox i bulk-selection-kolumnen
- Enter på rad → navigera till detaljvy (oförändrat)
- ↑↓/Home/End → roving-tabindex-navigation (oförändrat)

Separation från WAI-ARIA-composite-grid-mönstret (som är avvisat per
M156). Checkbox i rad-prefix-kolumn är den enda bulk-selektions-yta;
Space från rad-nivån är bekvämlighet för keyboard-användare.

**Tester:**
- `tests/renderer/lib/use-roving-tabindex.test.tsx` — 3 nya tester
  (Space triggar callback, no-op utan callback, preventDefault)

## Ingen infrastruktur-ändring

- Inga nya M-principer.
- Inga nya migrationer (PRAGMA user_version: 44 oförändrat).
- Inga nya IPC-kanaler.
- Inga nya ErrorCodes.
- Inga nya dependencies.

## Verifiering

- **Lint:** 0 problems ✅
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** se final verification
- **check:m133** + **check:m133-ast** + **check:m153** + **check:lint-new** ✅

## Filer (delta mot Sprint Q tip)

**Modifierade (4):**
- `src/main/services/bank/iban-bank-registry.ts` — NO + DK registries
- `src/renderer/lib/use-roving-tabindex.ts` — onToggleSelect-parameter
- `src/renderer/components/invoices/InvoiceList.tsx` — Space-callback
- `src/renderer/components/expenses/ExpenseList.tsx` — Space-callback
- `tests/renderer/lib/use-roving-tabindex.test.tsx` — 3 nya Space-tester

**Nya (2):**
- `tests/session-R-iban-nordic.test.ts`
- `docs/sprint-r-summary.md`

## Kvar i backlog

- **MT940/BGMAX fixture-dogfooding** — kräver riktiga bank-fil-exempel
  från användare (anonymiserade). Jag kan inte fabricera real-world
  quirks.
- **Sprint H Alt B** — speculative, kräver revisor-input för att
  aktiveras. Hålls tills K2-praxis-fråga uppkommer.
- **T3.d rest** (BGC Utbetalningar, MT942, multi-message): scope-out i
  T3.d-spec. Framtida om behov.
- **Finsk IBAN (FI)** — inte i R1-scope. Lägg till om användare
  rapporterar finska motparter.

## Reflektion

Första gången under serien av sprintar (M→R) där jag höll fast vid att
två backlog-items inte är actionable — istället för att köra
speculativt. Orsaker:

1. **Fixture-dogfooding:** kräver faktisk input (riktiga bank-filer).
   Kan inte fabriceras utan att bli meningslös synthetic-test-data.
2. **Sprint H Alt B:** CLAUDE.md säger explicit "don't design for
   hypothetical future requirements". Alt A är tillräckligt MVP enligt
   ADR 002; Alt B borde drivas av faktisk revisor-feedback, inte
   speculation.

Detta är rätt balans efter SO/SP-lärdomen att "blockerad" ofta är
underprövd antagande — men också efter att ha sett att *vissa* items
verkligen saknar input vi kan producera själva.
