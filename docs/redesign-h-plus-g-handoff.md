# Överlämning: H+G-redesign — fortsättning

**Status per 2026-04-30:** Sprint H+G-1 levererad. 7 sprintar kvar.
**Plan:** [`docs/redesign-h-plus-g-plan.md`](redesign-h-plus-g-plan.md)
**Källa:** `~/Downloads/fritt-h-plus-g-prototyp-svartvit.html`

---

## Var vi står

Token-palette swap (Sprint H+G-1, commit [`fe3b034`](../)) är klar.
Visuellt resultat verifierat:

- Papperston `#f1f0ee` bakgrund överallt (vs pure white)
- Dusty teal `#7a9498` som primär accent (selected nav, focus)
- Mint sage `#94a58c` för positivt (success → mint alias)
- Terracotta `#b08568` för warning + förfallen-status
- Dämpad röd `#9a4d4d` för danger (CHECK-fel)
- Neutralpalett varmare: `#1a1a18` text, `#56544f` muted, `#d6d4cf` border
- Radius nedsänkt 4-6px (mer fyrkantig estetik)
- Mörka ytor (`#1d1c1a`) reserverade för bokförare-topbar i H+G-4

Inget layout ändrat än. Komponenter använder samma token-namn —
fick bara nya värden.

**Tester:** 953 renderer-tester gröna · 5 visual baselines regenererade
**Test-mode parity-tester:** uppdaterade i `tests/sprint-12-token-parity.test.ts` + `tests/sprint-69-status-tokens.test.ts`

---

## Beslutspunkter — alla godkända (per user 2026-04-30)

| # | Beslut | Status |
|---|---|---|
| 1 | Vardag sub-pages bort (Inbox/Spend/Income/Status) | ✅ — gör i H+G-3 |
| 2 | Bottom-nav bort | ✅ — gör i H+G-3 |
| 3 | Mode-toggle i topbar | ✅ — gör i H+G-4 |
| 4 | Mörk topbar i bokförare | ✅ — token reserverad i H+G-1, applicera i H+G-4 |
| 5 | Danger-färg behåll dämpad `#9a4d4d` | ✅ — gjort i H+G-1 |
| 6 | Vardag flerårsperiod-label = "senaste aktiva period" | ✅ — gör i H+G-4 |
| 7 | Regenerera visual baselines per sprint | ✅ — workflow etablerad |
| 8 | Får bryta E2E-tester (bottom-nav-klick) | ✅ — fixa per sprint |

---

## Nästa sprint: H+G-2 — Typografi-systemisering (~1.5h)

### Mål

Applicera prototyp-typografin systematiskt:

- Fraunces *italic* på brand "Fritt" och frågande prompts
  ("Vad köpte du?", "Skapa faktura", etc.)
- Fraunces *regular* på page-headings (`<h1>`, `<h2>`)
- JetBrains Mono på alla numeriska kolumner i listor (verifikat-id,
  kontonummer, belopp, datum)
- Inter Tight body (redan default, ingen ändring)
- `<SectionLabel>`-primitive (UPPERCASE, tracking-wide, faint, 10px,
  weight-600) för section-rubriker som "PERIOD", "BOKFÖRING", "FÖRSÄLJNING"

### Konkreta åtgärder

1. **Skapa `<SectionLabel>`-komponent** i `src/renderer/components/ui/SectionLabel.tsx`:
   ```tsx
   <span className="section-label">{children}</span>
   ```
   Använder `.section-label` CSS-klass redan deklarerad i index.css.

2. **Sweepa `<h1>`/`<h2>` i renderer** — sätt `font-serif font-normal`
   där det är ren rubrik. Lista att kolla:
   - `PageHeader.tsx` title
   - `OnboardingWizard.tsx` "Fritt Bokföring"
   - Sheet-headers
   - Vardag-sub-pages (om de finns kvar — de tas bort i H+G-3)
   - `EntityListPage.tsx` title

3. **Sweepa numeriska kolumner** — lägg till `font-mono` (eller
   `tabular-nums`) där det visar:
   - Verifikat-id (V0034 etc.) — redan delvis
   - Kontonummer (4-siffriga) — `<AccountPicker>`, `<KontoCell>`
   - Belopp i listor (Netto, Moms, Totalt)
   - Datum-kolumner i tabeller

4. **Inför italic Fraunces för "Fritt"-brand**:
   - `Sidebar.tsx` company-name area (om brand visas där)
   - `AppShell.tsx` topbar (även om TopBar redesign sker i H+G-4)

5. **Regenerera visual baselines + granska**:
   ```
   npm run test:visual:update
   ```

### Filer som troligen rörs

- `src/renderer/components/ui/SectionLabel.tsx` (NY)
- `src/renderer/components/layout/PageHeader.tsx`
- `src/renderer/components/layout/Sidebar.tsx`
- `src/renderer/components/layout/EntityListPage.tsx`
- `src/renderer/pages/OnboardingWizard.tsx`
- Olika lista-radkomponenter (mono på belopp/datum/id)

### Risker

- Page-tester kan ha className-assertioner med `font-bold` etc. som
  ändras till `font-serif font-normal`. Sweepa tester efter migration.
- Existerande "Fraunces" usage via `font-display` kan kollidera med
  `font-serif` — Tailwind v4 kanske bara stödjer en av dem. Verifiera
  först. Om båda finns: föredra `font-serif` (standard Tailwind-namn).

### Definition of done

- `npm run test` (vitest) gröna
- `npm run test:visual` 5/5 (efter regeneration)
- Manuell verifiering: starta `npm run dev`, kolla:
  - "Fritt"-text någonstans har italic serif look
  - Sidebar-section-rubriker (HANTERA, REGISTER) har section-label-styling
  - Tabell-belopp visas i mono-typsnitt
- Commit-meddelande följer konventionen i `feat(design): Sprint H+G-2 — typografi-systemisering`

---

## Återstående sprintar (efter H+G-2)

### Fas 2 — Layout-foundation (5–6h)

**H+G-3: Vardag hero + BigButton (~2h)**
- Total redesign av `VardagApp.tsx` till hero-screen
- Ny primitive `<BigButton color label hint onClick />` (220×220)
- Vardag-content: dag · "God morgon, {namn}." · "Vad vill du göra idag?"
  · 3 BigButtons (Bokför kostnad / Skapa faktura / Stäng månad) ·
  status-pills · footer-kbd-hints
- Ta bort `VardagBottomNav.tsx`, `VardagPageInbox/Spend/Income/Status.tsx`
- Sheets för kostnad/faktura/månadsstängning — placeholder nu, fyller H+G-8

**H+G-4: TopBar med mode-pill (~1h)**
- Ny `<AppTopBar>`: italic "Fritt" 19px · pipe · bolagsnamn · "räkenskapsår
  2025 · november" · spacer · mode-pill med kbd-shortcut
- `⌘⇧B`-shortcut implementerad
- Mörk topbar i bokförare (token redan reserverat)
- Ljus topbar i vardag

**H+G-5: Bokförare 3-zone grid (~2-3h)**
- Refaktor `BokforareApp` till `grid grid-cols-[240px_1fr_360px]`
- `<ZoneVad>` (vänster, card-2 bg, scroll)
- `<ZoneNu>` (mitten, card bg, switchar innehåll efter view)
- `<ZoneCons>` (höger, off-bg, alltid synlig)
- `<NavGroup>` + uppdaterad `<NavItem>` med icon-prefix + count
- `<ZoneNuHead title sub />` primitive

### Fas 3 — Innehåll i zoner (4–6h)

**H+G-6: Verifikat-list i Nu-zonen (~1-2h)**
- Restyling av VerifikatList: grid-rows, mono id, status-dot, flash-anim
- Restyling av Inkorgen-vy
- ZoneNuHead-metadata

**H+G-7: Konsekvens-zonens 3 modes (~2h)**
- `<StatusNu>` — likvida + moms + hälsa-checks
- `<VerifikatLivePreview>` — debet/kredit med flash, balans-pill, didaktiska kommentarer
- `<VerifikatDetaljPaverkan>` — påverkan på balans + resultat
- `<CheckLine>`, `<StatusCard>`, `<StatusRow>`, `<PåverkanRow>` primitives

**H+G-8: Sheets (~1-2h)**
- Refaktor `BottomSheet.tsx` till prototyp-styling
- `<BokforKostnadSheet>` med ReceiptVisual + Field-grid + förslag-kontering
- `<SkapaFakturaSheet>` med kund-dropdown + radobjekt + sammanställning
- `<ReceiptVisual>`, `<Field>`, `<KonteringRow>` primitives

---

## Verifikationsritual per sprint

```bash
# Före commit:
npm run test                       # Vitest — alla renderer-tester
npm run typecheck                  # TS strict mode
npm run check:m133                 # A11y AST-check
npm run build                      # Vite build
npm run test:visual:update         # Regenerera baselines
# Granska bilder i tests/e2e/visual-regression.spec.ts-snapshots/
# Side-by-side mot prototyp-screenshot om relevant
git add -A
git commit -m "feat(design): Sprint H+G-N — ..."
```

---

## Kontextuella gotchas

### Native module ABI
- `npm run test:visual:update` rebuildar `better-sqlite3` + `better-sqlite3-multiple-ciphers` för Electron, sen tillbaka till Node-ABI efter
- Om vitest kraschar med `NODE_MODULE_VERSION`-fel: `npm rebuild better-sqlite3 better-sqlite3-multiple-ciphers`
- run-e2e.mjs hanterar detta automatiskt sedan tidigare commit i sessionen

### Visual regression baselines
- `.png`-filer committas i `tests/e2e/visual-regression.spec.ts-snapshots/`
- macOS-specifika (suffix `-darwin`)
- Linux-CI kräver Docker (mcr.microsoft.com/playwright) — separat infra-jobb
- Vid varje sprint: regenerera, granska visuellt, commita ändringar

### Auth-bypass i E2E
- `tests/e2e/visual-regression.spec.ts` använder `__authTestApi.createAndLoginUser`
- Mönstret kommer från `flows/backup-restore.spec.ts`, kräver `FRITT_TEST=1`
- Om visual-regression failar med "wizard not visible": auth-flow har ändrats

### Stryker-konfigs
- `stryker.conf.json` — kärnscope (main + shared + 2 renderer/lib pure)
- `stryker.renderer.conf.json` — hooks (JSDOM-config)
- `vitest.config.stryker.ts` + `vitest.config.stryker.renderer.ts` matchar
- Token-värden i mutationsscope kan påverkas — om Stryker körs efter H+G:
  förvänta lägre score eftersom prototyp-tokens har fler varianter

### Test som dokumenterar prototyp-semantik
- `tests/sprint-69-status-tokens.test.ts` — overdue → warning (ej danger)
- Om någon refaktor vill mappa overdue tillbaka till danger: bryts mot
  prototyp-design (warning = "förfallen", danger = "fel")

### M133 a11y-check
- AST-baserad: `scripts/check-m133-ast.mjs`
- Letar efter inline error-rendering utan `role="alert"`
- Vid sweep av token-färger: kan trigga false positive om man råkar
  ändra `text-danger-*` → `text-warning-*` på fält-error

---

## Filer att läsa innan ny sprint

I prioritetsordning:

1. [`docs/redesign-h-plus-g-plan.md`](redesign-h-plus-g-plan.md) — full plan
2. `~/Downloads/fritt-h-plus-g-prototyp-svartvit.html` — design-källa
3. `src/renderer/index.css` — nya tokens
4. `src/renderer/styles/tokens.ts` — TS-paritet
5. `tests/e2e/visual-regression.spec.ts` — verifieringsmönster
6. Specifik sprint-target i planen — "Konkreta åtgärder"-sektion

---

## När alla 8 sprintar är klara

- 5 visual baselines har genererats om 8 gånger (en per sprint)
- ~10-15 nya primitives i `src/renderer/components/ui/`
- ~3 stora layout-komponenter omskrivna (Vardag, Bokförare, TopBar)
- ~7-10 sheet-komponenter (BokforKostnad, SkapaFaktura, etc.)
- `MEMORY.md`-uppdatering: "Design helt matchad mot H+G-prototyp,
  Sprint H+G-1 till H+G-8 levererade"

Slutverifiering: starta appen och navigera mellan Vardag och Bokförare.
Ska kännas som prototypen, inte som tidigare modern SaaS app.
