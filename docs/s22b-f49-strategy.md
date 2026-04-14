# F49 A11y-strategi

**Base commit:** bd62a9e (Sprint 22a F46 klar)
**Research-datum:** 2026-04-14
**Author:** Claude (S22b research-session)

## Executive summary (maskin-extraherbart)

- **Compliance:** WCAG 2.1 AA (bekräftad av William 2026-04-14)
- **Scope:** F49 = forms + dialoger + submitError + LoadingSpinner, 14 ytor in, kb-nav + lists out
- **Arkitektur:** Nivå D (kombination: B för shared UI-komponenter, A för inline forms)
- **Test-verktyg:** axe-core (redan installerat) + renderWithProviders (redan integrerat) + M133 grep-check
- **Första yta:** FormField + FormSelect + FormTextarea (shared UI-komponenter, 3 filer, maximal utväxling)
- **Estimerat sprint-antal:** 1 (S22c eller S23)

## 1. Compliance-scope

**Bekräftat:** WCAG 2.1 AA. Bekräftad av William 2026-04-14.

Fritt Bokföring är B2B-SaaS för svenska AB:n. Direkt WAD/DOS-scope osäkert,
men kunder kan vara under WAD (stora bolag, offentlig sektor). AA är
industri-standard och enda rimliga säljargumentet. AAA overkill för
bokföringsverktyg.
De relevanta WCAG-kriterierna för F49:

| Kriterium | Rubrik | Relevans |
|---|---|---|
| 1.3.1 | Info and Relationships | Labels, error-kopplade inputs |
| 3.3.1 | Error Identification | Fält som har fel identifieras för användaren |
| 3.3.2 | Labels or Instructions | Alla inputs har labels |
| 3.3.3 | Error Suggestion | Felmeddelanden förklarar hur man korrigerar |
| 4.1.2 | Name, Role, Value | Programmatiskt bestämbart state (aria-invalid) |
| 4.1.3 | Status Messages | Statusmeddelanden (loading, success, error) presenteras utan fokusflyttning |

**Bekräftad av William:** Ja (2026-04-14).

## 2. Yt-inventering och scope-beslut

### Fullständig inventering

| # | Yta | Typ | Rendering | Nuvarande a11y | F49-scope |
|---|---|---|---|---|---|
| 1 | FormField | Shared UI | FormField-komponent | label+htmlFor, error som plain `<p>` | **IN** |
| 2 | FormSelect | Shared UI | FormSelect-komponent | label+htmlFor, error som plain `<p>` | **IN** |
| 3 | FormTextarea | Shared UI | FormTextarea-komponent | label+htmlFor, error som plain `<p>` | **IN** |
| 4 | InvoiceForm | Form | Inline rendering | Partiell (F45: datum) | **IN** |
| 5 | ExpenseForm | Form | Inline rendering | Partiell (F45: datum) | **IN** |
| 6 | ManualEntryForm | Form | Inline rendering | Ingen | **IN** |
| 7 | CustomerForm | Form | Använder FormField/Select | Ärver FormField | **IN** (via #1-3) |
| 8 | ProductForm | Form | Använder FormField/Select/Textarea | Ärver FormField | **IN** (via #1-3) |
| 9 | PaymentDialog | Dialog | Inline rendering | Ingen | **IN** |
| 10 | PayExpenseDialog | Dialog | Inline rendering | Ingen | **IN** |
| 11 | BulkPaymentDialog | Dialog | Inline rendering | Ingen | **IN** |
| 12 | CreateFiscalYearDialog | Dialog | Inline rendering | Ingen | **IN** |
| 13 | submitError (5 forms) | Global error | Plain `<div>` | Ingen | **IN** |
| 14 | LoadingSpinner | UI | Ren visuell | Ingen | **IN** |
| 15 | InvoiceList | List | Tabell | Ingen | **UT** |
| 16 | ExpenseList | List | Tabell | Ingen | **UT** |
| 17 | Övriga listor | List | Tabell | Ingen | **UT** |
| 18 | Keyboard navigation | App-wide | — | Saknas helt | **UT** |
| 19 | Rapporter (Resultat/Balans) | Read-only | — | Ingen | **UT** |
| 20 | OnboardingWizard | Wizard | Inline | Ingen | **UT** (låg trafik) |

### Scope-beslut

**F49 = ytor 1–14** (forms + dialoger + submitError + LoadingSpinner).

Motivering:
- **Maximal utväxling:** FormField/Select/Textarea (#1-3) fixar automatiskt
  CustomerForm och ProductForm (#7-8) utan extra arbete.
- **Kritisk yta:** Forms och dialoger är där användare interagerar med
  felmeddelanden — den primära a11y-skulden.
- **Avgränsning:** Lists (#15-17) är read-only, kb-nav (#18) kräver
  arkitektur-arbete utanför F49-scope, wizard (#20) har låg trafik.

Framtida sprintar:
- **F49b:** Lists + rapporter (tabellsemantik, headers)
- **F49c:** Keyboard navigation (fokus-ordning, skip-links)
- **F49d:** OnboardingWizard (wizard-pattern, steg-announcering)

## 3. Arkitektur-val

### Utvärdering

| Nivå | Beskrivning | Kostnad | Konsistens | Bedömning |
|---|---|---|---|---|
| A — Inline | Kopiera ARIA per fält | Låg | Låg | Otillräcklig för 50+ fält |
| B — Shared hook | `useFieldA11y()` | Medium | Medium | Bra för shared UI-komponenter |
| C — Wrapper-komponent | `<AccessibleField>` | Hög | Hög | Overkill — FormField finns redan |
| D — Kombination | B+A efter behov | Medium | Hög | **Bäst: fixar 3 filer → 8 formulär** |

### Beslut: Nivå D (kombination)

**Steg 1: Uppgradera FormField, FormSelect, FormTextarea (nivå B-approach).**

Dessa 3 komponenter är redan shared wrappers. Att lägga till ARIA-attribut
direkt i dem ger a11y-förbättring för alla formulär som använder dem
(CustomerForm, ProductForm). Ingen ny hook behövs — logiken är tillräckligt
enkel att bäddas in direkt.

Mönster (FormField som exempel):
```tsx
const errorId = error ? `${formName}-${name}-error` : undefined

<input
  id={name}
  aria-invalid={!!error}
  aria-describedby={errorId}
  ...
/>
{error && (
  <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
    {error}
  </p>
)}
```

**Steg 2: Applicera samma mönster inline i InvoiceForm, ExpenseForm,
ManualEntryForm, dialoger (nivå A-approach).**

Dessa formulär har inline-renderade fält som inte använder FormField. Samma
ARIA-triad (`aria-invalid` + `aria-describedby` + `role="alert"`) appliceras
direkt. InvoiceForm/ExpenseForm har redan mönstret på datum-fält — det
utvidgas till alla fält.

**Steg 3: submitError + LoadingSpinner (dedikerade fixar).**

- `submitError`: Lägg till `role="alert"` på wrapper-div.
- `LoadingSpinner`: Lägg till `role="status"` + `aria-label="Laddar"`.

### Varför inte en ny hook?

`useFieldA11y()` som genererar `{ 'aria-invalid': ..., 'aria-describedby': ..., errorProps: ... }`
kräver att varje fält-rendererare integrerar hookens output. FormField gör
detta redan internt. InvoiceForm/ExpenseForm har så heterogena fält-typer
(inline inputs, picker-komponenter, line-rows) att en hook inte förenklar
mer än copy-paste av 3 attribut. Hook-overhead > inline-overhead vid <10 fält per form.

## 4. Taktik-spec

### 4.1 ARIA-attribut per fält

Alla input-element som kan visa fel:

```tsx
// Generera unikt error-ID
const errorId = error ? `${formName}-${fieldName}-error` : undefined

// På input/select/textarea:
aria-invalid={!!error}
aria-describedby={errorId}

// På error-meddelande:
<p id={errorId} role="alert">{error}</p>
```

### 4.2 submitError (global form-error)

```tsx
{form.submitError && (
  <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {form.submitError}
  </div>
)}
```

`role="alert"` = implicit `aria-live="assertive"`. Skärmläsare announcerar
meddelandet omedelbart vid rendering.

### 4.3 Loading states

```tsx
// LoadingSpinner:
<div role="status" aria-label="Laddar" className="...">
  <div className="animate-spin ..." />
</div>
```

`role="status"` = implicit `aria-live="polite"`. Skärmläsare announcerar
vid render utan att avbryta pågående tal.

### 4.4 Validering: Zod-error-mappning (befintlig)

Systemet använder redan Zod → `useEntityForm.errors` → per-fält rendering.
HTML5 `:invalid` pseudo-klass behövs ej — all validering sker via Zod
vid submit, inte nativ HTML-validering. `noValidate` bör explicit sättas
på `<form>` för att förhindra att nativa tooltips stör skärmläsaren.

### 4.5 ID-generering

`${formName}-${name}-error` ger unika IDs givet att `formName` är unikt
per formulär-instans (redan enforced: `formName` är required prop på
FormField/Select/Textarea). `useId()` behövs ej — mönstret är deterministiskt
och testbart.

### 4.6 TanStack Query — aria-busy

**Beslut: UT ur F49.** Motivering:
- `isPending` renderas redan som LoadingSpinner (som får `role="status"` i F49).
- `isError` states från queries renderas som inline felmeddelanden. Dessa
  fångas av fältspecifik `role="alert"` eller av submitError-mönstret.
- `aria-busy` på container-element vid isPending kräver wrapper-refaktor
  av varje sida. Kostnad > värde för F49-scope.

### 4.7 Live-regions-policy

| Typ | ARIA | Användning |
|---|---|---|
| Fält-fel | `role="alert"` (assertive) | Per-fält error vid submit-validation |
| Submit-error | `role="alert"` (assertive) | Global backend-fel |
| Loading | `role="status"` (polite) | LoadingSpinner |
| Success/toast | `role="status"` (polite) | Framtida — inte i F49-scope |

## 5. Fokus-hantering

### F49-scope (minimal)

**Submit-failure:** Ingen explicit fokus-flytt i F49. Motivering:
- `role="alert"` announcerar felet utan fokus-flytt (WCAG 4.1.3).
- Fokus-flytt till första fält med fel kräver ref-hantering som inte
  finns i `useEntityForm` idag — arkitektur-tillägg utanför F49-scope.

**After-correction:** Användaren tabbar manuellt. Felet rensas vid
`setField` (redan implementerat i useEntityForm rad 78-82).

### Framtida (F49b+)

- Error summary med fokus-flytt vid submit (`focus()` på summary-element)
- Auto-fokus till första fält med fel
- Kräver `ref`-registrering per fält i useEntityForm — designas i separat sprint

## 6. Språk-checklista

| Egenskap | Status | Åtgärd i F49 |
|---|---|---|
| `<html lang="sv">` | Finns | Ingen |
| Tekniska termer (SIE, OCR) | Ej markerade | **UT** — lågrisk, kan läggas till senare |
| Numerisk formatering (1 234,56 kr) | Behöver VoiceOver-test | **UT** — manuell testning separat |
| Datum-format (2026-01-01) | ISO — korrekt för sv | Ingen |
| `aria-label` på LoadingSpinner | Ny, svensk text | **IN** |
| Felmeddelanden | Redan på svenska via Zod | Ingen |

## 7. Test-strategi

### 7.1 Befintlig infrastruktur

| Verktyg | Status | Notering |
|---|---|---|
| `axe-core ^4.11.3` | Installerat | Kör via renderWithProviders |
| `@testing-library/react` | Installerat | Alla renderer-tester |
| `renderWithProviders` | `axeCheck: true` default | Violation = test failure |
| `color-contrast` rule | Disabled | jsdom-begränsning |
| CI | **Saknas** | Tester körs manuellt (`npm test`) |
| Pre-commit hooks | **Saknas** | Inget lint-staged/husky |
| `check:m131` | Finns | Bash grep-check, körs manuellt |

### 7.2 F49 test-plan

| Nivå | Verktyg | Vad det fångar | Gate |
|---|---|---|---|
| Unit | axe-core via renderWithProviders | WCAG A/AA per komponent | `npm test` (lokalt) |
| Unit | `@testing-library/jest-dom` | `toHaveAttribute('aria-invalid')` etc. | `npm test` |
| Static | M133 grep-check (ny) | `<p>.*error` utan `role="alert"` | `npm run check:m133` |
| Manual | VoiceOver (macOS) | Faktisk skärmläsar-upplevelse | Per-sprint sampling |

### 7.3 Testpyramid

- **70% axe-core unit:** Aktivera `axeCheck: true` på InvoiceForm, ExpenseForm (ta bort `axeCheck: false`). Lägg till renderer-tester för ManualEntryForm, dialoger.
- **20% attribut-assertions:** `expect(input).toHaveAttribute('aria-invalid', 'true')` i error-state-tester.
- **10% manuell VoiceOver:** 1 runthrough per sprint (InvoiceForm → submit → errors → correction).

### 7.4 M133 grep-check

Ny statisk kontroll som fångar regression:

```bash
#!/usr/bin/env bash
# scripts/m133-check.sh
# Fångar error-rendering utan role="alert" i renderer-komponenter.
#
# Mönster som flaggas:
#   <p ...>{errors.X}</p>          utan role="alert"
#   <p ...>{form.errors.X}</p>     utan role="alert"
#   <p ...>{error}</p>             utan role="alert" (i FormField etc.)
#
# Undantag: rad som innehåller role="alert" passerar.

set -euo pipefail
EXIT=0
while IFS= read -r file; do
  grep -n '<p[^>]*>.*\(errors\.\|error\)' "$file" \
    | grep -v 'role="alert"' \
    | grep -v '// m133-ok' \
    && { echo "  ^ $file"; EXIT=1; }
done < <(find src/renderer -name "*.tsx")
exit $EXIT
```

Gate: `npm run check:m133` i package.json. Körs manuellt (inget CI).

**Timing (bekräftad av William):** M133 etableras i **sista härdnings-commit**
(commit 8), inte första. Samma mönster som M131 (etablerad efter koden var
grön). Att bygga regeln samtidigt som man bryter mot den = frustrerande
iteration. En eller två M-regler (M133 + ev. M134 för axeCheck:false-warn)
beslutas i commit 8 baserat på false-positive-profil.

### 7.5 axeCheck: false-avveckling (gradvis, bekräftad av William)

`axeCheck: false` tas bort **gradvis, per commit**, inte big-bang:
- Varje commit som härdar en yta tar bort `axeCheck: false` för den ytans
  testfiler i samma commit.
- Commit 7 (sista härdnings-commit): verifiera att alla `axeCheck: false`
  är borta. Om edge-case kvarstår: dokumentera explicit varför.
- M133/M134 grep-check kan inkludera `axeCheck: false`-detektion som warn.

Gradvis borttagning fungerar som **progress-mätare** commit-för-commit.

### 7.6 CI-rekommendation

Befintlig setup: inga workflows, ingen CI-plattform. `npm test` körs
manuellt. `check:m131` körs manuellt.

**Rekommendation:** Inför CI som separat sprint (ej F49). F49-leverans:
`check:m133` manuell gate, konsistent med `check:m131`.

## 8. Implementations-plan (S22c/S23-skelett)

### Commits

| # | Scope | Filer | Test-delta |
|---|---|---|---|
| 1 | FormField + FormSelect + FormTextarea: ARIA-triad | 3 src-filer, 3 testfiler | +0 (befintliga tester täcker, uppdatera assertions) |
| 2 | submitError: `role="alert"` i alla 5 formulär | 5 src-filer | +5 assertions i befintliga tester |
| 3 | LoadingSpinner: `role="status"` + `aria-label` | 1 src-fil | +1 nytt test |
| 4 | InvoiceForm: ARIA på alla inline-fält + noValidate, ta bort axeCheck:false | 1 src-fil, 2 testfiler (ta bort axeCheck:false) | +0 (axe-gate ger coverage) |
| 5 | ExpenseForm: ARIA på alla inline-fält + noValidate, ta bort axeCheck:false | 1 src-fil, 2 testfiler (ta bort axeCheck:false) | +0 |
| 6 | ManualEntryForm: ARIA på alla inline-fält + noValidate | 1 src-fil | +1 nytt renderer-test |
| 7 | Dialoger: PaymentDialog, PayExpenseDialog, BulkPaymentDialog, CreateFY | 4 src-filer | +4 nya renderer-tester |
| 8 | M133 grep-check + verifiera alla axeCheck:false borta + docs + sprint-stängning | scripts/, package.json, CLAUDE.md, STATUS.md, CHECKLIST.md, docs/bug-backlog.md | +1 (m133 självtest) |

### Testantal-estimat

- Start: 1481 passed
- Commit 1-3: +6 (assertions i befintliga tester + LoadingSpinner)
- Commit 4-5: +0 (axeCheck: false → true, implicit via axe)
- Commit 6: +1 (ManualEntryForm renderer-test)
- Commit 7: +4 (dialog renderer-tester)
- Commit 8: +1 (m133 självtest)
- **Slut: ~1481 + 12 = ~1493** (estimat, kan variera)

### Första commit = Minimum viable milestone

**FormField + FormSelect + FormTextarea** (commit 1). Motivering:
- 3 filer ger a11y-täckning för CustomerForm (11 fält) + ProductForm (7 fält)
  utan att röra dessa formulär.
- Befintliga axe-tester för dessa komponenter ger omedelbar verifiering.
- Låg risk, hög utväxling. Om F49-sprinten avbryts efter commit 1 har
  2 formulär fullständig a11y.

### Commit-ordning motivering

1-3 (shared) → 4-5 (högrisk-forms med axeCheck:false) → 6-7 (övriga) → 8 (infra)

Shared-first: CustomerForm och ProductForm fixas gratis. Sedan de
forms som har kända violations (axeCheck:false). Sist: forms utan
tester + infra.

## 9. M-nummer-kandidater

Senaste M-nummer: **M132** (Sprint 22a).

| Kandidat | Namn | Beskrivning | Beslut i S22c |
|---|---|---|---|
| M133 | Error a11y-rendering | Alla error-`<p>` i renderer ska ha `role="alert"` + `id` + `aria-describedby` på tillhörande input. Grep-check fångar regression. | Etableras vid commit 8 |
| M134 | submitError a11y | `submitError`-rendering i forms ska alltid ha `role="alert"`. | Implicit i M133 — kanske inte separat M-nummer |
| M135 | LoadingSpinner a11y | LoadingSpinner ska ha `role="status"` + `aria-label`. | Liten yta — kanske inline i M133 |

**Rekommendation:** En M-regel (M133) som täcker all error/status-rendering
i renderer. Inte 3 separata. M133 grep-check enforcar regeln statiskt.

## 10. Non-goals för F49

- Färgkontrast-audit (WCAG 1.4.3) — `color-contrast` disabled i axe pga jsdom
- Motion-preferences (`prefers-reduced-motion`)
- Mobile-a11y (Electron desktop-only)
- I18n bortom svenska
- Typografi / font-scaling
- Layout-refaktor för keyboard-navigation
- `aria-busy` på TanStack Query containers
- Error summary med fokus-flytt vid submit
- Skip-links
- List/table semantik (`role="row"`, `aria-sort`)
- Wizard-pattern (steg-announcering)

## 11. Öppna frågor för William — ALLA BESVARADE (2026-04-14)

1. **Compliance-nivå:** AA bekräftad. Industri-standard, enda rimliga säljargumentet.
2. **Scope:** forms+dialoger+spinner godkänt. Lists/reports → F50/F51 vid behov.
3. **axeCheck:false-avveckling:** Ja, men **gradvis per commit** (inte big-bang). Borttagning som progress-mätare. Edge-cases dokumenteras explicit.
4. **M133:** Ja, men **i sista härdnings-commit** (commit 8). Samma mönster som M131. En eller två M-regler beslutas baserat på false-positive-profil.
5. **VoiceOver-test:** Ja, som **per-sprint-sampling** (inte per-commit). 1 runthrough av InvoiceForm-flow innan sprint-avslut. Dokumenteras i CHECKLIST.md.
6. **noValidate:** Ja. Standard-mönster vid Zod-validering. Single source of truth.

## 12. Bilaga: Baseline-rapport

Se `docs/s22b-baseline.md`.
