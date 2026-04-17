# Sprint E — Backlog-cleanup (post-Sprint D)

**Datum:** 2026-04-17 (planerat)
**Tema:** Punktinsats på den samlade backloggen från Sprint A/C/D.
Delas in i tre tiers: **T1** (trivialt eller dokumentation-only,
direkt körbart), **T2** (scope-säkert — inga nya M-principer/
migrationer), **T3** (kräver ADR, UX-design eller schema-ändring —
eskaleras, INTE implementeras i Sprint E).

Prompten är avsiktligt **gated**: T3-items körs inte i Sprint E utan
dokumenteras som separata sprint-kandidater. Syftet är att städa
*allt som kan stängas utan domän-beslut* i en sprint, utan att dra
in driftsbuggar från tidigare sprintar halvvägs.

**Testbaslinje (verifierad 2026-04-17 post-Sprint D):**
- **2475 vitest** (246 testfiler)
- **41 Playwright-specfiler, 66 `test()`-kallor** — full E2E 66p/0f
- **PRAGMA user_version: 41**
- **HashRouter** — alla URL:er är `#/path?params`
  (se [src/renderer/lib/router.tsx](src/renderer/lib/router.tsx))

---

## Scope-risk (läs först)

Backloggen är heterogen. T1+T2 kan absolut stängas i en sprint utan
eskalering. T3 ska **inte** implementeras i Sprint E — de kräver
antingen ADR, UX-design eller schema-ändringar som ligger utanför
cleanup-sprint.

**Förväntad utfallskurva:**

| Scenario | Utfall | Sprint E-arbete |
|---|---|---|
| Best-case | T1 + T2.a stängs, T2.b/T2.c skippas enligt pre-flight, T3 dokumenteras | 3–4 SP |
| Realistiskt | T1.a dokumenteras, T2.a stängs, T3 dokumenteras | 2–3 SP |
| Sämsta-case | T1.a dokumenteras, T2.a visar dold domänkoppling → T3, inget annat | 1–2 SP |

Om en T2-item under implementation visar sig kräva ny M-princip,
migration, ny IPC-kanal, ny ErrorCode eller publik-yta-utvidgning →
**STOPPA**, flytta till T3-listan i sprint-summary, fortsätt med
nästa. **Utvidga aldrig scope ad hoc.**

---

## Bakgrund

Backloggen är sammansatt från:
- `docs/sprint-d-summary.md` § Backlog (latent IpcResult-fix —
  nu dokumenteras som WONTFIX)
- `docs/sprint-c-summary.md` § Backlog (filter/sort-URL, precis
  RQ-invalidation, F62-e)
- `memory/project_sprint_state.md` § Backlog (batch-unmatch, F49-c,
  camt.054/MT940/BGC, konfigurerbara BkTxCd-mappningar)

Inget av dessa är kritiskt för produktion idag — men de utgör teknisk
skuld och UX-gap som gradvis samlas.

---

## Tier 1 — Trivialt / dokumentation-only (~10–20 min per item)

### T1.a — Dokumentera `bank-statement-service.ts:219` som WONTFIX

**Kontext:** Sprint D F7f fixade yttre catch i `bank-match-service.ts`
som returnerade raw `{code, error}`-objekt `as IpcResult<...>` utan
`success`-fält — en subtil bugg där `wrapIpcHandler.isIpcResult`
wrappade felet som success-data.
[bank-statement-service.ts:219](src/main/services/bank/bank-statement-service.ts:219)
har kod-mönstret men är **oreachable i produktion**:
`importBankStatement` fångar alla inre fel som kompletta
`IpcResult`-objekt (line 97–159), och parserns `Camt053ParseError`
fångas utanför transaktionen (line 96). Ingen callpath kan lämna
transaktionen med ett bart `{code, error}`-objekt.

Sprint D-summary skrev redan explicit: *"Kan fixas för typ-säkerhet
men har ingen observerbar effekt. Ej scope för Sprint D."*

**Beslut:** Stäng som **WONTFIX** i Sprint E-summary. Anledningen att
inte fixa även för typ-säkerhet är att:

1. Det lägger till en kodvariant ("säker wrapping") som inte har
   någon observerbar effekt
2. En framtida förändring som gör callpathen reachable skulle kräva
   både kodändring OCH ny test — så "fixa i förväg" sparar ingen tid
3. Defense-in-depth utan test ger falskt förtroende

**Åtgärd:** Lägg in kommentar i koden som gör den latenta statusen
explicit:

```ts
// Latent: importBankStatement returnerar alla inre fel som kompletta
// IpcResult från sin transaction, så denna gren är oreachable idag.
// Om en framtida callpath börjar kasta strukturerat {code,error} från
// transactionen, applicera F7f-paritet (se bank-match-service.ts) +
// lägg till regressionstest.
if (err && typeof err === 'object' && 'code' in err) {
  return err as IpcResult<ImportBankStatementResult>
}
```

**Preventiv audit (engångs, inte check:-gate):**

```bash
grep -n "return err as IpcResult" src/main/services --include="*.ts" -r
```

Ska returnera 0 träffar (efter F7f + T1.a). Om fler träffar hittas →
behandla som ny Sprint E-post eller T3 beroende på omfattning.
**Kör en gång, dokumentera resultat i sprint-summary, skapa inte
ett nytt `check:`-script** — det är en engångskontroll, inte en
pågående invariant.

**Test:** ingen. WONTFIX betyder att beteendet är observerat och
avsiktligt lämnat.

---

## Tier 2 — Scope-säkert (~1–3 h per item)

### T2.a — Filter-state i URL (InvoiceList + ExpenseList)

**Kontext:** Sprint C B1 lade till URL-state för pagination via
`usePageParam`-hook (`?invoices_page=2` etc). `statusFilter` i
[InvoiceList.tsx:54](src/renderer/components/invoices/InvoiceList.tsx:54)
och [ExpenseList.tsx:54](src/renderer/components/expenses/ExpenseList.tsx:54)
är fortsatt lokalt state, vilket omöjliggör deep-link och bryter
back-button-beteende.

#### Design — hook

Skapa `useFilterParam<T extends string>` i
`src/renderer/lib/use-filter-param.ts`:

```ts
export function useFilterParam<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue?: T,
): [T | undefined, (v: T | undefined) => void]
```

**Viktig validering:** `allowedValues` är obligatorisk parameter.
Hooken:

- Läser URL-värde synkront vid mount via `getHashParams().get(key)`
- Returnerar `defaultValue` (eller `undefined`) om URL-värdet inte
  finns i `allowedValues`
- Vid ogiltigt URL-värde: strippa param från URL via `setHashParams`
  (håller URL ren, bevarar andra params intakta)
- Skriver via `setHashParams` med `replaceState` (samma mönster som
  `usePageParam`), tar bort param vid `undefined`
- Lyssnar på `hashchange` för extern sync

#### Adoption

*InvoiceList* — **4 statusvärden** (definierade i `STATUS_FILTERS`,
[InvoiceList.tsx:30-40](src/renderer/components/invoices/InvoiceList.tsx:30)):

```ts
const INVOICE_STATUSES = ['draft', 'unpaid', 'paid', 'overdue'] as const
type InvoiceStatus = typeof INVOICE_STATUSES[number]
const [statusFilter, setStatusFilter] = useFilterParam<InvoiceStatus>(
  'invoices_status',
  INVOICE_STATUSES,
)
```

*ExpenseList* — **5 statusvärden** (notera `partial`, se
[ExpenseList.tsx:33-38](src/renderer/components/expenses/ExpenseList.tsx:33)):

```ts
const EXPENSE_STATUSES = ['draft', 'unpaid', 'partial', 'paid', 'overdue'] as const
type ExpenseStatus = typeof EXPENSE_STATUSES[number]
const [statusFilter, setStatusFilter] = useFilterParam<ExpenseStatus>(
  'expenses_status',
  EXPENSE_STATUSES,
)
```

#### Integration med `prevFilters`-ref (M103-adjacent)

Befintlig `prevFilters.current = { statusFilter, debouncedSearch }` i
[InvoiceList.tsx:89](src/renderer/components/invoices/InvoiceList.tsx:89)
och [ExpenseList.tsx:81](src/renderer/components/expenses/ExpenseList.tsx:81)
initialiseras med aktuella render-värden. När `useFilterParam` läser
URL synkront vid mount → `statusFilter` har sitt URL-värde vid första
render → `prevFilters.current.statusFilter` har samma värde → ingen
diff → ingen `setPage(0)`-trigger. **URL-init triggar alltså inte
page-reset.** Detta är samma garanti som B1 FY-effect-fixen bygger på.

Hook-testen ska verifiera det explicit (se "Tester" nedan) —
karakteriseringstest, inte refaktor.

#### URL-format (HashRouter)

- Base: `http://.../#/income`
- Med filter: `http://.../#/income?invoices_status=unpaid`
- Med filter + pagination:
  `http://.../#/income?invoices_status=unpaid&invoices_page=2`
- Ogiltigt: `http://.../#/income?invoices_status=xyz` → hook strippar
  `invoices_status` + förblir på default

#### E2E testid-policy (bodyguard-kritisk)

Ingen ny `data-testid` utanför whitelist i
[tests/e2e/README.md:38-55](tests/e2e/README.md:38). Använd
text-selector i E2E:

```ts
await page.getByRole('button', { name: 'Utkast' }).waitFor({ state: 'visible' })
```

Om framtida label-ändring bryter testet → uppdatera test + UI
tillsammans. Etikett-texter är stabila kontrakt i en svenskspråkig
app och ska inte abstraheras bakom testid:s utan anledning.

#### Tester

**Hook-tester** — `tests/use-filter-param.test.ts`, **minst 9**:

1. Default: returnerar `undefined` när ingen param i URL
2. Default med `defaultValue`: returnerar `defaultValue`
3. URL-init: returnerar värde från URL om i `allowedValues`
4. URL-init invalid: strippar param + returnerar default
5. `setFilter(v)`: uppdaterar URL + state
6. `setFilter(undefined)`: tar bort param från URL
7. Multi-param preserve: andra params (`invoices_page=3`) behålls vid
   filter-uppdatering
8. hashchange-sync: extern URL-ändring triggar state-uppdatering
9. Invalid URL-värde strippar bara målparam, inte andra params
   (regression-guard)

**Integration-tester** — minst 2 per lista:

*`tests/renderer/InvoiceList.integration.test.tsx`:*
- URL-init `?invoices_status=unpaid` → "Obetald"-knappen renderas
  med aktiv styling
- URL-init `?invoices_status=unpaid&invoices_page=3` → första render
  visar page-3-data och `setPage(0)` anropas INTE (assert via
  useIpcQuery-mock call-count eller current offset-värde)

*`tests/renderer/ExpenseList.integration.test.tsx`:*
- Motsvarande inklusive ett test för `partial`-värdet (unik för
  expense)

**E2E** — `tests/e2e/filter-url-state.spec.ts` (1 spec, 1 test):

- Starta app på `#/income?invoices_status=draft`
- Assert: "Utkast"-knappen är aktiv (textselector + class/aria-check)
- Klick "Alla"
- Assert: URL är `#/income` (ingen `invoices_status`-param)

#### Bodyguards specifika för T2.a

- Ingen ny data-testid (text-selector i E2E)
- Ingen Zod-export till `shared/` — `allowedValues`-arrays lever i
  komponentfilerna som const-tuples
- Ingen ändring i `useInvoiceList`/`useExpenses`-kontrakt — filter
  skickas som innan
- Ingen ändring i `usePageParam` — den är redan korrekt

### T2.b — Sort-state i URL (conditional skip)

**Pre-flight:**

```bash
grep -rE "sortBy|sortOrder|sort_by|sort_order|orderBy|sortKey|sortField" \
  src/renderer/components/invoices \
  src/renderer/components/expenses \
  --include="*.tsx"
```

(Bred pattern — täcker både camelCase och snake_case. Känt faktum:
backend stödjer `sort_by`/`sort_order` i `listExpenses`
([expense-service.ts:1099](src/main/services/expense-service.ts:1099))
men renderer-lagret exponerar det inte. Se
[hooks.ts:656](src/renderer/lib/hooks.ts:656) — `useExpenses` tar
`sort_by` som option men `ExpenseList` skickar ingenting.)

**Beslut:**

- **Om 0 träffar:** skip T2.b helt. Dokumentera i Sprint E-summary:
  *"T2.b skippad — UI-sort finns inte i InvoiceList/ExpenseList.
  Backend stödjer det; framtida UI-sort bör implementeras med
  URL-state från dag 1."*
- **Om träffar finns:** STOPPA. Scopet är större än en T2 — UI-sort
  kräver UX-design (vilka kolumner ska vara sorterbara? default-sort?
  indikator-design?). Flytta till **T3.f** som ny eskaleringspost.

### T2.c — F49-c keyboard-navigation (conditional skip)

**Pre-flight:**

```bash
grep -rn "F49-c\|keyboard-nav\|keyboard navigation" \
  docs/*.md \
  memory/ \
  CLAUDE.md 2>/dev/null
```

**Beslut:**

- **Om F49-c inte hittas med scope-definition:** skip T2.c.
  Dokumentera som **T3.g** ny eskaleringspost i Sprint E-summary:
  *"F49-c har namn i backlog men ingen scope-definition. Kräver
  UX-spec (vilken Tab-ordning? Enter-activation på listrader?
  Arrow-keys i tabell? Roving-tabindex?) innan implementation.
  Ingen fallback-scope i Sprint E."*
- **Om F49-c är definierat i en spec-fil:** följ scopet exakt.
  Ingen ad hoc-utvidgning. Om specen inkluderar roving-tabindex
  eller Arrow-key-navigation → STOPPA (ej T2), flytta till T3.

**Viktigt — ingen fallback-scope.** Historiskt har "keyboard a11y"
utvidgats från "Tab funkar" till "full roving-tabindex" inom samma
ticket — det är en pålitlig scope-creep-vektor. Gata på formell
scope-definition i dokument.

---

## Tier 3 — Eskalering krävs (INTE implementeras i Sprint E)

Varje T3-item dokumenteras i Sprint E-summary med (1) nuvarande
tillstånd, (2) vad som krävs för att få igång arbetet, (3) grov
tidsuppskattning. **Implementera inte** — målet är att få backlog-
posten från "ett namn i memory" till "en beslutad plan med tydlig
ägare av nästa steg".

### T3.a — F62-e: Edit av exekverad tillgång via korrigeringsverifikat

**Vad:** Efter en avskrivning har körts (≥1 schedule i status
`executed`) är `updateFixedAsset` pristine-guardad. För att ändra
nyttjandetid, restvärde eller anskaffningsvärde efter denna punkt
krävs ett korrigeringsverifikat (C-serie per M140) som justerar
acc.avskr-konto och omgenererar framtida schedules.

**Varför inte nu:** domän-design krävs — hur hanteras partiellt
körda schedules? Ska justeringen retroaktivt ändra balansen, eller
bara framtida perioder? Vad händer om tillgången redan disposal:ats?

**Eskaleringssteg:** ADR som definierar korrigerings-semantiken.
Konsultera revisor om juridisk praxis kring retroaktiv ändring av
avskrivningsbas i svensk bokföring.

**Grovt estimat:** 1–2 SP för ADR, 3–5 SP för implementation.
Totalt ~1 sprint.

### T3.b — Batch-unmatch (F66-e extension)

**Vad:** Sprint A / S58 F66-e lade till `unmatchBankTransaction` för
enskilda matchningar. Batch-payment-matchningar blockeras med
`BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` (M154). Att kunna ångra en
helbatch — eller en enskild rad inom en batch — är UX-lyft men
kräver design.

**Varför inte nu:** öppna frågor:
- Ångrar man HELA batchen eller enskilda rader? Om enskilda → hur
  hanteras bank-fee-verifikatet som är batch-level (M126)?
- Om hela → vad händer med pain.001-exporten som använde batchen?
- Ny ErrorCode eller utvidgning av `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`?
- Ny IPC-kanal `bank-statement:unmatch-batch` eller parametriserad
  `bank-statement:unmatch-transaction`?

**Eskaleringssteg:** UX-design + specifikation av båda scenarion.
Sannolikt en ny M-princip om hur bank-fee-verifikat förhåller sig
till partial batch-unmatch.

**Grovt estimat:** 0.5 SP UX + 2–3 SP implementation.
Totalt < 1 sprint.

### T3.c — Konfigurerbara BkTxCd-mappningar per bank

**Vad:** `bank-fee-classifier.ts` har hårdkodad whitelist
(`'CHRG'` → bank_fee, `'INTR'` → interest). Svenska banker använder
ibland bankspecifika subfamily-koder. För att stödja t.ex. SEB,
Handelsbanken, Swedbank med egna koder krävs en konfig-tabell eller
settings-JSON.

**M153-koppling är kritisk.** ADR måste tydliggöra om mappningarna
lagras i DB (auditbart, deterministiskt per tidpunkt) eller
settings-JSON (svårare att spåra över tid). **DB-tabell rekommenderas
för M153-compliance** — deterministisk scoring kräver att auto-klassi-
ficerarens konfig går att reproducera per historisk tidpunkt.

**Varför inte nu:** kräver produkt-beslut om vilka banker som ska
stödjas, UI för custom-mappningar, och troligen en ny
`bank_tx_code_mappings`-tabell med (iban_prefix, subfamily_code,
entity_type)-tupel. Påverkar M153.

**Eskaleringssteg:** Kartläggning av avvikande koder per svensk bank.
Sannolikt måste prod-data från test-kunder samlas först.

**Grovt estimat:** 1 SP kartläggning + 3–5 SP implementation.
Totalt ~1 sprint.

### T3.d — camt.054 / MT940 / BGC-retur-fil (H2 2026)

**Vad:** Nuvarande bankimport stödjer bara camt.053 (daglig kontout-
drag). camt.054 är transaktionsnivå-notifiering, MT940 är
SWIFT-format (legacy men fortfarande använt), och BGC-retur är
Bankgirot-specifikt format för inkommande betalningar.

**Varför inte nu:** memory anger H2 2026. Skälet är att camt.053
räcker för de flesta svenska företag, och de övriga formaten kräver
separat parser + mappning till `bank_transactions`-tabellen.

**Eskaleringssteg:** produktbeslut om prioritering. MT940 kan vara
kritiskt för större företag, BGC för de som tar emot kundgirobetalningar.

**Grovt estimat:** 2–3 SP per format. Totalt 6–9 SP över flera
sprintar.

### T3.e — Precis RQ-invalidation för depreciation-hooks

(Ny post — ersätter den tidigare T1.b som var felaktigt scopad.)

**Vad:** Fem hooks i [hooks.ts:1020-1058](src/renderer/lib/hooks.ts:1020)
använder `{ invalidateAll: true }`:

- `useCreateFixedAsset` (1020)
- `useUpdateFixedAsset` (1027)
- `useDisposeFixedAsset` (1034)
- `useDeleteFixedAsset` (1047)
- `useExecuteDepreciationPeriod` (1054)

Sprint C:s backlog refererade endast `useUpdateFixedAsset`. Precis
invalidation per hook är rätt princip men kräver ny query-key-struktur:

1. Nya keys i [query-keys.ts](src/renderer/lib/query-keys.ts):
   - `depreciationSchedule(assetId)` — per-asset schedule
   - `allDepreciationSchedules()` — för bulk-invalidering
   - Beslut: skapa `allJournalEntries()` eller förlita sig på
     `allDashboard()` + explicit `incomeStatement(fyId)`-invalidering?
     (Dashboard-summan + BR/RR kan behöva re-räknas efter schedule-
     exekvering.)

2. Per-hook invalidation-matris:
   - Create: `[allFixedAssets]`
   - Update: `[allFixedAssets, fixedAsset(id), allDepreciationSchedules]`
   - Execute: `[allFixedAssets, allDashboard, incomeStatement, balanceSheet]`
     (exekvering skapar JE + påverkar både RR och BR)
   - Dispose: `[allFixedAssets, fixedAsset(id), allDashboard, ...]`
   - Delete: `[allFixedAssets]`

3. Regression-tester:
   - Dashboard uppdateras efter execute
   - Detail-view uppdateras efter update
   - BR/RR uppdateras efter execute/dispose

**Varför inte nu:** Kräver designdokument för depreciation-query-key-
struktur. Cherry-picka en av fem hooks är inkonsistent, och en
tidigare promptversion refererade `queryKeys.allJournalEntries()` —
den keyen existerar inte i dag. Det är T3, inte T1.

**Eskaleringssteg:** 1 A4-sida designdokument (key-struktur +
invalidation-matris), sedan implementation i en sammanhållen PR.

**Grovt estimat:** 0.5 SP design + 1–1.5 SP implementation.
Totalt < 0.5 sprint.

### T3.f (conditional) — UI-sort för InvoiceList/ExpenseList

Skapas endast om T2.b:s pre-flight-grep hittar träffar (osannolikt
per verifiering 2026-04-17).

### T3.g (conditional) — F49-c keyboard-navigation scope-definition

Skapas endast om T2.c:s pre-flight inte hittar F49-c-definition i
docs/ eller memory/.

---

## Bodyguards (gäller T1 och T2)

- PRAGMA `user_version` stannar på **41** (ingen migration)
- Inga nya M-principer
- Inga nya IPC-kanaler utan eng-review
- Inga nya ErrorCodes utan eng-review
- Ingen publik yta-utvidgning i bank-service, invoice-service,
  expense-service, correction-service, depreciation-service
- Ingen ny data-testid utanför
  [tests/e2e/README.md:38-55](tests/e2e/README.md:38) whitelist
- Ingen ny ADR
- För T3: **implementera inte**, dokumentera endast
- All URL-manipulation via `getHashParams`/`setHashParams` i
  [router.tsx](src/renderer/lib/router.tsx) — ingen direkt
  `window.location.search`-åtkomst
- Ingen ändring i `useInvoiceList`/`useExpenses`/`useInvoice`-kontrakt
  — filter-params skickas som innan

Om en T2-item visar sig kräva något av ovan under implementation →
stoppa, flytta till T3, fortsätt med nästa.

---

## Acceptance

Grön build betyder:

1. `npm run check:m133 && npm run check:m133-ast && npm run check:m153`
   — alla OK
2. `npm run typecheck` — 0 fel
3. `npm run lint` — 0 fel (**ny i Sprint E jämfört med D**)
4. `npm test -- --run` — **minst 2475 tester** passerar (2475 baseline
   + eventuella nya från T2.a; realistiskt 2486–2490 vid full T2.a)
5. `npm run test:e2e` full suite: alla `test()`-kallor passerar
   (baseline 66/66; om T2.a lägger till en spec → 67/67)
6. `docs/sprint-e-summary.md` existerar med:
   - § Levererat (T1.a WONTFIX-motivering + T2-utfall)
   - § Skippat med motivering (T2.b/T2.c om pre-flight-skip)
   - § Eskalerat till T3 (T3.a–T3.e obligatoriska + T3.f/g conditional)
   - § Preventiv audit-resultat (grep på `return err as IpcResult`)
7. Ingen ändring i `src/main/migrations.ts`
8. `git status` clean efter commit

**Gated acceptance** (vid skip-scenarios): alla punkter gäller men
test-count/E2E-count justeras efter faktiskt utfall. Ingen sprint är
"färdig" utan explicit summary som förklarar varje skippad item.

---

## Deliverables

- **Kod:**
  - T1.a: uppdaterad kommentar i
    [bank-statement-service.ts:218](src/main/services/bank/bank-statement-service.ts:218)
  - T2.a: `src/renderer/lib/use-filter-param.ts` (ny), uppdaterade
    [InvoiceList.tsx](src/renderer/components/invoices/InvoiceList.tsx)
    och [ExpenseList.tsx](src/renderer/components/expenses/ExpenseList.tsx)
- **Tester:**
  - `tests/use-filter-param.test.ts` (≥9 tester)
  - `tests/renderer/InvoiceList.integration.test.tsx` (≥2 nya)
  - `tests/renderer/ExpenseList.integration.test.tsx` (≥2 nya,
    inkl. `partial`-värde)
  - `tests/e2e/filter-url-state.spec.ts` (1 test)
- **Docs:**
  - `docs/sprint-e-summary.md` med alla sektioner ovan
- **Memory:**
  - `project_sprint_state.md` uppdaterad: sprint-state, testbaseline
    (2475+N), E2E-count (41/66 → 42/67 om T2.a-spec), T3-backlog
- **STATUS.md:** Sprint E-sektion följer SD-formatet

**Ingen** av dessa deliverables ändrar migrations, schemas, IPC-ytor
eller publika servicekontrakt.

---

## Nyansering av sprint-status i memory

Memory-uppdatering beror på utfall:

| Utfall | Sprint-state-rad |
|---|---|
| T1.a + T2.a levererat, T2.b/T2.c skippade per pre-flight, T3 dokumenterat | "Sprint E KLAR" |
| T1.a WONTFIX, T2.a stängd, T2.b/T2.c skippade, T3 dokumenterat | "Sprint E KLAR — cleanup + T3-dokumentation" |
| T1.a WONTFIX, T2.a visade domänkoppling → eskalerad | "Sprint E DELVIS — T2.a → T3, övriga T3 dokumenterade" |

Alla tre är acceptabla utfall. "DELVIS" är inte ett misslyckande —
det är korrekt reaktion på att bodyguard-tröskeln träffades.

---

## Tidsuppskattning

- T1.a dokumentation: 0.25 SP (~15 min — kommentar + summary-post)
- T2.a filter-URL: 2–2.5 SP (hook + 2 komponenter + 13+ tester + 1 E2E)
- T2.b sort-URL: 0 SP (skip enligt pre-flight) eller eskalerad till T3.f
- T2.c keyboard-nav: 0 SP (skip enligt pre-flight) eller eskalerad till T3.g
- T3 dokumentation: 0.5 SP (5 obligatoriska + 0–2 conditional poster)
- Summary + commit + memory: 0.5 SP

**Total best-case:** 3–4 SP.
**Realistiskt:** 2.5–3 SP (T2.b/T2.c skippade, T2.a smidig).
**Sämsta-case:** 1–1.5 SP (T2.a upptäcker domänkoppling tidigt).

---

## Exit-kriterium för framtida Sprint F

Efter Sprint E ska backloggen vara:

- **T1:** stängda (WONTFIX-dokumentation räknas som stängd)
- **T2:** stängda eller dokumenterat skippade med motivering
- **T3:** dokumenterade som egna sprint-kandidater med nästa-steg-
  ägare (ADR-krav, UX-spec-krav, produktbeslut). Ingen implementeras
  i Sprint E.

Sprint F planeras därefter utifrån T3-prioritering. Rekommenderad
ordning:

1. **T3.e depreciation-invalidation** (minst riskfylld, ren
   tech-debt-städ, estimerad < 0.5 sprint)
2. **T3.b batch-unmatch** (UX-design krävs men ingen schema-ändring)
3. **T3.a F62-e** (revisor-samråd krävs)
4. **T3.c/T3.d** som H2 2026-kandidater
