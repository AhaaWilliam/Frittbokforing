# Sprint P — IBAN-prefix-dispatch + Radix-full-migration ✅ KLAR

**Session:** 2026-04-18 (Sprint P, direkt efter Sprint O)
**Scope:** (1) Implementera IBAN-prefix-dispatch per SN-spec,
(2) Full Radix-migration av återstående 5 dialoger per ADR 003.
**Estimat:** ~3-4 SP. **Faktiskt:** ~3 SP.

## Leverans

### P1 — IBAN-prefix-dispatch (~1 SP)

**Implementation enligt [iban-prefix-dispatch-spec.md](docs/iban-prefix-dispatch-spec.md):**

Ny fil: [src/main/services/bank/iban-bank-registry.ts](src/main/services/bank/iban-bank-registry.ts)
- `SE_IBAN_PREFIX_TO_BANK`-Map: 8 svenska bank-institut, totalt 50+
  prefix-mappningar (SEB 5000-5999, Swedbank 7000-7999 + 8000-8999,
  Handelsbanken 6000-6999, Nordea multipla intervall, Danske, ICA,
  Länsförsäkringar, Skandia)
- `lookupBankByIban(iban)`-funktion: tolerant för whitespace/lowercase,
  returnerar null för null/utländska/okända prefix
- Genererat via `rangeEntries`-generator för underhållbarhet
- M153-kompatibel: deterministisk, inga side effects

**Classifier-integration** [bank-fee-classifier.ts](src/main/services/bank/bank-fee-classifier.ts):
- `BankTxInput` utvidgad med `counterparty_iban: string | null`
- `classifyByHeuristic`: `bankHit = bankByName || bankByIban` — IBAN-match
  är tredje signal (efter BkTxCd-mapping och counterparty_name)
- Reason-string skiljer de två: "IBAN-prefix matchar svensk bank" vs
  "Counterparty matchar bank-mönster"
- Callsites uppdaterade: `bank-fee-entry-service.ts` (SELECT utvidgad),
  `bank-match-suggester.ts` (tx-mappning utvidgad)

**Tester (2 nya filer, 23 tester):**
- [session-P-iban-bank-registry.test.ts](tests/session-P-iban-bank-registry.test.ts)
  (16 tester): happy-paths per bank, null-retur för edge-cases,
  whitespace/case-tolerans, determinism (100 iter)
- [session-P-classifier-iban.test.ts](tests/session-P-classifier-iban.test.ts)
  (7 tester): IBAN-only bank-bonus, utländsk IBAN ignoreras, IBAN+name
  ger bara en bonus, IBAN+ränta-text ger interest_income/expense

**Regression:** existerande `session-58-bank-fee-classifier.test.ts` +
`session-F-p4-bank-tx-mappings.test.ts` uppdaterade med
`counterparty_iban: null` i tx-helper. Alla tester pass.

### P2 — Radix full migration (~2 SP)

**Fem dialoger migrerade enligt ADR 003 Alt A:**

| Dialog | Radix-primitive | LOC before → after | Δ |
|---|---|---:|---:|
| ConfirmFinalizeDialog | AlertDialog | 83 → 71 | −14% |
| PaymentDialog | Dialog | 207 → 190 | −8% |
| BulkPaymentDialog | Dialog | 246 → 229 | −7% |
| BulkPaymentResultDialog | Dialog | 150 → 135 | −10% |
| BatchPdfExportDialog | Dialog | 102 → 106 | +4% |

Kombinerat med ConfirmDialog (SO-pilot, 89→66, −26%), alla 6 dialoger
är nu Radix-baserade. Netto LOC: 877 → 797 (−9 %).

BatchPdfExportDialog fick +4 rader pga utökad onClose-logik för
isExporting-låst Escape + onPointerDownOutside — semantiskt mer
robust än tidigare implementation.

**Mönster som användes:**
- `<AlertDialog.Root>` för destruktiv confirm-dialog (ConfirmFinalize,
  ConfirmDialog från SO)
- `<Dialog.Root>` för neutral dialog (PaymentDialog, BulkPaymentDialog,
  BulkPaymentResultDialog, BatchPdfExportDialog)
- `<Portal>` för att rendera utanför DOM-hierarkin (ingen z-index-risk)
- `<Overlay>` + `<Content>` för backdrop + panel
- `<Title>` + `<Description>` för ARIA-association (auto-gen IDs)
- `<Cancel>` eller `<Close>` wrap med `asChild` för att bevara custom
  button-styling
- `onEscapeKeyDown={e => isLoading && e.preventDefault()}` för att
  blocka close under pågående operation
- `onOpenAutoFocus` override för att fokusera specifik knapp (Cancel
  för destruktiva, Close för read-only)
- `onPointerDownOutside` för att blocka backdrop-click under export

### P3 — useDialogBehavior deprecation

- [use-dialog-behavior.ts](src/renderer/lib/use-dialog-behavior.ts):
  `@deprecated`-JSDoc-note med hänvisning till Radix. Filen + test-fil
  behålls tills Sprint Q eller senare verifierat att inga nya imports
  tillkommit.
- [CLAUDE.md § 59 (M156)](CLAUDE.md) uppdaterad:
  - Pelare 3 beskriver nu Radix-primitives (Dialog.Root/Portal/Overlay/
    Content/Title/Description/Close)
  - Enforcement: review-regel att nya dialoger MÅSTE använda Radix;
    useDialogBehavior flaggad som deprekerad
  - Korsreferens till ADR 003

### Tester som uppdaterades pga Radix-migration

- [dialog-a11y.test.tsx](tests/renderer/components/ui/dialog-a11y.test.tsx)
  refaktorerad: från hardcoded `aria-modal="true"` + hardcoded
  `aria-labelledby="..."` till beteende-check via ny helper
  `assertDialogTitleAssociation` som verifierar att aria-labelledby
  pekar på element med rätt text. Semantiskt ekvivalent, implementation-
  agnostisk.
- ConfirmFinalizeDialog-assertion ändrad från `role="dialog"` till
  `role="alertdialog"` (AlertDialog-primitive).

### Ingen ny infrastruktur

- Inga nya M-principer (M156 uppdaterad).
- Inga nya migrationer (PRAGMA `user_version`: 43 oförändrat).
- Inga nya IPC-kanaler.
- Inga nya ErrorCodes.

## Verifiering

- **Lint:** 0 problems ✅ (prettier autofix applicerad)
- **TypeScript:** `npx tsc --noEmit` ✅
- **Vitest:** se verifiering-sektion
- **check:m133**, **check:m133-ast**, **check:m153**, **check:lint-new** ✅

## Filer (delta mot Sprint O tip)

**Modifierade (9):**
- `src/main/services/bank/bank-fee-classifier.ts` — IBAN-signal
- `src/main/services/bank/bank-fee-entry-service.ts` — SELECT utvidgad
- `src/main/services/bank/bank-match-suggester.ts` — tx-mappning
- `src/renderer/components/ui/ConfirmFinalizeDialog.tsx` — AlertDialog
- `src/renderer/components/ui/PaymentDialog.tsx` — Dialog
- `src/renderer/components/ui/BulkPaymentDialog.tsx` — Dialog
- `src/renderer/components/ui/BulkPaymentResultDialog.tsx` — Dialog
- `src/renderer/components/ui/BatchPdfExportDialog.tsx` — Dialog
- `src/renderer/lib/use-dialog-behavior.ts` — @deprecated-note
- `tests/renderer/components/ui/dialog-a11y.test.tsx` — beteende-check
- `tests/session-58-bank-fee-classifier.test.ts` — iban-null
- `tests/session-F-p4-bank-tx-mappings.test.ts` — iban-null
- `CLAUDE.md` — M156 uppdaterad
- `package.json` + `package-lock.json` — @radix-ui deps

**Nya (3):**
- `src/main/services/bank/iban-bank-registry.ts`
- `tests/session-P-iban-bank-registry.test.ts`
- `tests/session-P-classifier-iban.test.ts`
- `docs/sprint-p-summary.md`

## Kvar i backlog

- **T3.d MT940 + BGC implementation** — spec klar (sprint-o), ~3-4 SP
  när test-fixtures tillgängliga.
- **Sprint H (T3.a F62-e)** — fortsatt blockerad på revisor-samråd.
- **useDialogBehavior radering** (Sprint Q) — efter verifierat att
  inga nya imports tillkommit.
- **Space-på-rad-togglar-checkbox** (F49-c polish).
- **Utländska IBAN i registry** — Norge, Danmark, Tyskland om behov uppstår.
