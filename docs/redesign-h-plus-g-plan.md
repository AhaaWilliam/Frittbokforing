# Redesign: H + G prototyp (svartvit) → Fritt Bokföring

**Status:** Planeringsdokument · ej beslut
**Källa:** `~/Downloads/fritt-h-plus-g-prototyp-svartvit.html` (2418 rader interaktiv React-prototyp)
**Mål:** Helt matcha prototypens visuella + spatiala design

---

## 1. Executive summary

### Gap

Vi har ett **funktionellt komplett** design-system (S56–S94) men byggt på *modern SaaS app*-estetik. Prototypen specificerar en *stilla papper-arbete*-estetik. Skillnaderna är inte detaljer — de är fundamentalt olika visuella system:

| Lager | Vi har | Prototypen vill |
|---|---|---|
| Bakgrund | Pure white `#ffffff` | Warm off-white `#f1f0ee` (papperston) |
| Brand-färg | Tech-blå `#3b6cdb` | Dusty teal `#7a9498` |
| Sekundär accent | (saknas) | Sage green `#94a58c` |
| Varning | Standard amber | Dusty terracotta `#b08568` |
| Typografi | Inter Tight body, Fraunces deklarerad men oanvänd | Fraunces *italic* för brand + headings + frågor; mono för tal/kontonummer |
| Vardag-layout | Bottom-nav-app (4 pages) | Hero-screen "God morgon, William." + 3 BigButtons |
| Bokförare-layout | Sidebar + main | 3-zone-grid: `Vad (240) │ Nu │ Cons (360)` |
| Konsekvens-pane | Endast på invoices | Global zone som speglar arbete realtid |
| Verifikat-list | Tabell-tung | Glesare rad-baserad lista med status-dots |

### Storlek

**Total beräknad effort: 12–18 timmar** över **3 faser** + **8 sprintar**.

Detta är inte en /loop-iteration. Det är ett genuint redesign-projekt som behöver multi-session-arbete med granskning emellan.

### Vad vi inte rör

Ingen affärslogik. Ingen IPC. Inga services. Inga tester av typ `system/*`, `gap-*`, `session-*`. Detta är purt visuellt + layout — `src/renderer/**` förändras, allt annat står still.

---

## 2. Token-audit (Layer 1)

### 2.1 Färgtokens — komplett swap

| Token | Nuvarande | Prototyp | Anteckning |
|---|---|---|---|
| `--color-bg` (ny) | `#ffffff` (background) | `#f1f0ee` | App-bakgrund — papperston |
| `--color-card` | `#ffffff` | `#fbfaf8` | Kort, formulär — varmare än bg |
| `--color-card-2` (ny) | `#f4f4f5` (muted) | `#e7e6e2` | Sekundär yta — sidofält, nav-bg |
| `--color-border` | `#e4e4e7` | `#d6d4cf` | |
| `--color-border-strong` (ny) | (saknas) | `#a8a6a0` | För prominent border |
| `--color-text` | `#09090b` | `#1a1a18` | Primärtext — inte rent svart |
| `--color-muted-foreground` | `#71717a` | `#56544f` | Sekundärtext |
| `--color-faint` (ny) | (saknas) | `#8d8b85` | Tertiärtext, kbd, hints |
| `--color-brand-500` | `#3b6cdb` | `#7a9498` | Dusty teal |
| `--color-brand-soft` (ny) | (`brand-50` `#eef4ff`) | `#dde3e3` | Plommon-soft — selected-state |
| `--color-mint-500` (ny) | (saknas) | `#94a58c` | Sage green — sekundär accent |
| `--color-mint-soft` (ny) | (saknas) | `#e1e4dc` | |
| `--color-dark` (ny) | (saknas) | `#1d1c1a` | Mörk yta — bokförare-topbar |
| `--color-dark-soft` (ny) | (saknas) | `#2b2a27` | Border på mörk yta |
| `--color-warning-500` | `#d97706` (amber) | `#b08568` (terracotta) | Mjukare varning |
| `--color-success-500` | `#16a34a` | (alias för mint) | Mappa success → mint |
| `--color-danger-500` | `#dc2626` | `#b08568`? | Prototypen har bara `warning` — danger måste vi behålla men matcha tonen |
| `--color-info-500` | `#0284c7` | (alias för plommon-soft) | |

**Beslut som behövs:**
- Prototypen har INTE en separat `danger`-palett. Allt "fel" är `warning` (terracotta). Behåller vi vår `danger` (för CHECK-fel, valideringsfel) eller alias:ar mot warning?
- Vi har `info` (blå, för callouts). Prototypen har inte motsvarighet. Mappa till `mint-soft`?

### 2.2 Typografi — fontuse

Vi har redan `Fraunces` + `Inter Tight` + `JetBrains Mono` deklarerade i `index.css`. **Använder dem nästan inte i komponenterna.** Prototypen använder dem konsekvent:

| Användning | Prototyp | Vad vi gör nu |
|---|---|---|
| Brand "Fritt" | `font-family: Fraunces; font-style: italic; font-size: 22px` | `font-display` token (Fraunces) — men inte italic |
| Page headings (`h1`, `h2`) | Fraunces, **inte italic**, weight 400 | `font-display` används sporadiskt |
| Question-prompts ("Vad köpte du?") | Fraunces *italic* | (saknas) |
| Sheet-titlar | Fraunces *italic* | (saknas) |
| Body | Inter Tight | Inter Tight ✓ |
| Tabulär numerisk (kontonummer, belopp, datum) | JetBrains Mono | Använder ej `tabular-nums` konsekvent |
| kbd-chips | JetBrains Mono | (saknas) |
| Section labels (UPPERCASE: "Period", "Bokföring") | Inter Tight, 10px, letter-spacing 0.12em | (inkonsistent) |

**Beslut:**
- Inför `.serif` + `.serif-italic` utility-klasser eller Tailwind `font-serif italic`
- Inför `.mono` på alla numeriska kolumner systematiskt
- Standardisera "section label" som ny primitive `<SectionLabel>` (uppercase, tracking-wide, faint)

### 2.3 Spacing + density

Prototypen är **glesare** än vad vi byggt:
- Card padding: `14px 16px` (vs `16-24px` hos oss)
- Vardag: `padding: 40px 60px 0`, gap-22 mellan BigButtons
- Verifikat-list rader: `padding: 10px 22px` (jämfört med våra `px-4 py-3`)
- Border-radius: 3-6px (vi använder 6-8px) — mer fyrkantig estetik

**Beslut:** Spacing-tokens är OK som de är (`space-*` följer 4px-grid). Vi sänker bara radius systematiskt till 4-6px och låter padding följa prototypen per komponent.

---

## 3. Layout-audit (Layer 2)

### 3.1 Vardag-läget — total redesign

**Vi har:** 4 pages (Inbox / Spend / Income / Status) med bottom-nav.

**Prototypen har:** 1 hero-screen som primär entry. Ingen bottom-nav.

```
┌─────────────────────────────────────────────────────┐
│  Fritt | Acme Konsult AB | räkenskapsår 2025 · nov  │   <- TopBar (samma)
├─────────────────────────────────────────────────────┤
│                                                     │
│              torsdag 30 april (italic)              │
│                                                     │
│            God morgon, William. (h1)                │
│                                                     │
│           Vad vill du göra idag? (italic)           │
│                                                     │
│        ┌────┐  ┌────┐  ┌────┐                       │
│        │ ●  │  │ ●  │  │ ●  │                       │
│        │    │  │    │  │    │   (220×220 BigButtons)│
│        │Bok │  │Skap│  │Stän│                       │
│        │för │  │a   │  │g   │                       │
│        │kost│  │fakt│  │mån │                       │
│        │nad │  │ura │  │ad  │                       │
│        │  →│  │  →│  │  →│                       │
│        └────┘  └────┘  └────┘                       │
│                                                     │
│   ● 2 obokförda · ● senast V0034 · ● moms 15 dgr    │
│                                                     │
│                                                     │
│      ⌘K sök allt   ⌘⇧B Bokförare-läget   ? hjälp    │
└─────────────────────────────────────────────────────┘
```

**Kostnad/faktura/månadsstängning öppnas som Sheet (overlay från botten).**

**Vardag-existerande pages:**
- `VardagPageInbox.tsx` — överdue-fakturor visas redan ✓ men i fel layout
- `VardagPageSpend.tsx` — direkt CTA till bokförar-form (S80)
- `VardagPageIncome.tsx` — senaste fakturor + CTA
- `VardagPageStatus.tsx` — KPI-kort
- `VardagBottomNav.tsx` — försvinner

**Beslut:** Behåller vi de 4 sub-pages som routebar djupgrupp för power users (`/v/inbox` etc.) eller försvinner de? Prototypen har dem inte. **Förslag:** Ta bort bottom-nav och sub-pages, gör Vardag till en hero-screen + sheet-driven flöden.

### 3.2 Bokförare-läget — 3-zone grid

**Vi har:** `Sidebar (180px) | main (flex-1)`.

**Prototypen har:** `Vad (240) | Nu (flex-1) | Cons (360)`.

```
┌────────┬─────────────────────────┬─────────────────┐
│ VAD    │ NU                      │ KONSEKVENS      │
│        │                         │                 │
│ Period │ Verifikat — november    │ Likvida medel   │
│ ▣ Nov  │ 7 verifikat · 1 utkast  │ Bank · 1930     │
│ ▢ Okt  │                         │ Kassa · 1910    │
│        │ V0034  Lekmer AB · IT.. │                 │
│ Bokf.  │ V0033  Folksam ····    ●│ Moms inn. per.  │
│ ≡ Ver  │ V0032  Lön nov ······· ▲│ Utgående 71250  │
│ ⤴ Inb  │ V0031  Faktura 014 ···  │ Att betala 5844 │
│ ⊞ Ktp  │ V0030  Räntekostnad ··  │                 │
│ ◐ Utk  │ V0029  Hyra · Vasakr ·  │ Hälsa           │
│        │ V0028  Faktura 013 ···  │ ✓ Bank stämmer  │
│ Förs.  │                         │ ✓ Inga obal.    │
│ ⊟ Fak  │                         │ ▲ 1 utkast      │
│ ○ Kun  │                         │ ✓ Okt låst      │
│        │                         │                 │
│ Avsl.  │                         │ Konsekvens-zon  │
│ ▤ Res  │                         │ är aldrig tom.  │
│ ▥ Bal  │                         │                 │
│ ⊕ Stä  │                         │                 │
└────────┴─────────────────────────┴─────────────────┘
```

**Vad som händer i Cons-zonen:**

| App-state | Cons visar |
|---|---|
| Default (browse verifikat) | "Status nu" — likvida, moms, hälsa |
| Klickad verifikat (detalj) | "Påverkan på V0034" — balans-effekt, resultat-effekt, period-info |
| Aktiv form (bokför kostnad) | Live verifikat-utkast med flash-animation, debet/kredit, balans-check, didaktiska kommentarer |
| Aktiv form (skapa faktura) | Sammanställning + kontering + förklaring "När fakturan skickas skapas Vxxxx automatiskt..." |

Vi har redan en `ConsequencePane.tsx` för invoices. Den måste expanderas till en global zon med flera "modes": status-nu / detalj-paverkan / live-preview.

### 3.3 TopBar — utbyggd

**Prototypen har:**
- "Fritt" italic Fraunces 19px
- Pipe-divider
- Bolagsnamn (medium weight)
- "· räkenskapsår 2025 · november" (faint, mono-känsla)
- Mode-toggle pill med dot-indikator + kbd "⌘⇧B" på höger sida

**Vi har:**
- Bolagsswitcher (höger)
- YearPicker
- Ingen mode-toggle i topbar (sker via setMode())

### 3.4 Sheets

**Prototypen:**
- Bottom-anchored, 88% width, max 920px
- Dimmed overlay `rgba(30,30,28,.32)` + backdrop-blur
- `border-radius: 10px 10px 0 0`
- Animation: `sheetUp` 0.35s cubic-bezier
- Header: italic Fraunces title + close × top-right

**Vi har:**
- `BottomSheet.tsx` — använder Radix Dialog men styling är annorlunda

---

## 4. Component-mapping (Layer 3)

| Prototyp-komponent | Vår motsvarighet | Aktion |
|---|---|---|
| `<TopBar mode={} />` | `<AppShell>`-headern | Ny `<AppTopBar>` med mode-pill + kbd |
| `<BigButton color label hint onClick />` | (saknas) | Ny primitive |
| `<NavGroup title>{NavItem...}</NavGroup>` | `<Sidebar>` har grupper | Refaktor till `<NavGroup>` + `<NavItem>` med icon, count, highlight |
| `<NavItem icon label count active />` | `NavItem.tsx` finns | Uppdatera för icon-prefix, count-position, plommon-active-state |
| `<ZoneVad>` | (del av sidebar) | Ny container med card-2 background + scrolling |
| `<ZoneNu>` | `<main>` content | Ny container — switchar innehåll efter `bokforareView` |
| `<ZoneCons>` | `ConsequencePane.tsx` (invoices only) | Expandera till global zon med 3 sub-states |
| `<ZoneNuHead title sub />` | (saknas, ad-hoc-headers) | Ny primitive |
| `<VerifikatList>` | `JournalEntryList`? | Verifikat är delvis `manual-entries`. Konsolidera till en list-vy. |
| `<VerifikatLivePreview>` | `<JournalPreview>` finns men tunn | Expandera till full live-vy med flash-animation, balans-check, didaktiska kommentarer |
| `<StatusCard title>` + `<StatusRow>` | `<MetricCard>` | Olika — StatusCard är mer text-lista, MetricCard är hero-tal. Behåll båda. |
| `<CheckLine ok|warn>` | (saknas) | Ny primitive — used i Hälsa-sektionen |
| `<KontoPicker>` | `<AccountPicker>` exists | Kolla styling-paritet |
| `<ReceiptVisual>` | (saknas) | Ny primitive — visar mock-kvitto-bild i sheet |
| `<KonteringRow>` | (delvis, `JournalLineRow`) | Kolla styling |
| `<PåverkanRow>` | (saknas) | Ny — visar +/- belopp med mint/warning-färg |
| `<CommandPalette>` | `<CommandPalette>` finns | Restyling till plommon-soft selected-state, monospace hints |
| `<BokforKostnadSheet>` | (saknas) | Ny — overlay-sheet med ReceiptVisual + Field + KonteringRow |
| `<SkapaFakturaSheet>` | (saknas) | Ny — overlay-sheet med dropdown-kund + radobjekt + sammanställning |
| `<BokforKostnadForm>` | `<ExpenseForm>` finns | Restyling till FormRow-pattern + KontoPicker + ReadOnlyKonto |
| `<kbd>` chip | `KbdChip.tsx` finns | Kolla styling-paritet |
| Toast | sonner används | Kolla styling — prototypen har en custom toast |

---

## 5. Sprint-plan

### Fas 1 — Token-foundation (3–4h)

**Sprint H+G-1 — Token-palette swap**
- Uppdatera `index.css` `:root` med nya färgvärden
- Uppdatera `tokens.ts` parity
- Lägg till `mint`, `dark`, `card-2`, `border-strong`, `faint`, `brand-soft`
- Uppdatera `vardag-tokens` overrides om relevant
- Tailwind-tokens i `@theme` block
- **Test:** Visual regression replay — ALLA 5 baselines måste fortfarande passera (eftersom regenerering ska visa nytt utseende, inte att inget förändrats — så snapshots regenereras + granskas)
- **Risk:** mängder av komponent-tester använder `bg-primary`, `text-success-700` etc. — vi byter värdet bakom token, inte token-namnet. Tester ska fortfarande passera.

**Sprint H+G-2 — Typografi-systemisering**
- `.serif` + `.serif-italic` utility-klasser via Tailwind
- `.mono` använt på alla numeriska kolumner i listor (sweep)
- Ny primitive `<SectionLabel>` (uppercase, tracking-wide, faint, weight-600)
- Standardisera page-headings: alla `<h1>` ska vara `font-serif font-normal` (ej bold)

### Fas 2 — Layout-foundation (5–6h)

**Sprint H+G-3 — Vardag hero + BigButton**
- Ny primitive `<BigButton color label hint onClick />` (220×220, hover-lift, color-circle topp-vänster, arrow höger, hint-text)
- Total redesign av `VardagApp.tsx`:
  - Hero-vy (centrerad)
  - Dag + greeting + question
  - 3 BigButtons (Bokför kostnad / Skapa faktura / Stäng månad)
  - Status-pills bottom (obokförda, senast bokfört, momsperiod)
  - Footer-kbd-hints (⌘K sök · ⌘⇧B Bokförare · ? hjälp)
- Ta bort `VardagBottomNav.tsx` + 4 sub-pages
- Sheets för Bokför-kostnad / Skapa-faktura / Stäng-månad — placeholder-sheets nu, fyller i Fas 3

**Sprint H+G-4 — TopBar med mode-pill**
- Ny primitive `<AppTopBar>`:
  - Italic "Fritt" 19px
  - Pipe-divider
  - Bolagsnamn (sätt med 500-weight)
  - "· räkenskapsår 2025 · {periodLabel}" muted
  - flex-1 spacer
  - Mode-pill (round-full, dot-indicator, "Vardag" / "Bokförare", kbd "⌘⇧B")
- Implementera `⌘⇧B`-shortcut i `useKeyboardShortcuts`
- Bokförare-läget renderar TopBar med `dark` styling (svart bg, ljus text)

**Sprint H+G-5 — Bokförare 3-zone grid**
- Refaktor av `BokforareApp.tsx` till `grid grid-cols-[240px_1fr_360px]`
- Ny komponent `<ZoneVad>` (vänster nav, card-2-bakgrund)
- Ny komponent `<ZoneNu>` (mitten arbetsyta, card-bakgrund)
- Ny komponent `<ZoneCons>` (höger consequence-pane, off-bg)
- Befintlig `Sidebar.tsx` bryts ut → `<NavGroup>` + uppdaterad `<NavItem>` med icon-prefix, count-position, highlight för "Inkorgen"-typ
- `<ZoneNuHead title sub>` primitive
- Ad-hoc page-headers i 26 pages → systematisk användning av ZoneNuHead

### Fas 3 — Innehåll i zoner (4–6h)

**Sprint H+G-6 — Verifikat-list i Nu-zonen**
- Restyling av VerifikatList: `grid-cols-[70px_1fr_auto_auto]` rader, mono verifikat-id, status-dot (mint/warning), flash-animation på senast bokfört
- Restyling av Inkorgen-vyn: `grid-cols-[120px_1fr_auto_auto]` rader, mono datum, säljare + beskrivning, mono belopp, arrow
- ZoneNuHead på toppen med metadata "7 verifikat · 1 utkast · senast V0034"

**Sprint H+G-7 — Konsekvens-zonens 3 modes**
- Refaktor av `ConsequencePane.tsx` till generell `<ZoneCons>` med discriminated union state
- `<StatusNu>` primitive — likvida medel + moms + hälsa-checks
- `<VerifikatLivePreview>` — debet/kredit-rader med flash-animation, balans-pill, didaktiska kommentarer ("Varför två rader?")
- `<VerifikatDetaljPaverkan>` — påverkan på balans + resultat + period-info
- `<CheckLine ok|warn>` primitive
- `<StatusCard>` + `<StatusRow>` primitives

**Sprint H+G-8 — Sheets**
- Refaktor av `BottomSheet.tsx` till prototyp-styling (88% width, max 920px, border-radius top, sheetUp-animation)
- `<BokforKostnadSheet>` med ReceiptVisual + Field-grid + Förslag-kontering + actions
- `<SkapaFakturaSheet>` med kund-dropdown + radobjekt-form + sammanställning + kontering + actions
- `<ReceiptVisual>` primitive — dashed-border kvitto-look med mono-text
- `<Field label value tag />` primitive
- `<KonteringRow konto namn amount dk />` primitive

### Verifikation per fas

Efter varje sprint:
1. Vitest renderer-tester ska passera (bara visuella tokens ändras, ingen logik-ändring)
2. Visual regression — `npm run test:visual:update` regenererar baselines, granska side-by-side mot prototypen
3. Manuell dogfooding via `npm run dev` på minst Vardag + Bokförare-vy

---

## 6. Risker + öppna frågor

### Tekniska risker

1. **Visual regression baselines måste regenereras 8 gånger** (en per sprint). Granskning per gång — annars maskerar vi förändringar.
2. **Tester med className-assertion** (t.ex. `expect(btn.className).toContain('bg-primary')`) ska inte gå sönder eftersom token-värdet byts men namnet behålls. Men `bg-success-100` etc. ska peka på nya färger. Sweepa tester efter `expect.*toContain.*bg-`.
3. **Color-contrast-checks** (axe) — alla nya färgkombinationer måste ha WCAG AA contrast. Risk: dusty teal `#7a9498` mot vit text — kontroll behövs. Prototypen visar `#fafaf8` som primary-foreground.
4. **Vardag bottom-nav-borttagning** kan bryta E2E-tester som klickar nav-items. Audit av `tests/e2e/`.

### Produktrisker som kräver ditt beslut

1. **Vardag sub-pages**: ska de bort helt, eller behållas som routes som öppnas via command palette? Förslag: ta bort `VardagPageInbox.tsx` etc. — ersätt funktionerna med sheets.
2. **Mode-toggle position**: prototypen har den i app-topbar. Vi har den i settings. Förslag: båda — topbar primärt (visuell + kbd), settings för persistens.
3. **TopBar period-label** ("räkenskapsår 2025 · november"): vad är "november" i flerårig kontext? Senaste-aktiva-period? Förslag: senaste perioden där bokföring skett.
4. **Mörk topbar i bokförare**: prototypen har `dark` topbar i bokförare-läget. Estetiskt val. Behåller vi den eller låter samma topbar gälla i båda?
5. **Konsekvens-zonen i Vardag**: prototypen har den ENDAST i bokförare. Vardag är hero-screen. Vi har också det så — enkelt val.
6. **Färgval för danger**: prototypen har bara `warning` (terracotta). Vi har separat `danger`. Behåller vi danger för CHECK-fel/validering eller alias:ar? Förslag: behåll danger med en mer dämpad ton — `#9a4d4d` istället för `#dc2626`.

### Out-of-scope (separat redesign-vågar)

- Tabell-tunga listor (PageBankStatements, PageAccounts, PageAccountStatement) — prototypen har inte motsvarighet. Behåll nuvarande styling med token-uppdatering, ingen layout-ändring.
- Print-mode — vi har gjort det i S86. Prototypen har inte print. Behåll som det är.
- Reports — prototypen har en stiliserad ResultatrakningView. Vi kan inspirera men inte total redesign. Notera: prototypen har bara mock-data.

---

## 7. Beslutspunkter

Innan vi börjar:

| # | Fråga | Förslag |
|---|---|---|
| 1 | Vardag sub-pages bort? | Ja |
| 2 | Bottom-nav bort? | Ja |
| 3 | Mode-toggle i topbar? | Ja |
| 4 | Mörk topbar i bokförare? | Ja (matchar prototyp) |
| 5 | Danger-färg behåll? | Ja, dämpa till `#9a4d4d` |
| 6 | Vardag flerårsperiod-label? | "Senaste aktiva" |
| 7 | Visual regression policy: regenerera per sprint? | Ja, granska side-by-side |
| 8 | Får vi bryta E2E-tester (bottom-nav-klick)? | Ja, fixa per sprint |

---

## 8. Out-of-loop sprintar

Det här ÄR ett /loop-uppdrag. Men med stop-villkor (a) > 5h skulle hela jobbet brytas. **Förslag:** kör 1 sprint per /loop-iteration, stoppa loopen mellan, granska visual regression. Du kör `npm run test:visual:update` efter varje sprint och commitar baselines + jämför mot prototypen.

8 sprintar × ~1.5h/sprint + granskning = 12–18h totalt över 8–10 sessioner.

---

**Klart.** Granska planen, svara på beslutspunkterna 1–8, så börjar jag med Sprint H+G-1 (token-palette swap) i nästa /loop.
