# Sprint K — F49-c3 Dialog focus-trap-härdning ✅ KLAR

**Session:** 2026-04-18 (Sprint K, direkt efter Sprint J)
**Scope:** F49-c keyboard-navigation, fas 3 (c3) enligt
[docs/f49c-keyboard-nav-spec.md § 8](f49c-keyboard-nav-spec.md).
**Estimat:** ~0.5 SP. **Faktiskt:** ~0.5 SP.

## Leverans

### `useDialogBehavior`-hook (gemensam)

Ny `src/renderer/lib/use-dialog-behavior.ts` encapsulerar det beteende
som alla custom-dialoger i renderer delar:

1. **Focus-trap.** Tab cyklar inom containern (shift+Tab → last,
   Tab-från-last → first). Övriga Tab-events lämnas till browser-default.
2. **Escape stänger.** `onClose` anropas; `e.stopPropagation()` undviker
   propagering till yttre dialog (nested-support, spec § 6.4).
3. **Auto-focus vid open.** `initialFocusRef` om specificerat, annars
   första fokuserbara elementet i containern. Cancel-knapp är default
   för destruktiva dialoger (spec § 6.1).
4. **Focus-return vid close.** Fokus återförs till det element som
   hade fokus när dialogen öppnades — normalt triggern. Om triggern
   unmountats ligger fokus kvar på `<body>` (accepterad begränsning
   per spec § 6.3).

### Applicering på 6 dialoger

Alla modala dialoger i `src/renderer/components/ui/*Dialog*.tsx`
använder nu hooken:

| Dialog | Initial-focus | Before | After |
|---|---|---|---|
| ConfirmDialog | Cancel | custom trap, had Escape | via hook |
| ConfirmFinalizeDialog | Cancel | **ingen trap, ingen Escape** | via hook |
| PaymentDialog | Amount-input | **ingen trap, ingen Escape** | via hook |
| BulkPaymentDialog | första focusable | **ingen trap, ingen Escape** | via hook |
| BulkPaymentResultDialog | Stäng | **ingen trap, ingen Escape** | via hook |
| BatchPdfExportDialog | Stäng (ej under export) | **ingen trap, ingen Escape** | via hook |

**Konsistens:** Loading-state blockerar Escape (`if (!isLoading) onClose`)
i dialogerna där avbrytning mid-flow är osäkert (Finalize, PaymentDialog,
BatchPdfExport).

### M156 promoterad till accepterad M-princip

`CLAUDE.md § 59` lägger till **M156: Keyboard-navigation-kontrakt för
renderer.** Dokumenterar de fyra pelarna (skip-links, roving-tabindex,
useDialogBehavior, Enter på list-rad = navigera) + Dashboard
MetricCards + form-totals aria-live + known limitations.

Review-regel: Nya dialoger i `src/renderer/components/ui/*` MÅSTE använda
`useDialogBehavior`.

## Tester

**Vitest (+13):**
- `tests/renderer/lib/use-dialog-behavior.test.tsx` (10 tester) —
  Escape→onClose, open=false no-op, Tab/Shift+Tab cykel, auto-focus
  initialRef, auto-focus första-focusable fallback, focus-return till
  trigger, unmounted-trigger body-fallback, naturlig Tab-mellan,
  stopPropagation Escape.
- `tests/renderer/components/ui/ConfirmFinalizeDialog.test.tsx` (+3
  tester) — auto-focus Cancel, Escape→onOpenChange(false), Escape
  blockeras under isLoading.

**E2E:** Inga nya (existerande 72/72 grönt — bank/payment-flödet täcker
dialog-interaktion indirekt).

## Verifiering

- **Vitest:** 2563 → **2576 (+13)**
- **Playwright:** 45 specfiler oförändrat, 72 → **72 test()**, full-run
  **72p/0f**
- **PRAGMA user_version:** 43 (oförändrat)
- `npm run check:m133` ✅
- `npm run check:m133-ast` ✅
- `npx tsc --noEmit` ✅
- Axe-tester passerar i alla modifierade dialog-tester

## Inga nya

- **Nya IPC-kanaler:** 0
- **Nya ErrorCodes:** 0
- **Nya migrationer:** 0

## Nya M-principer

- **M156** (accepterad) — Keyboard-navigation-kontrakt för renderer.

## Designval

### Varför synkron `focus()` istället för `requestAnimationFrame`

Första implementeringen använde `requestAnimationFrame` för att vänta
ett tick innan initial-focus applicerades. Problem: befintliga
dialog-tester förväntar sig synkron fokus. Ändrade till direkt `focus()`
i `useEffect` — fungerar för custom-dialoger utan portal. Om framtida
dialoger använder portal eller animation, kan rAF återinföras.

### Varför ingen Radix UI

Nuvarande dialoger är custom-implementerade (inte Radix). Sprint K scope
är att härda det existerande mönstret, inte migrera till Radix. Migration
till Radix skulle vara egen sprint med sin egen test-matris. `useDialogBehavior`
är nu återanvändbar — framtida dialoger behöver bara spread:a `onKeyDown`.

### Varför ingen eslint-rule för "dialog MÅSTE använda hook"

Hook-användning är review-regel (M156 text), inte CI-enforced. Ett
custom eslint-rule skulle kräva AST-detektering av "dialog-liknande"
komponenter — för komplext för ROI. Review + M156-text räcker för nu.

## Scope-utelämningar (inte Sprint K)

- **Radix UI-migration** — stor arkitektur-ändring, egen sprint.
- **Portal-baserade dialoger** — ingen av nuvarande använder portals;
  `useDialogBehavior` är agnostisk men har inte testats med portals.
- **Space-på-rad-togglar-checkbox** (spec § 3) — rad-nivå backlog.
- **Page-specifika dialoger** i `src/renderer/pages/*` (t.ex.
  PageBankStatements) — enklare inline-dialoger utan full chrome.
  Om de utvecklas bör de använda `useDialogBehavior`.

## Filer (delta mot Sprint J)

**Nya (3):**
- `src/renderer/lib/use-dialog-behavior.ts`
- `tests/renderer/lib/use-dialog-behavior.test.tsx`
- `docs/sprint-k-summary.md`

**Modifierade (8):**
- `src/renderer/components/ui/ConfirmDialog.tsx` — använder hook
- `src/renderer/components/ui/ConfirmFinalizeDialog.tsx` — samma
- `src/renderer/components/ui/PaymentDialog.tsx` — samma
- `src/renderer/components/ui/BulkPaymentDialog.tsx` — samma
- `src/renderer/components/ui/BulkPaymentResultDialog.tsx` — samma
- `src/renderer/components/ui/BatchPdfExportDialog.tsx` — samma
- `tests/renderer/components/ui/ConfirmFinalizeDialog.test.tsx` — +3 tester
- `CLAUDE.md` — M156 promoted, section 59

## F49-c är KOMPLETT

Sprint I (c1) + Sprint J (c2) + Sprint K (c3) levererar hela F49-c-
kontraktet från UX-specen:

- Skip-links + landmarks (c1)
- Roving-tabindex + Dashboard-widget-focus + form-totals aria-live (c2)
- Dialog focus-trap-härdning + Escape + focus-return (c3)

M156 är nu accepterad M-princip. Framtida keyboard-interaktioner följer
kontraktet; review-regel enforcas via CLAUDE.md.

## Nästa prioriteringar (utanför F49-c)

- **Sprint H (T3.a F62-e):** Blockerad på revisor-samråd (ADR 002).
- **T3.d rest (MT940 + BGC):** H2 2026.
- **IBAN-prefix-dispatch för BkTxCd** (P4-scope-lås).
- **Radix UI-migration för dialoger** (om tillämpligt — nice-to-have).
