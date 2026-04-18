# T3.d — MT940 + BGC parser-spec

**Status:** Draft (klar för implementation-sprint)
**Skapad:** 2026-04-18 (Sprint O)
**Ursprung:** Sprint E T3-eskalering. Timing-gate H2 2026 lyftes i Sprint O
efter användarbegäran; spec skriven nu så sprinten kan schemaläggas när som.

## Bakgrund

Nuvarande bank-statement-import stöder enbart:
- **camt.053** (ISO 20022 XML, bank-statement)
- **camt.054** (ISO 20022 XML, credit/debit notification, pseudo-statement
  med opening=0/closing=0 per Sprint F P6)

`source_format`-CHECK i `bank_statements`-tabellen är idag `IN ('camt.053',
'camt.054')` (migration 043, per Sprint F P6).

**Gap i nuvarande stöd:**

- **MT940** — SWIFT-textformat. Används fortfarande av mindre svenska
  banker som ännu inte migrerat till ISO 20022 (Bankgirot via SWIFT,
  vissa regionala banker). Format: `:20:...`-taggad platt text.
- **BGC/BGMAX** — Bankgirocentralens format för inkommande betalningar
  till bankgiro-konto. Fixed-width svensk-specifik text-format. Används
  primärt för att reconcila bankgiro-betalningar mot kundfakturor.

## Beslut kring scope

### In scope (MVP)

1. **MT940-parser** — produce `ParsedBankStatement` kompatibel med
   befintlig `bank-statement-service.importBankStatement`.
2. **BGMAX-parser** — produce `ParsedBankStatement`-liknande struktur
   (pseudo-statement eftersom BGMAX är notifikations-format, inte
   riktigt bank-kontoutdrag). Analogt med hur camt.054 hanterades.
3. **source_format CHECK-utvidgning** — migration 044 (eller nästa
   lediga) lägger till `'mt940'` och `'bgmax'` i whitelist.
4. **IPC-handler-input-utvidgning** — `importBankStatement` tar
   fortsatt `format?: BankStatementFormat` men med utökad union.
5. **File-type-sniffing** — smart autodetektion från fil-content
   (BOM/header) så users slipper välja format manuellt.

### Out of scope (framtid)

- **BGC Utbetalningar/Leverantörsbetalningar-format** — BGC har flera
  format. Utbetalningar är mindre vanligt för SME. Lägg till om/när
  behov identifieras.
- **MT942** — interim statement (samma dags-transaktioner). MT940 är
  end-of-day och räcker för reconciliation.
- **MT940-varianter: CODA, Sibos, SWIFT-GPI** — inte svenskt standard;
  branch-specifik om behov.
- **BGC-retur/avvisade-betalningar-format** — användare hanterar
  dessa manuellt via avstämning idag. Lägg till om volumet motiverar.

## MT940-parser

### Format-overview

MT940 är en SWIFT-standard text-format. Segment börjar med `:NN:` där NN
är taggnummer. Exempel:

```
{1:F01BANKSESSXXXX1234567890}
{2:O9401200250101BANKSESSXXXX12345678902501011200N}
{4:
:20:REF12345678
:25:SE1234567890
:28C:00001/00001
:60F:C250101SEK1234567,89
:61:2501010101D123,45NTRFNONREF//REF2
Transfer to beneficiary
:86:/TRCD/60000/
/NAME/BENEFICIARY NAME/
/REMI/Invoice 12345/
:62F:C250101SEK1234444,44
:64:C250101SEK1234444,44
-}
```

### Tag-mappning

| MT940 tag | Semantik | Mapping till `ParsedBankStatement` |
|---|---|---|
| `:20:` | Transaction reference | `statement_number` |
| `:25:` | Account identification | `bank_account_iban` (om konto är IBAN-format) |
| `:28C:` | Statement sequence number | (ignoreras i MVP) |
| `:60F:` | Opening balance (final) | `opening_balance_ore` |
| `:60M:` | Opening balance (intermediate) | (ignoreras) |
| `:61:` | Transaction | `transactions[]` |
| `:86:` | Transaction details (free text) | `transactions[].remittance_info` |
| `:62F:` | Closing balance (final) | `closing_balance_ore` |
| `:64:` | Available balance | (ignoreras — kan skilja från CLBD för pending) |

### :60F/:62F-format

`C250101SEK1234567,89`
- `C` = Credit (Debit = `D`)
- `250101` = YYMMDD booking date
- `SEK` = currency
- `1234567,89` = amount with **comma decimal separator**

Samma validering som camt.053: endast SEK i MVP. Comma-to-period
parsning i `decimalToOre`-helper.

### :61-format (transaction)

`250101 0101 D 123,45 NTRF NONREF // REF2`
- `250101` = value date (YYMMDD)
- `0101` = entry date (MMDD) — optional, use value if missing
- `D` / `C` / `RC` / `RD` = Debit/Credit/Reversal-of-credit/Reversal-of-debit
- `123,45` = amount
- `NTRF` = transaction type (4 chars) — mappa till BkTxCd eller spara som
  `bank_transaction_code`
- `NONREF` eller ref = reference
- `//REF2` = bank reference (optional)
- Rest of line = supplementary details

**Transaction type mapping** (subset — full list i ISO 9362):
- `NTRF` → `ACMT/RCDT/STDO` (Standing order credit)
- `NDDT` → `ACMT/DD/...` (Direct debit)
- `NCHG` → `PMNT/.../CHRG` (Bank charge) — **important for
  bank-fee-classifier!**
- `NINT` → `PMNT/.../INTR` (Interest) — **important**
- `NTRF` `NMSC` `NCOM` → generisk

Mapping-tabell konstant i `mt940-bktxcd-mapping.ts`. Output populerar
`bank_tx_domain/family/subfamily` så classifier funkar med MT940 utan
ändring.

### :86-format (details)

Strukturerad med tagar som `/TRCD/` `/NAME/` `/REMI/` `/BENM/` `/IBAN/`:
- `/TRCD/` — Transaction code (overrides :61: code om finns)
- `/NAME/` — Counterparty name → `counterparty_name`
- `/IBAN/` — Counterparty IBAN → `counterparty_iban`
- `/REMI/` — Remittance info → `remittance_info`
- `/ORDP/` — Ordering party
- `/BENM/` — Beneficiary

Om tag-struktur saknas → hela :86-raden blir `remittance_info` (unstructured).

### Multi-message-filer

MT940-filer kan innehålla flera statements separerade med `-}`. MVP:
Parse **första** statement, ignorera resten med varning. Samma semantik
som camt.053 (vi hanterar inte multi-statement i MVP).

Alternativ för framtida utökning: returnera array av statements eller
iterera i service-lager.

### Error-hantering

Ny `Mt940ParseError` analog med `Camt053ParseError`. Fel-koder:
- `PARSE_ERROR` — filen är syntaktiskt trasig (okänt tag-format)
- `VALIDATION_ERROR` — obligatorisk tag saknas (`:20:`, `:60F:`, `:62F:`)
- `UNSUPPORTED_CURRENCY` — icke-SEK i `:60F:` eller `:62F:`

## BGMAX-parser

### Format-overview

BGMAX är fixed-width text-format från Bankgirocentralen. Rader identifieras
av prefix:

```
0100000123456789SEK202510101240101100                        BGC
2010000012345670010000010000000000000000000025000000000AB12
3020000000001230AB12                                               JOHN DOE
5100000001000001000250101                                                       BGC
70000001                                                                          BGC
```

| TK (transaktionskod) | Semantik |
|---|---|
| `01` | Huvudpost (file header) — sender, date, currency |
| `05` | Öppningspost (statement header) — bankgiro-nummer, period |
| `20` | Betalning — debtor info, amount, reference |
| `25` | Avdrag/reversering |
| `30` | Namn-information |
| `40` | Address |
| `50` | Meddelande (remittance) |
| `51` | Avslutningspost (statement footer) — subtotal |
| `70` | Filfotter — total count |

Position-baserad parsing (fixed-width). Se `bgmax-positions.md`-bilaga
för exakt layout.

### Mapping till `ParsedBankStatement`

BGMAX är notifikationsformat, inte kontoutdrag. Analogt med camt.054
(Sprint F P6):

- `statement_number` = `:01:` referens eller `filedate_batchnr`
- `bank_account_iban` = konstrueras från bankgiro-nummer: `SE00BGMAX<bg>`
  (pseudo-IBAN; BG-nummer är inte riktig IBAN men bank-statement-service
  behöver någonting unikt)
- `statement_date` = header-datum
- `opening_balance_ore` = 0 (BGMAX har ingen balans)
- `closing_balance_ore` = 0
- `transactions[]` = `:20:`-poster med assoc `:30:`-namn + `:50:`-meddelande

**Pseudo-IBAN-argumentet:** Bankgiro-nummer är inte IBAN men
`bank_statements.bank_account_iban` är NOT NULL. Enklast: konstruera
stabil pseudo-identifierare som inte krockar med riktiga IBANs.

Alternativ: gör `bank_account_iban` nullable. Mer arkitektoniskt rent
men kräver schema-ändring som påverkar existerande invarianter. **Inte
rekommenderat** för MVP.

### Encoding

BGMAX är **Latin-1** (ISO-8859-1), inte UTF-8. `iconv-lite` används för
decode (samma mönster som SIE4-import).

### Error-hantering

`BgmaxParseError` analog:
- `PARSE_ERROR` — okänt TK-prefix, truncated-rad
- `VALIDATION_ERROR` — obligatorisk post saknas
- `UNSUPPORTED_CURRENCY` — non-SEK

## Migration 044

```sql
-- 044: source_format CHECK utökad till MT940 + BGMAX
BEGIN;

-- M122 table-recreate-mönstret (bank_statements har inkommande FK från
-- bank_transactions, bank_reconciliation_matches).

PRAGMA foreign_keys = OFF; -- utanför transaktion; better-sqlite3 kräver det

CREATE TABLE bank_statements_new (
  ... -- kopiera från migration 043
  source_format TEXT NOT NULL DEFAULT 'camt.053',
  ...
  CHECK (source_format IN ('camt.053', 'camt.054', 'mt940', 'bgmax')),
  ...
);

INSERT INTO bank_statements_new SELECT * FROM bank_statements;
DROP TABLE bank_statements;
ALTER TABLE bank_statements_new RENAME TO bank_statements;

-- Återskapa index
CREATE INDEX idx_bank_statements_company ON bank_statements(company_id);
CREATE INDEX idx_bank_statements_iban ON bank_statements(bank_account_iban);
-- etc — full lista från migration 043

-- M121: triggers attached till bank_statements behöver recreaterasbut — finns inga triggers i nuvarande schema

-- M141: cross-table-triggers som refererar bank_statements i sin body
-- Inventering via SELECT name, tbl_name, sql FROM sqlite_master
-- WHERE type='trigger' AND sql LIKE '%bank_statements%' AND tbl_name != 'bank_statements';
-- Om resultat: DROP + recreate

PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check; -- måste vara tom; annars kasta fel
```

**Not:** Migration-index i `db.ts` `runMigrations` behöver `needsFkOff`-
guard för index 22 (migration 044). Se M122.

## Service-lager-ändringar

### `BankStatementFormat`-union utökad

```ts
// bank-statement-service.ts
export type BankStatementFormat = 'camt.053' | 'camt.054' | 'mt940' | 'bgmax'
```

### `importBankStatement` branch

```ts
switch (format) {
  case 'camt.053':
    parsed = parseCamt053(input.content)
    break
  case 'camt.054': {
    const notification = parseCamt054(input.content)
    parsed = toPseudoStatement(notification)
    break
  }
  case 'mt940':
    parsed = parseMt940(input.content)
    break
  case 'bgmax':
    parsed = parseBgmax(input.content) // returnerar pseudo-statement
    break
}
```

**Not:** `input.xml_content` → `input.content` rename eftersom MT940/BGMAX
inte är XML. Behåll `xml_content` som alias under deprecation.

### Autodetektion

```ts
// bank-statement-service.ts — helper
function detectFormat(content: string): BankStatementFormat {
  const trimmed = content.trimStart().slice(0, 200)
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<Document')) {
    // XML — check for camt.053 vs camt.054
    if (content.includes('BkToCstmrStmt')) return 'camt.053'
    if (content.includes('BkToCstmrDbtCdtNtfctn')) return 'camt.054'
    throw new Error('Okänt XML-format')
  }
  if (trimmed.startsWith('{1:') || trimmed.startsWith(':20:')) {
    return 'mt940'
  }
  if (/^01\d{10,}/.test(trimmed)) {
    return 'bgmax'
  }
  throw new Error('Okänt format — kunde inte detektera MT940/BGMAX/camt')
}
```

Användaren får alltid välja format i UI (ger bort autodetektion-fel på
tvetydiga filer), men default förvalt via autodetektion.

## IPC-kontraktsändringar

**Ingen** ny IPC-kanal. Befintlig `bank-statement:import` tar fortsatt
`{ xml_content: string, format?: BankStatementFormat, fiscal_year_id: number }`.

Zod-schema-uppdatering i `ipc-schemas.ts`:
```ts
bankStatementImportSchema = z.object({
  xml_content: z.string().min(1),
  format: z.enum(['camt.053', 'camt.054', 'mt940', 'bgmax']).optional(),
  fiscal_year_id: z.number().int().positive(),
})
```

## Tests

### Nya testfiler

- `tests/session-O-mt940-parser.test.ts` (~30 tester)
  - Happy-path: minimalt giltigt MT940 → parsed statement
  - Transaction types: NTRF, NDDT, NCHG, NINT → korrekt BkTxCd-mapping
  - :86-tags: /NAME/, /IBAN/, /REMI/ → rätt fält i ParsedBankTransaction
  - :86 unstructured → hela raden som remittance_info
  - Error: saknar :20: → VALIDATION_ERROR
  - Error: saknar :60F: → VALIDATION_ERROR
  - Error: non-SEK currency → UNSUPPORTED_CURRENCY
  - Error: trasig tag → PARSE_ERROR
  - Multi-statement-fil: parse första, varning om rest
  - Reversal: RC/RD-koder hanteras korrekt
  - Real-world fixtures: minst 2 verkliga (anonymiserade) MT940-filer

- `tests/session-O-bgmax-parser.test.ts` (~25 tester)
  - Happy-path: minimalt giltigt BGMAX → pseudo-statement
  - TK=20 betalning med TK=30 namn + TK=50 meddelande → komplett TX
  - Pseudo-IBAN: `SE00BGMAX<bgnr>` konstruktion
  - Opening/closing = 0 (BGMAX har ingen balans)
  - Encoding: Latin-1 åäö dekoderas korrekt
  - Error: okänt TK-prefix → PARSE_ERROR
  - Error: truncated rad → PARSE_ERROR
  - Real-world fixtures: minst 2 verkliga BGMAX

- `tests/session-O-bank-import-autodetect.test.ts` (~10 tester)
  - camt.053 XML → detektion
  - camt.054 XML → detektion
  - MT940 text → detektion
  - BGMAX text → detektion
  - Okänt format → error
  - BOM-prefix tolereras
  - Leading whitespace tolereras

### Utökade testfiler

- `tests/session-54-bank-service.test.ts` — lägg till test-case för
  MT940/BGMAX via importBankStatement
- `tests/session-N-iban-bank-registry.test.ts` (om IBAN-spec implementerad
  innan T3.d) — MT940 med `/IBAN/`-tag → classifier fångar bank-match

### Regression-verifiering

- Alla befintliga camt.053/054-tester ska passera oförändrat
- M153 check:m153 ska passera (parsers ska vara rena/deterministiska)
- M122/M141 migration-invarianter via `PRAGMA foreign_key_check`
- Integration med `bank-fee-classifier` → transaction-code-mappning
  triggar classifier-heuristik

## Scope-/klaga-analys

**Totala filer att skapa/ändra:**

| Fil | Typ | Rader |
|---|---|---:|
| `src/main/services/bank/mt940-parser.ts` | Ny | ~350 |
| `src/main/services/bank/mt940-bktxcd-mapping.ts` | Ny | ~40 |
| `src/main/services/bank/bgmax-parser.ts` | Ny | ~280 |
| `src/main/services/bank/bank-statement-service.ts` | Ändrad | +40 |
| `src/main/migrations.ts` | Ändrad | +60 (migration 044) |
| `src/main/db.ts` | Ändrad | +3 (needsFkOff-guard) |
| `src/main/ipc/ipc-schemas.ts` | Ändrad | +5 |
| `src/shared/types.ts` | Ändrad | +2 (format-union) |
| Test-filer | 3 nya | ~800 |
| Test-fixtures | 4 nya (anonymiserade MT940+BGMAX) | - |

### Estimat

**~3-4 SP.** Sprint-storlek. Större än IBAN-spec (~1 SP) eftersom två
distinkta format + migration.

### Beroenden

1. **Test-fixtures** — vi behöver riktiga (anonymiserade) MT940 och
   BGMAX-filer för realistiska regression-tester. Kan tillhandahållas
   av:
   - User (egen bank-export)
   - Publikt exempel från Bankgirot/SWIFT spec
   - Konstruerade från format-spec

2. **Ingen kod-beroende.** Independent av IBAN-prefix-dispatch,
   Sprint H och andra pågående spår.

### Risk-analys

- **Encoding:** BGMAX Latin-1 kan ge subtila bug med åäö. Lösning:
  `iconv-lite` etablerat (används i SIE4-import).
- **MT940-varianter:** Olika banker har olika :86-formatering (strukturerad
  vs fri text). Lösning: tolerant parser som degrade graceful till
  unstructured remittance_info.
- **BGMAX pseudo-IBAN-kollision:** Om en användare har en verklig SE-IBAN
  som börjar med `SE00BGMAX` kollidar. Osannolikt (SE-IBAN har check-
  sifror). Mitigering: dokumentera pseudo-IBAN-prefix som reserverad.
- **Migration 044 table-recreate:** bank_statements har flera inkommande
  FK-referenser (M122). Test migrations-uppgradering med konkret data.

### Timing-revidering

Sprint L/M placerade T3.d i "H2 2026". Givet att specen är klar nu och
dependencies är låga, kan implementation-sprinten köras tidigare om
prioritering ändras. Inget blockerar genomförande utöver användar-beslut
om prioritet.

## Nästa steg

1. Godkänn denna spec.
2. Schedulera implementation-sprint (~3-4 SP).
3. Tillhandahåll riktiga MT940 + BGMAX-fixtures om möjligt (annars
   konstruktion från spec).
4. Efter implementation: uppdatera bank-import-wizard med format-picker
   + autodetektion.

## Referenser

- [SWIFT MT940 spec](https://www2.swift.com/knowledgecentre/publications/us9m_20230720/2.0?topic=finInf_MT940.htm)
- [BGMAX format-spec (Bankgirot)](https://www.bankgirot.se/en/products-services/receive-payments/bankgiro-reconciliation)
- [ISO 9362 transaction type codes](https://www.iso20022.org/iso-9362-bic)
- [camt.053-parser](src/main/services/bank/camt053-parser.ts) — referens-
  implementation för XML-formats
- [camt.054-parser](src/main/services/bank/camt054-parser.ts) — referens
  för pseudo-statement-mönstret
- M122 (migration-mönster för tabeller med inkommande FK)
- Sprint F P6 summary (source_format-utvidgning till camt.054)
