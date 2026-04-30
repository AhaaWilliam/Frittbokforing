# Överlämning: H+G-redesign — komplett, post-arc-status

**Status per 2026-04-30:** H+G-1 till H+G-25 levererade. Hela design-planen
är genomförd. Återstående arbete kräver produktbeslut.

**Planen:** [`docs/redesign-h-plus-g-plan.md`](redesign-h-plus-g-plan.md)
**Källa:** `~/Downloads/fritt-h-plus-g-prototyp-svartvit.html`
**Föregående överlämning:** [`docs/redesign-h-plus-g-handoff.md`](redesign-h-plus-g-handoff.md)
(beskrev läget efter bara H+G-1)

---

## Vad som är levererat

### Fas 1 — Token-foundation (H+G-1, redan klart innan denna session)

- Papperston `#f1f0ee`, dusty teal `#7a9498`, mint sage `#94a58c`,
  terracotta `#b08568`, dämpad röd `#9a4d4d`, varmare neutralpalett.
- Radius nedsänkt 4-6px.
- Mörka topbar-tokens reserverade för bokförare.

### Fas 2 — Typografi + layout-foundation (H+G-2..5)

| Sprint | Innehåll | Commit |
|---|---|---|
| **H+G-2** | `<SectionLabel>`-primitive, font-serif page-headings, italic Fritt-brand på LockScreen/Onboarding/Vardag/Overview, font-mono numeriska kolumner i InvoiceListRow + ExpenseListRow | [`5747a9d`](https://github.com) |
| **H+G-3** | `<BigButton>` 220×220, redesignad VardagApp som hero-screen (greeting · "Vad vill du göra idag?" · 3 BigButtons · status-pills · kbd-hints). Borttaget: VardagBottomNav, VardagPageInbox/Spend/Income/Status, vardag-routes (-953 LOC) | [`7d95c4d`](https://github.com) |
| **H+G-4** | `<AppTopBar>` med italic Fritt 19px + företag + FY-period + mode-pill med `⌘⇧B`-shortcut. Mörk topbar i bokförare, ljus i vardag. `KbdChip` `light/dark`-variant. `useFiscalYearContextOptional` | [`e46be37`](https://github.com) |
| **H+G-5** | Bokförare 3-zone grid `grid-cols-[240px_1fr_360px]`. `<ZoneCons>` placeholder, `<ZoneNuHead>` primitive, Sidebar i card-2-bg | [`f6555fd`](https://github.com) |

### Fas 3 — Innehåll i zoner (H+G-6..8)

| Sprint | Innehåll | Commit |
|---|---|---|
| **H+G-6** | ManualEntryList restyling: ZoneNuHead-meta ("N verifikat · M utkast · senast ID"), `<StatusDot>`, font-mono id/datum/belopp | [`751fa41`](https://github.com) |
| **H+G-7** | `<StatusNu>` i konsekvens-zonen med real data via `useDashboardSummary`: Likvida medel, Obetalt (kund/lev), Moms-netto, Resultat hittills | [`5244452`](https://github.com) |
| **H+G-8** | `<BottomSheet>` token-styling (italic Fraunces titel), `<Field>`/`<KonteringRow>`/`<KonteringHeader>`/`<ReceiptVisual>` primitives, `<BokforKostnadSheet>` + `<SkapaFakturaSheet>` i Vardag (visuella prototyper) | [`7bebeb5`](https://github.com) |

### Fas 4 — Polish + token-coverage milestone (H+G-9..15)

| Sprint | Innehåll | Commit |
|---|---|---|
| **H+G-9** | 100% token-coverage milestone: sista 19 raw-färger borta. `grep` efter `red\|blue\|green\|amber\|yellow\|orange\|...-[0-9]` returnerar **0** matchningar | [`81b21d6`](https://github.com) |
| font-sunset | `font-display` → `font-serif` på sista 2 callsites (ConsequencePane, StatusCard) | [`30cbff8`](https://github.com) |
| **H+G-10** | Vardag-hero visual baseline | [`ec3ee3b`](https://github.com) |
| **H+G-11** | Manual-entries + sheet-kostnad baselines | [`41daf58`](https://github.com) |
| **H+G-12** | BigButton/SectionLabel/ZoneNuHead/AppTopBar enhets-tester (+19) | [`03fe1bd`](https://github.com) |
| **H+G-13** | Field/KonteringRow/ZoneCons enhets-tester (+17) | [`fbff6fe`](https://github.com) |
| **H+G-14** | StatusNu enhets-tester med mockade hooks (+5) | [`97e24dd`](https://github.com) |
| **H+G-15** | Sidebar nav-counts (Pengar in/ut, Kunder, Leverantörer) — matchar prototypens NavItem-mönster | [`0927b6f`](https://github.com) |

### Fas 5 — Cleanup + tests-stabilisering (H+G-16..25)

| Sprint | Innehåll | Commit |
|---|---|---|
| **H+G-16** | Sprint 76 LoadingSpinner-test fix post-S88 TableSkeleton-migration → **3996/3996 gröna, 0 failures** | [`e2c40c2`](https://github.com) |
| **H+G-17** | Visual baseline timing-fix för sidebar-counts | [`d3686a0`](https://github.com) |
| **H+G-18** | `tests/e2e/helpers/seed.ts` M158-modernisering (companyId-param backwards-compat) | [`a481545`](https://github.com) |
| **H+G-19** | Vardag-sheet-faktura baseline | [`5548112`](https://github.com) |
| **H+G-20** | MEMORY.md uppdaterad (utanför git) | (memory) |
| **H+G-21+22** | App-shell-expenses-empty + bank-empty baselines | [`8a1354a`](https://github.com) |
| **H+G-23** | Pill `withDot` på 10 status-callsites; kategori-pills oberörda | [`4260ad2`](https://github.com) |
| **H+G-24** | Vänta in alla 4 sidebar-counts i income-baseline | [`29a54ee`](https://github.com) |
| **H+G-25** | Sidebar count-prop tester (+2) | [`fad9fcc`](https://github.com) |

---

## Mätbar slutstatus

| Mätvärde | Före (H+G-1) | Efter (H+G-25) |
|---|---|---|
| Vitest gröna | 953 | **3998** (+3045 — primärt H+G-arc + S56-94) |
| Failures | 4 (transient) | **0** (stabil) |
| Visual baselines | 5 | **11** (+6) |
| Token-coverage (renderer) | ~95% | **100%** |
| Nya UI-primitives | — | **9** (SectionLabel, BigButton, AppTopBar, ZoneCons, ZoneNuHead, Field, KonteringRow/Header, StatusNu, ReceiptVisual) |
| Borttagna komponenter | — | 5 (VardagBottomNav + 4 sub-pages) |
| Netto LOC | — | -700 (mer borttaget än tillagt netto) |

---

## Arkitektoniska tillägg

### Nya primitives (per kategori)

**Layout:**
- `<AppTopBar>` — global topbar med mode-pill
- `<ZoneCons>` — höger 360px-zon, default-StatusNu
- `<Sidebar>` (uppdaterad) — `count`-prop, card-2-bg, SectionLabel-rubriker

**UI-primitives:**
- `<SectionLabel>` — UPPERCASE 10px tracking-wide rubrik (Vad/Hantera/Register etc.)
- `<BigButton>` — 220×220 hero-knapp för Vardag (color: plommon/mint/dark)
- `<ZoneNuHead>` — titel + sub-rad-header för Nu-zonen
- `<Field>` — sheet-formulärfält med uppercase-label, hint, error
- `<KonteringRow>` + `<KonteringHeader>` — kontering-rader för förslag/preview
- `<ReceiptVisual>` — 3:4 drag-zone-placeholder för kvitto-foto
- `<StatusDot>` — färgad punkt (mint/warning/danger/info) per rad

**Zone-content:**
- `<StatusNu>` — KONSEKVENS-zonens default: likvida + obetalt + moms + resultat
- `<BokforKostnadSheet>` + `<SkapaFakturaSheet>` — Vardag-sheets (visuell prototyp)

### Nya konventioner

- **`useFiscalYearContextOptional()`** — null-safe variant för komponenter
  som rendreras både inom och utanför FiscalYearProvider (AppTopBar).
- **`KbdChip variant: 'light' | 'dark'`** — dark-variant för mörk topbar.
- **Pill-konvention:** status-pills (state-över-tid) använder `withDot`,
  kategori-pills (typ-indikatorer) inte. ManualEntryList table-rows har
  redan StatusDot per rad → undantag, ingen Pill withDot för att undvika
  redundans.
- **Test-pattern för hooks-mockade tester:** `vi.mock('../../lib/hooks')`
  + `vi.mocked(useDashboardSummary).mockReturnValue(...)` (StatusNu-test).

### CSS-tokens (alla i `src/renderer/index.css`)

- `--top-bar-surface` / `--top-bar-text` / `--top-bar-border` (mörk i bokförare,
  ljus i vardag — via `[data-mode]` on documentElement)
- `--surface-secondary` (card-2 bg för Sidebar/ZoneCons)
- `--color-mint-50/100/500/600/700` (sage/positivt-färgskala)
- `--color-dark` / `--color-dark-soft` (BigButton dark-variant + mörk topbar)
- `.section-label` CSS-class (UPPERCASE tracking-wide 10px faint)
- `.font-serif-italic` (italic Fraunces för "Fritt"-brand)

---

## Vad som ska byggas (uppskjutet — kräver beslut)

### Block 1: VerifikatLivePreview + VerifikatDetaljPaverkan i ZoneCons

**Status:** Uppskjutet — kräver produktbeslut om var preview ska placeras.

**Bakgrund:**
- H+G-prototypen visar `VerifikatLivePreview` (debet/kredit live + balans-pill
  + didaktiska kommentarer) och `VerifikatDetaljPaverkan` (BR/RR-effekt) i
  ZoneCons när användaren bokför eller läser ett verifikat.
- I dagens kod existerar `<ConsequencePane>` (Sprint 16, ADR 006) som visas
  **inline** i forms via `<WorkspaceLayout>` (InvoiceForm, ExpenseForm,
  ManualEntryForm).
- AppShell ZoneCons (H+G-5) visar StatusNu globalt — detta dubbla "höger-zon-
  innehåll" kan visas samtidigt om en form öppnas.

**Vad som behöver beslutas:**
1. Ska ConsequencePane flyttas från form-inline → AppShell-ZoneCons via
   en delad `PreviewContext`? (UX-flytt: preview blir global istället för
   form-lokal.)
2. Eller behålls dual-rendering (inline + ZoneCons-StatusNu)?
3. Vid flytt: hur hanteras forms som inte använder WorkspaceLayout?

**Beräknat arbete:** 3-5h om Alt-1 väljs (kontext-arkitektur, refaktor av 3
forms, uppdatera tester, ny visual baseline för "form-edit + ZoneCons-preview").

**Filer som påverkas:**
- `src/renderer/components/consequence/ConsequencePane.tsx`
- `src/renderer/modes/bokforare/WorkspaceLayout.tsx`
- `src/renderer/components/invoices/InvoiceForm.tsx`
- `src/renderer/components/expenses/ExpenseForm.tsx`
- `src/renderer/components/manual-entries/ManualEntryForm.tsx`
- Ny: `src/renderer/contexts/PreviewContext.tsx`
- `src/renderer/pages/AppShell.tsx`

### Block 2: Sheets funktionell integration

**Status:** Visuella prototyper finns; funktionell integration uppskjuten.

**Bakgrund:**
- `BokforKostnadSheet` och `SkapaFakturaSheet` är visuella stubs som matchar
  H+G-prototypen men har inga IPC-anrop, ingen kontering-algo, ingen OCR.
- "Bokför"- och "Skicka"-knapparna är `disabled`.

**Vad som behöver beslutas:**
1. **OCR-pipeline:** Egen lokal OCR (Tesseract.js?) eller cloud-API? Eller manuell
   inmatning med smart-defaults bara?
2. **Kontering-förslagsalgo:** Heuristisk (leverantör-baserad), ML-baserad,
   eller manuell-välj-kontot? Hur tränas modellen i privat-data-scenario?
3. **IPC-kontrakt:** Återanvänd `createExpense`/`saveDraft`/etc., eller bygg
   sheet-specifika handlers?
4. **Kvitto-bilaga:** Hur lagras bilden? `attachments`-tabell finns inte än.

**Beräknat arbete:** 8-15h beroende på besluten ovan. Stor sprint.

**Filer som påverkas:**
- `src/renderer/modes/vardag/VardagApp.tsx` (sheet-rendering)
- Ny IPC-kanal för OCR (`ocr:scan-receipt`)
- Migration för `expense_attachments`-tabell
- Eventuell ny modul `src/renderer/components/ocr/`

### Block 3: ZoneCons opt-out för wide-table-pages

**Status:** Uppskjutet — kräver per-page beslut.

**Bakgrund:**
- 3-zone-griden (H+G-5) har alltid 360px ZoneCons synlig.
- Wide-table-pages (faktura-list med 11 kolumner) komprimeras märkbart vid
  1280px viewport.
- Acceptabelt baseline men kan vara störande i praktiken.

**Vad som behöver beslutas:**
- Vilka sidor får hide-ZoneCons? (Faktura-list, Kostnad-list, Kontoutdrag,
  Importerade verifikat — alla med >8 kolumner?)
- Hur signaleras opt-out? Per-route-flag i `routes.ts`? Eller komponent-prop?
- Animation vid hide/show av ZoneCons?

**Beräknat arbete:** 2-3h (route-flag-mönster + conditional rendering +
opt-out-tester per page).

### Block 4: NavGroup count-data per nav-rubrik

**Status:** Delvis levererat — H+G-15 lade counts på 4 nav-rader.

**Vad återstår:**
- Counts per nav-rubrik ("Hantera 6", "Register 3" etc.)
- Counts på fler items: Bokföringsorder (utkast), Periodiseringar
  (aktiva schedules), Anläggningstillgångar, Bankavstämning (omatchade
  transaktioner), Importerade verifikat
- Eventuell aggregat-IPC `getNavCounts` om fyra parallella list-IPC blir
  performance-flaskhals

**Beräknat arbete:** 2h med befintliga IPC-call-mönster, eller 3-4h om dedikerad
`getNavCounts`-handler byggs.

### Block 5: Polish-stragglers (diminishing returns)

- Visual baselines för Periodiseringar, Anläggningstillgångar, Inställningar
- Stryker scope-utvidgning till H+G-primitives (kräver config-debugging)
- Hover-/active-state-baselines (icke-deterministiska, kräver special-setup)
- AppShell unit test (täcker den 3-zone-strukturen direkt)

---

## Verifikationsritual per sprint

Oförändrat sedan H+G-1:

```bash
npm run test                       # Vitest — alla renderer-tester (~3998)
npm run typecheck                  # TS strict mode
npm run check:m133                 # A11y guard (ingen `axeCheck: false` utan undantag)
npm run check:m133-ast             # AST-check inline error-rendering
npm run build                      # Vite build
npm run test:visual:update         # Regenerera 11 baselines
# Granska bilder i tests/e2e/visual-regression.spec.ts-snapshots/
git add -A
git commit -m "feat(design): Sprint H+G-N — ..."
```

---

## Kontextuella gotchas

### Native module ABI (oförändrat)

- `npm run test:visual:update` rebuildar `better-sqlite3` för Electron, sen
  tillbaka till Node-ABI. Om vitest kraschar med `NODE_MODULE_VERSION`-fel:
  `npm rebuild better-sqlite3 better-sqlite3-multiple-ciphers`.

### Visual regression baselines

- 11 .png-filer committas i `tests/e2e/visual-regression.spec.ts-snapshots/`.
- macOS-specifika (suffix `-darwin`).
- Linux-CI kräver Docker (separat infra-jobb).

### Auth-bypass i E2E

- `tests/e2e/visual-regression.spec.ts` använder `__authTestApi.createAndLoginUser`.
- Mönstret kommer från `flows/backup-restore.spec.ts`, kräver `FRITT_TEST=1`.

### Stryker-konfigs

- Kärnscope: `stryker.conf.json` (main + shared + 2 renderer/lib)
- Hooks-scope: `stryker.renderer.conf.json` (3 hook-tester)
- H+G-primitives **ingår inte** i mutation-scope ännu — separat sprint vid
  behov, kräver config-debugging.

### M133 a11y-check

- AST-baserad: `scripts/check-m133-ast.mjs`.
- Inga inline error-rendering-callsites utan `role="alert"`.
- Grep-variant: `scripts/check-m133.mjs` förbjuder `axeCheck: false` utan
  `// M133 exempt`-kommentar.

---

## Filer att läsa innan ny sprint

I prioritetsordning:

1. **Denna fil** — för status och blocker-beslut
2. [`docs/redesign-h-plus-g-plan.md`](redesign-h-plus-g-plan.md) — full
   strategisk plan (alla 8 sprintar)
3. `~/Downloads/fritt-h-plus-g-prototyp-svartvit.html` — design-källa
4. `src/renderer/index.css` — tokens + CSS-utilities
5. `src/renderer/styles/tokens.ts` — TS-paritet med CSS
6. Specifik H+G-sprint-commit i git-loggen för konkret diff:
   ```bash
   git log --oneline --grep "H\\+G" | head -25
   ```
7. `tests/e2e/visual-regression.spec.ts` — 11 verifierings-scenarion
8. `CLAUDE.md` regel 13-63 (M120 till M161) — arkitektur-konventioner

---

## Beslut-redo lista för nästa session

Innan nästa block kan sprintas behövs ett av:

- [ ] **Block 1:** "Flytta ConsequencePane till ZoneCons via PreviewContext" — eller "behåll inline"
- [ ] **Block 2:** OCR-strategi + kontering-algo + attachment-modell
- [ ] **Block 3:** Lista över wide-table-pages som ska få hide-ZoneCons
- [ ] **Block 4:** Vilka fler nav-items behöver counts? Aggregat-IPC eller per-route?
- [ ] **Block 5 (om man vill köra polish):** Vilken sub-prio är högst?

---

## Slutverifiering

Starta appen och navigera mellan Vardag och Bokförare:

- **Vardag-läget** ska kännas som prototypens hero-screen (italic Fritt
  topbar, dag · "God morgon, [tid]", 3 BigButtons med pil-affordans,
  status-pills, kbd-hints i fot).
- **Bokförare-läget** ska visa 3-zone-grid (Sidebar med counts | huvudvy
  med ZoneNuHead | KONSEKVENS med StatusNu live data).
- **⌘⇧B** togglar mode i båda riktningar.
- **Sheets** öppnas från BigButtons med italic Fraunces titel + Field-grid +
  förslag-kontering (visuell prototyp, "Bokför"/"Skicka" disabled).

Det ska kännas som prototypen — inte som tidigare modern SaaS-app.

---

## När alla 5 block är klara

H+G-redesign är då helt komplett inklusive funktionell integration. MEMORY.md
ska uppdateras med ny phrase: "H+G-redesign produktiserad — visuellt match
**+** funktionell paritet med prototyp uppnådd."

Tills dess är design-arc avslutad i visuell+strukturell mening, men sheets
kvarstår som showroom-stubs och konsekvens-zon-modes (live/detalj) kvarstår
inline i forms via legacy WorkspaceLayout.
