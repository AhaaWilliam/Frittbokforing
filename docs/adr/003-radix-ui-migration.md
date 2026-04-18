# ADR 003 — Radix UI för dialog-primitives (pilot-utvärdering)

**Status:** Proposed (pilot slutförd; beslut om full migration väntar)
**Datum:** 2026-04-18 (Sprint O)
**Ursprung:** Backlog sedan Sprint K (F49-c). Avvisades i Sprint L/M/N
som "nice-to-have utan incremental nytta eftersom M156 useDialogBehavior
redan ger focus-trap/escape/return". Sprint O kör pilot för att
utvärdera den ståndpunkten empiriskt.

## Kontext

`useDialogBehavior`-hooken (Sprint K, M156) encapsulerar fyra kärn-
beteenden för alla 6 befintliga modala dialoger:

1. Focus-trap (Tab / Shift+Tab cyklar inom container)
2. Escape stänger (med `e.stopPropagation()` för nested-support)
3. Auto-focus på initialFocusRef eller första fokuserbara element
4. Focus-return till trigger vid close

**Begränsningar jämfört med modern Radix-implementation:**

- **Ingen `inert`-hantering** på bakgrundsinnehåll. Screen-reader-users
  kan teknik navigera utanför dialogen. Radix använder `aria-hidden` +
  `inert` på sibling-innehåll för att cementera modalitet.
- **Ingen scroll-lock.** Background-scroll fungerar medan dialog är öppen.
  Inte WCAG-brott men disruptivt UX.
- **Ingen portal.** Dialog renderas inline i parent-komponenten vilket
  kan leda till z-index-kollisioner med t.ex. sticky headers.
- **Manuell focus-trap** har kända kant-fall: iframes, disabled-inputs
  med tabindex-ordning, dynamically added focusable elements.
- **Ingen return-focus-guard** om triggern unmountas (body-fallback,
  dokumenterat i M156).
- **Inget stöd för andra primitives** — popover, menu, tooltip, select,
  combobox osv saknar motsvarighet. Framtida komponenter skulle kräva
  hand-implementering eller separat bibliotek.

## Pilot (denna ADR)

Sprint O piloterade migration av [`ConfirmDialog`](../../src/renderer/components/ui/ConfirmDialog.tsx)
till `@radix-ui/react-alert-dialog`.

### Resultat

**Kod:**
- ConfirmDialog: 89 → 66 rader (−23, −26 %)
- Inga ref-hantering, inga useEffect, inga manuella key-handlers
- API-surface bibehållen: `open`, `onOpenChange`, `title`, `description`,
  `confirmLabel`, `cancelLabel`, `variant`, `onConfirm`
- Deklarativ struktur: `<AlertDialog.Root><Portal><Overlay/><Content>...`

**Tester:**
- Alla 8 ConfirmDialog-tester passerar (inkl axe-core a11y-check)
- Alla 2576 vitest passerar, inga regressions
- Tsc: ✅ clean
- Lint: ✅ clean (0 violations)

**Testuppdatering krävdes:** 1 test (session-29-confirm-dialog).
Testet asserted hardcoded `aria-labelledby="confirm-dialog-title"`.
Radix auto-genererar IDs (best-practice eftersom det undviker kollisioner
vid flera dialoger). Test refaktorerat till att kolla att `aria-labelledby`
finns och pekar på element med rätt textinnehåll — semantiskt ekvivalent,
implementation-agnostisk. Detta är faktiskt en förbättring: tidigare test
kontrollerade implementation, inte beteende.

**Beteende-ändringar vs custom-implementation:**
1. `aria-modal="true"` sätts inte på element — Radix använder `inert` +
   `aria-hidden` på utanför-innehåll istället. Semantiskt ekvivalent per
   ARIA 1.2 (role="alertdialog" implicerar modalitet).
2. Focus-trap är robustare (Radix testat mot iframes, dynamic content).
3. Background scroll-lockas automatiskt.
4. Close-event kan bubbla från dialog-content-klick (stopPropagation-
   invariant bevarad).

**Bundle-impact:**
- `@radix-ui/*` totalt: ~980 KB node_modules
- Actual bundle-cost (gzipped, production): ~15-20 KB för dialog + alert-dialog
- Tree-shakable — andra primitives kräver separat install
- För jämförelse: huvudbundle är ~750 KB gzipped (vite default split)

**Dev experience:**
- Deklarativ struktur är lättare att läsa (`<Dialog><Portal><Content>`)
- Composition via `asChild` tillåter full styling-control
- Automatisk `data-state="open|closed"` för animation-hooks
- Dokumentation och communityexempel gott (radix-ui.com)

## Alternativ

### Alt A — Full migration till Radix (rekommenderad)

Migrera alla 6 dialoger + framtida komponenter (popovers, menus, tooltips)
till Radix primitives.

**Dialoger att migrera:**
- `ConfirmFinalizeDialog` — `AlertDialog` (destructiv confirm)
- `PaymentDialog` — `Dialog` + form
- `BulkPaymentDialog` — `Dialog` + form (stor)
- `BulkPaymentResultDialog` — `Dialog` (read-only result)
- `BatchPdfExportDialog` — `Dialog` (progress)

**Andra kandidater för framtida Radix:**
- Tooltip.tsx — `Tooltip`
- GlobalSearch.tsx combobox — `Combobox` / `Command`
- FixedAssetFormDialog + PageAccruals dialog — `Dialog`
- YearPicker — kan bli `Select`
- SupplierPicker — `Combobox` / `Command`

**Estimat full dialog-migration:** ~2-3 SP. Kan gå stegvis (en dialog
per commit).

**Upprensning:** `useDialogBehavior`-hooken kan deprekeras när alla
dialoger migrerats. Eventuellt behålls för custom non-modal-widgets.

### Alt B — Endast migrera nya dialoger, behåll befintliga

Introducera Radix för **framtida** dialoger (om/när behov uppstår) men
behåll nuvarande 6 med `useDialogBehavior`.

**Fördelar:** Ingen migration-overhead.
**Nackdelar:** Dual-mönster i kodbasen. Skillnad i a11y-kvalitet mellan
gamla och nya dialoger (gamla saknar inert, scroll-lock, portal).

### Alt C — Hoppa över Radix helt, utöka useDialogBehavior

Behåll egen implementation, lägg till inert/scroll-lock/portal i
useDialogBehavior.

**Fördelar:** Ingen extern dep.
**Nackdelar:** 
- Återimplementerar välrepeterad wheel — Radix har ~500k
  downloads/vecka, testat mot real AT över många år.
- Tester + underhåll på egen a11y-kod blir en kontinuerlig kostnad.
- Dokumentation + onboarding-friktion för nya utvecklare.
- Framtida komponenter (tooltip, combobox, menu) blir egna projekt.

## Rekommendation

**Alt A — genomför full Radix-migration i nästa sprint.**

Pilot-resultatet visar:
1. **Minskar kodstorlek** (26% i ConfirmDialog; liknande förväntat i andra)
2. **Förbättrar a11y-egenskaper** (inert, scroll-lock, portal)
3. **Inga regressioner** på befintliga beteenden eller tester
4. **Bundle-cost acceptabel** (~15-20 KB gzipped för komplett dialog-stack)
5. **Framtida tooling** för andra primitives är redan bygga (tooltip,
   combobox, menu) — en investering som betalar tillbaka sig snabbt

Min tidigare ståndpunkt ("useDialogBehavior räcker, Radix utan
incremental nytta") var fel. Pilot-empirin visar mätbar förbättring
både i kodkvalitet och a11y-egenskaper.

## Konsekvenser

### Om Alt A genomförs

**Accepterade:**
- Extern dep på `@radix-ui/*` (bra underhållen, ~500k downloads/v)
- `--force`-install krävs under eslint-10-peer-dep-konflikt (dokumenterat)
  men oberoende av Radix självt
- Bundle growth ~15-20 KB gzipped

**Behållna invarianter:**
- M156 (keyboard-navigation-kontrakt) — Radix implementerar alla fyra pelare
- API-surface per dialog-komponent oförändrad för konsumenter
- axe-core-testning via M133 oförändrad
- Pass/fail på befintliga E2E-tester

### Om Alt B eller C

Pilotens ConfirmDialog-migration rollbackas (git revert).
`@radix-ui/*`-deps avinstalleras. Dokumentation i denna ADR bevaras som
referens.

## Implementation-plan (om Alt A godkänns)

**Sprint P — Radix-migration (estimat ~2-3 SP):**
1. ConfirmFinalizeDialog → `AlertDialog` (ConfirmDialog-mönster, trivial)
2. PaymentDialog → `Dialog` + form (non-destructive)
3. BulkPaymentDialog → `Dialog` + form (stor, 280+ rader)
4. BulkPaymentResultDialog → `Dialog` (read-only, trivial)
5. BatchPdfExportDialog → `Dialog` (isExporting disabled-Escape-gate)
6. Uppdatera M156-dokumentation i CLAUDE.md (Radix som default-impl)
7. Deprekera `useDialogBehavior` (behåll filen med deprecation-note,
   radera i nästa sprint)

Verifiering:
- Alla dialog-tester passar
- axe-core clean på alla 6
- E2E 72/72 pass
- Lint + tsc clean

## Trigger-villkor för omvärdering

1. **Radix-team väljer annan licens eller breaking-changes** — osannolikt
   (MIT-licens, semver), men övervaka Radix 2.0-roadmap.
2. **Bundle-budget överskrids** — mät faktisk production-bundle innan
   och efter full migration. Om ökning > 40 KB gzipped, revidera.
3. **A11y-regression i real-world-screen-reader-test** — ingen
   indikation idag, men Sprint P bör inkludera manuell NVDA/VoiceOver-
   verifiering.

## Referenser

- [Radix UI Primitives docs](https://www.radix-ui.com/primitives)
- [ARIA 1.2 alertdialog spec](https://www.w3.org/TR/wai-aria-1.2/#alertdialog)
- M156 (CLAUDE.md § 59 — keyboard-navigation-kontrakt)
- [useDialogBehavior](../../src/renderer/lib/use-dialog-behavior.ts)
- [ConfirmDialog pilot](../../src/renderer/components/ui/ConfirmDialog.tsx)
- Sprint K summary (F49-c3 → M156 etablering)
