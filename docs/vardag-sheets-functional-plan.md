# Vardag Sheets — funktionell integration: analys & plan

**Status per 2026-05-01:** `BokforKostnadSheet` och `SkapaFakturaSheet` är
visuella prototyper sedan H+G-8 (commit 7bebeb5). Alla input-fält saknar
`onChange`, knapparna är hårdkodade `disabled`. Block 2 i
[redesign-h-plus-g-handoff-v2.md](redesign-h-plus-g-handoff-v2.md).

---

## Del 1 — Utförlig analys

### 1.1 Vad sheets gör idag

`src/renderer/modes/vardag/VardagApp.tsx`:226–328

- **BokforKostnadSheet** (200×3:4 ReceiptVisual + 4 fält + förslag-tabell + Bokför)
- **SkapaFakturaSheet** (kund + datum + 4-kolumns rader-tabell + Skicka)
- **ReceiptVisual:** dashed-border placeholder med 🧾-emoji och "Dra in kvitto"-text
- Inga state-hooks utöver `setSheet` (open/close)
- Inga IPC-anrop, ingen valideringa, inga felmeddelanden
- Knapparna har `disabled`-attribut + `opacity-50` className

### 1.2 Vad bokförare-läget redan har (referens-implementation)

`src/renderer/components/expenses/ExpenseForm.tsx` (602 rader) är
"sanningsenlig" expense-create-yta. Använder:

- **`useEntityForm`** med `ExpenseFormStateSchema` + `ExpenseSavePayloadSchema`
- **`SupplierPicker`** (combobox med skapa-ny-funktion via `useCounterparties`)
- **Per-rad fält:** beskrivning, antal (heltal), à-pris (kr), konto (4-siffrig BAS),
  momskod (vat_code_id) → multi-line tabell
- **VAT-koder** via `useVatCodes('incoming')` → moms-rate + 2640 vat_account
- **`useAccounts(fiscalRule, 4 | 5 | 6)`** för konto-pickern (klass 4–6 = kostnader)
- **`ConsequencePane`** med live-preview från `preview:journal-lines`-IPC
- **`useSaveExpenseDraft`** → POST `expense:save-draft` → IPC-handler kör Zod-
  validering, `loadVatCodeMap`, `processLines`, INSERT i transaction
- **`finalizeExpense`** kör draft → bokförd: kollar period, skapar
  journal_entry (B-serien) med D 4xxx + D 2640 (moms) / K 2440 (lev-skuld),
  M142 chronology-check
- Tester: 12 tester i `ExpenseForm.test.tsx` + 12 i `ExpenseListRow.test.tsx`

`SaveExpenseDraftSchema` (src/shared/ipc-schemas.ts) kräver minimum:
- `fiscal_year_id`, `counterparty_id`, `expense_date` (ISO),
  `description` (min 1), `lines: [{ description, account_number,
  quantity, unit_price_ore, vat_code_id }]` med `min(1)`

### 1.3 Vad som är annorlunda i sheet-flödet jämfört med bokförare-formuläret

H+G-prototypens UX-vision: **en faktura = en rad**. Användaren matar in
*ett* totalbelopp inkl. moms och får ett *ett-rads* förslag på kontering.
Inte multi-line-tabell. Det betyder:

- Sheet inte = ExpenseForm med annan layout
- Sheet = "snabb-bokföring för enkla fall" → multi-line-fall hänvisas till
  bokförare-läget (CTA "Behöver dela upp på flera konton?")
- 99% av småföretagares vardag är 1 rad: 1 totalbelopp → 1 kostnadskonto + moms

### 1.4 De 4 produktbesluten — avgränsade

#### Beslut A — OCR-pipeline

| Alternativ | Effort | Pro | Con |
|---|---|---|---|
| **A1: Ingen OCR** (manuell inmatning) | 0 dagar | Enkelt, deterministiskt, fungerar idag | Ingen tidsbesparing över bokförare-läget |
| **A2: Tesseract.js lokalt** | 2–3 dagar | All data lokalt (M-arkitektur), gratis | 30MB+ lib, ~5–15s scan-tid, kvalitet 60–80% på svenska kvitton |
| **A3: Cloud-OCR (Mindee, AWS Textract, Anthropic vision)** | 1 dag | Kvalitet 90%+, snabb | Bryter "all data lokalt"-principen, kostar pengar, kräver API-nyckel-hantering |
| **A4: Drag-zon → spara fil + manuell inmatning** | 0.5 dag | Användaren ser kvittot bredvid medan hon fyller i | Ingen extraktion av belopp/datum |

**Rekommendation:** A4 (visa fil + manuell inmatning) som första leverans.
Lämnar A2/A3 som framtida iteration när vi vet om OCR är värt det. A1 är
att inte bygga något alls.

#### Beslut B — Kontering-förslagsalgo

`counterparties` har redan `default_expense_account TEXT` (sedan migration 1).
Inget annat finns på backend.

| Alternativ | Effort | Pro | Con |
|---|---|---|---|
| **B1: Manuell konto-välj via dropdown** (kopiera SupplierPicker-pattern) | 0.5 dag | Användaren har full kontroll | Ingen vardag-snabbhet |
| **B2: `default_expense_account` per leverantör + fallback** | 1 dag | Använder befintligt fält, lär sig per leverantör | Kräver att användaren manuellt sätter default på leverantör först |
| **B3: B2 + auto-spara senast valt konto per leverantör** | 1.5 dag | Lär sig automatiskt vid första bokföring | Kan bli fel om användaren bokar på fel konto en gång — kräver "lås in"-mekanism |
| **B4: Heuristik på fritext-beskrivning** ("hyra" → 5010, "kontorsmaterial" → 6110, etc.) | 2 dagar | Funkar utan historik | Brittle, behöver ord-lista per språk |
| **B5: ML på lokal historik** (last-N expenses → frequency-rank per supplier) | 3 dagar | Förbättras över tid | Kallt-start-problem, kräver tester |

**Rekommendation:** **B3** (`default_expense_account` med auto-update).
Snabb implementation, använder befintligt fält, blir bättre över tid.
Moms-kod (`vat_code_id`) auto-mappas från IP1 (25%) som default — sätts om
till IP2/IP3 manuellt vid sällsynta fall.

#### Beslut C — IPC-kontrakt

Återanvänd `expense:save-draft` + `expense:finalize`. **Ingen ny IPC behövs.**
Sheet bygger en `SaveExpenseDraftPayload` med exakt en rad och POST:ar samma
endpoint som bokförare-formuläret.

Skäl: M100 (strukturerade fel) + M144 (Zod-schema) gäller redan; nya endpoint
skulle duplicera den här ytan utan vinst.

**Två-stegs flöde:** Sheet → "Bokför" gör draft + auto-finalize i sekvens
(två IPC-anrop). Användaren ser ingen "draft"-fas — det blir bokfört direkt.
Avbryts om finalize failar (period stängd, balans-fel) → toast med fel,
draft kvarstår synlig i `/expenses` för manuell åtgärd.

**Alternativ:** Ny dedikerad `expense:quick-create`-IPC som gör båda i en
transaction. **Avvisat** — komplicerar API-ytan utan nytta. Den dubbla
IPC:n är acceptabel UX (~50ms total i produktion).

#### Beslut D — Kvitto-bilaga

Ingen `expense_attachments`-tabell finns. Tre alternativ:

| Alternativ | Effort | Pro | Con |
|---|---|---|---|
| **D1: Ingen bilaga, bara visning under sheet-session** | 0 dagar | Snabbt | Bryter BFL 7 kap (arkivering 7 år) |
| **D2: Spara fil till `~/Documents/Fritt Bokföring/receipts/<expense_id>/<filename>`** + kolumn `expenses.receipt_path TEXT` | 1.5 dagar | BFL-kompatibelt, enkelt schema | Kräver migration + backup-strategi (filer ligger utanför DB) |
| **D3: BLOB i ny `expense_attachments`-tabell** | 2 dagar | Allt i DB → enkel backup | DB blåses upp (10MB/kvitto × 1000 kvitton/år = 10GB) |
| **D4: Lokal fil-store + `attachment_hash`-ref + dedupe** | 3 dagar | Skalbar, dedupe på samma kvitto uppladdat två gånger | Komplex, overkill för småbolag |

**Rekommendation:** **D2** (filsystem + path-kolumn). BFL-kompatibel,
backup hanteras av befintlig backup-tjänst (utvidgas att kopiera receipts/-
mappen). Fil-upload via Electron `dialog.showOpenDialog` (befintligt mönster
i `getE2EFilePath`).

### 1.5 Sammanfattning av rekommenderade beslut

- **A4** Drag-zon visar fil, manuell inmatning av belopp/datum (ingen OCR)
- **B3** `default_expense_account` på leverantör + auto-update vid bokföring
- **C** Återanvänd `expense:save-draft` + `expense:finalize` (ingen ny IPC)
- **D2** Receipt-fil i `~/Documents/Fritt Bokföring/receipts/<expense_id>/`
  med `expenses.receipt_path TEXT`-kolumn

**Totalt arbete med dessa beslut: ~5–7h kostnad-sheet, ~4–5h faktura-sheet,
~2h tester + dokumentation = ~12–14h.**

---

## Del 2 — Utförlig genomförande-plan

### Sprint VS-1 — Schema + IPC-kontrakt (~1.5h)

**Mål:** Backend kan ta emot kvitto-fil och uppdatera `default_expense_account`.

**Migration N+1:** Lägg till kolumn på `expenses`:
```sql
ALTER TABLE expenses ADD COLUMN receipt_path TEXT DEFAULT NULL;
```
Note: ADD COLUMN-konstanter per M127 (DEFAULT NULL är konstant, OK).

**Receipt-storage helper:** Ny fil `src/main/services/receipt-storage.ts`:
```ts
export function saveReceiptFile(
  expenseId: number,
  sourceFilePath: string,
): IpcResult<{ receiptPath: string }>
```
- Kopierar fil till `app.getPath('documents')/Fritt Bokföring/receipts/<expense_id>/<basename>`
- Returnerar relativ path (lagras i DB)
- Hanterar duplicate-filename via timestamp-prefix

**Ny IPC:** `expense:attach-receipt` (efter `save-draft`, innan `finalize`):
```ts
// shared/ipc-schemas.ts
export const AttachReceiptSchema = z.object({
  expense_id: z.number().int().positive(),
  source_file_path: z.string().min(1),
}).strict()
```

**`UpdateCounterpartyDefaultAccountSchema`:** Ny IPC `counterparty:set-default-account`:
```ts
{
  counterparty_id: number,
  default_expense_account: string  // 4-siffrig BAS
}
```

**Tester:** ~6 tester i `tests/services/receipt-storage.test.ts`,
~3 i `tests/services/counterparty-default-account.test.ts`.

**Verifiering:**
- Migration kör utan fel via `runMigrations`
- Schema-paritet: ingen ny rad i `expenses_new` behövs (ADD COLUMN, inte recreate)
- M122-inventering: `expenses` har inkommande FK från `expense_lines` +
  `expense_payments` — recreate behövs INTE, bara ADD COLUMN. Trigger-
  inventering förblir oförändrad.

### Sprint VS-2 — useExpenseQuick-hook + payload-byggare (~1h)

**Mål:** Single-source-of-truth för "1-rads kostnad → SaveExpenseDraftPayload".

**Ny fil:** `src/renderer/lib/use-expense-quick.ts`:
```ts
export interface QuickExpenseInput {
  date: string         // YYYY-MM-DD
  amountInclVat: number  // ören (totalbelopp)
  supplierId: number
  description: string
  accountNumber: string  // 4-siffrig
  vatCodeId: number    // default IP1
  receiptPath: string | null  // när D2 finns
}

export function buildQuickExpensePayload(
  input: QuickExpenseInput,
  fyId: number,
): SaveExpenseDraftPayload
```

**Logik:**
- `total_inkl_vat` (ören) → `unit_price_ore` (netto) = round(total / (1 + rate/100))
- `quantity = 1` (M130 expense är heltal, alltid 1 för 1-rads-fall)
- `due_date` = `expense_date + 30 days` (default payment_terms)

**Tester:** ~8 tester (25%-kalk, 12%-kalk, 0%-fall, avrundning vid 99,99 öre).

### Sprint VS-3 — BokforKostnadSheet wired (~3h)

**Mål:** Sheet:n fungerar end-to-end.

**File:** `src/renderer/modes/vardag/BokforKostnadSheet.tsx` (extraheras
från VardagApp.tsx).

**State-modell:**
```ts
const [date, setDate] = useState(todayLocal())
const [amountInclVatKr, setAmountInclVatKr] = useState('')
const [supplier, setSupplier] = useState<Counterparty | null>(null)
const [description, setDescription] = useState('')
const [accountNumber, setAccountNumber] = useState('')
const [vatCodeId, setVatCodeId] = useState<number>(0)
const [receiptFile, setReceiptFile] = useState<{path: string} | null>(null)
const [submitting, setSubmitting] = useState(false)
const [error, setError] = useState<string | null>(null)
```

**Komponenter:**
- **SupplierPicker** — återanvänd från `expenses/SupplierPicker.tsx`
  (kopiera in i sheet eller importera direkt)
- **Konto-input** — readonly text-fält som visas när supplier väljs:
  `{supplier.default_expense_account} {accountName}` med Pen-knapp för
  att öppna konto-picker (mini-popup med klass 4–6 accounts)
- **Moms-rad-display:** "Moms: 25% (XX,XX kr)" — beräknat från
  `amountInclVatKr` × `vatRate`
- **Förslag-kontering-tabell:** 2 rader live:
  - D `{accountNumber}` `{netto kr}`
  - D `2640` `{moms kr}`
  - K `2440` `{total kr}`
- **ReceiptVisual:** byts till komponent som visar:
  - Tom: dashed drag-zon (klick öppnar `dialog.showOpenDialog`)
  - Med fil: bild-preview eller PDF-icon + filnamn

**Validation (live):**
- Datum måste vara i öppet FY (varning från ConsequencePane via
  `previewJournalLines`)
- Belopp > 0
- Supplier vald
- Description min 1 tecken
- Account_number satt (auto från supplier.default_expense_account, eller
  manuell override)

**Submit-flow:**
1. `setSubmitting(true)`
2. Bygg payload via `buildQuickExpensePayload`
3. `await window.api.saveExpenseDraft(payload)` → `expenseId`
4. Om receiptFile: `await window.api.attachReceipt({expenseId, sourceFilePath})`
5. `await window.api.finalizeExpense({id: expenseId})`
6. Om supplier saknade `default_expense_account`:
   `await window.api.setCounterpartyDefaultAccount({counterparty_id, default_expense_account})`
7. `toast.success('Bokfört som B{verNum}')`
8. Stäng sheet, reset state

**Felhantering:**
- VALIDATION_ERROR från finalize → visa i Callout, draft kvarstår,
  CTA "Öppna i bokförare-läget" som navigerar till `/expenses/edit/{id}`
- PERIOD_CLOSED → toast + CTA "Byt räkenskapsår"
- IO-fel vid receipt-attach → varning men fortsätter (receipt-mapping är
  best-effort, inte transactional med bokföring)

**Tester:** ~10 tester (state-changes, supplier-prefill, submit-success,
submit-fail-fallback, receipt-attach-soft-fail).

### Sprint VS-4 — SkapaFakturaSheet wired (~2.5h)

**Mål:** Faktura-sheet motsvarande funktionalitet.

**Skillnader mot kostnad-sheet:**
- Kund istället för leverantör (`useCounterparties({type: 'customer'})`)
- `default_revenue_account` istället för `default_expense_account`
- Outgoing VAT (MP1/MP2/MP3) istället för incoming (IP1/IP2/IP3)
- **Multi-line tabell** behövs (en faktura kan ha flera artiklar) —
  återanvänder ArticlePicker-pattern
- Ingen receipt (faktura har ingen kvitto-bilaga)
- "Skicka"-knappen kör `invoice:save-draft` + `invoice:finalize`
- Inkluderar PDF-generation som efter-steg (befintlig
  `invoice:generate-pdf`-IPC)

**Komplexitet:** Multi-line gör det här större än kostnad-sheet. Förslag:
**håll det 1-rads i första iteration** också (matchar prototyp-vision om
"snabb-faktura"). CTA "Lägg till fler rader" navigerar till
`/income/edit/{id}` i bokförare-läget.

**Tester:** ~8 tester (motsvarande kostnad-sheet plus PDF-generation-stub).

### Sprint VS-5 — Visual baselines + E2E (~1h)

**Mål:** Regressionsskydd.

- Uppdatera `vardag-sheet-kostnad-darwin.png` (struktur ändrad —
  från placeholder till fungerande form)
- Uppdatera `vardag-sheet-faktura-darwin.png`
- Nya baseline: `vardag-sheet-kostnad-with-receipt.png` (sheet med
  fil-preview)
- E2E-flöde i `tests/e2e/visual-regression.spec.ts`: öppna sheet, fyll i
  fält, klicka Bokför, verifiera toast + sheet stängs

**Tester:** 3 nya/uppdaterade baselines, 1 nytt E2E-flöde.

### Sprint VS-6 — Dokumentation + memory (~30 min)

- Uppdatera CLAUDE.md med ny princip: "M162 — sheets är 1-rads-flöden"
- Uppdatera handoff-dokumentet (Block 2 → klart)
- Uppdatera `project_sprint_state.md` memory

### Tidsplan-sammanfattning

| Sprint | Vad | Tid | Levererat |
|---|---|---|---|
| VS-1 | Schema + IPC | 1.5h | receipt_path-kolumn, ny IPC `attach-receipt` + `set-default-account` |
| VS-2 | Hook + payload-bygge | 1h | `buildQuickExpensePayload` + tester |
| VS-3 | Kostnad-sheet wired | 3h | Funktionell kostnad-sheet |
| VS-4 | Faktura-sheet wired | 2.5h | Funktionell faktura-sheet |
| VS-5 | Baselines + E2E | 1h | Visual regressionsskydd |
| VS-6 | Docs + memory | 0.5h | Dokumentation klar |
| **Total** | | **~9.5h** | |

Tidigare uppskattning sa 8–15h. Med besluten **A4 + B3 + C + D2** landar
det på den lägre änden eftersom inget av dem kräver ny ML-pipeline,
cloud-API eller blob-storage.

---

## Del 3 — Risker & alternativ

### Risk 1: Auto-update av default_expense_account är farligt

**Scenario:** Användaren bokar fel konto en gång (5910 istället för 6110)
→ nästa gång samma leverantör föreslår systemet 5910.

**Mitigering:** **Inte** auto-uppdatera default vid varje bokföring.
Istället uppdatera bara om `default_expense_account IS NULL` (första gången).
Användaren kan ändra default i leverantörs-detaljvyn separat. Detta blir
B2 istället för B3 — minskar effort till ~0.5h.

**Reviderat förslag: B2 istället för B3.**

### Risk 2: Receipt-fil och DB driftar isär

**Scenario:** DB rollback men fil redan kopierad → orphan file.

**Mitigering:** Spara fil EFTER `save-draft`, men FÖRE `finalize`. Om
finalize failar kvarstår draft + receipt — användaren kan slutföra senare.
Om receipt-save failar (disk full): toast varning, draft kvarstår, fortsätt
till finalize ändå (receipt är best-effort). **BFL 7 kap kräver kvitto
arkiverat — lägg in invariant-check vid finalize: om expenses.has_receipt
saknas → varning men inte hard-block.**

### Risk 3: ConsequencePane visar fel för 1-rads-flöde

`previewJournalLines`-IPC förväntar sig samma payload som save-draft.
Med 1 rad fungerar det redan — verifiera att 3-rads-output (D kostnad +
D moms / K lev-skuld) renderar korrekt i ConsequencePane.

### Risk 4: SupplierPicker-extrahering bryter expense-form

`SupplierPicker` är tightly coupled till ExpenseForm idag (props,
callbacks). Lyfta ut till delad komponent kan ge regressioner.

**Mitigering:** Använd den befintliga `SupplierPicker` direkt utan
refactor i första leverans. Om duplicering uppstår mellan sheet och
form, refactor i separat sprint.

---

## Del 4 — Beslutspunkter för signoff

Innan VS-1 startar behöver jag bekräftelse på:

- [ ] **A4** OK? (drag-fil + manuell inmatning, ingen OCR)
- [ ] **B2** OK? (default_expense_account, sätts bara första gången, manuell
      ändring i leverantör-detalj)
- [ ] **C** OK? (återanvänd save-draft + finalize, ingen ny IPC)
- [ ] **D2** OK? (filsystem-storage i Documents/Fritt Bokföring/receipts/)
- [ ] **VS-4 scope:** SkapaFakturaSheet 1-rads i första leverans (dela-
      upp via "Lägg till fler rader" → bokförare-läget)?
- [ ] **OCR senare?** Skall vi planera A2 (Tesseract.js) eller A3 (cloud)
      som separat backlog-item, eller stänga frågan?

Om alla beslut är OK → kör VS-1 till VS-6 sekventiellt. Hela arc:n
~9.5h fördelad på 6 sprintar med tydliga gates mellan dem.
