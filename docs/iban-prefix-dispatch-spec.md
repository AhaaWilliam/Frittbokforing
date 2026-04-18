# IBAN-prefix-dispatch — Spec draft

**Status:** Draft (väntar på implementering-beslut)
**Skapad:** 2026-04-18 (Sprint N)
**Ursprung:** Sprint F P4-scope-lås, eskalerad i Sprint L efter
scope-granskning.

## Bakgrund

`bank-fee-classifier.ts` (Sprint A, S58 F66-d) klassificerar en
bank-transaktion som `bank_fee` / `interest_income` / `interest_expense`
via två signaler:

1. **BkTxCd-mapping** (primär, score +100) — matchar ISO 20022-koden
   (`<BkTxCd><Domn>/<Fmly>/<SubFmly>`) via `bank_tx_code_mappings`-tabellen.
2. **Counterparty-bank-heuristik** (sekundär, score +30) — regex-match
   på counterparty-name mot svenska bank-mönster
   (`BANK_NAME_RE = /^(bank|seb|swedbank|handelsbanken|nordea|danske|icabank|lf|länsförsäkringar)/i`).
3. **Text-heuristik** (sekundär, score +40) — regex-match på
   remittance_info mot avgift/ränta-ord.

**Svaghet i counterparty-bank-heuristiken:**
- Kräver att `tx.counterparty_name` faktiskt är bankens namn. För
  intern-överföringar (t.ex. från eget sparkonto) och vissa bank-
  initierade avgiftsposter saknas counterparty_name eller är "Bank"
  utan banknamn.
- `counterparty_name` kan vara personnummer, kontonummer eller
  helt tomt beroende på bankens export-kvalitet.
- Utländska banker ingår inte i BANK_NAME_RE.

**Svensk IBAN-struktur innehåller bankkod deterministiskt:**
```
SE35 5000 0000 0543 9825 6689
  ^^ ^^ ^^^^
  |  |  └── Bankkod (4 siffror) = 5000 = SEB
  |  └──── Kontrollsiffror
  └────── Landskod
```

IBAN-prefix (första 4 siffrorna efter landskod + 2 check-sifror, eller
de första 4 av clearingnummer via bank-encoding) mappar entydigt till
bank-institut. Detta är pålitligare än `counterparty_name`.

## Sprint L identifierade tre tolkningar av "IBAN-prefix-dispatch":

### (a) IBAN-prefix-baserad bank-identifiering i classifier-heuristik

Utvidga `classifyByHeuristic` att använda `tx.counterparty_iban`-prefix
som ytterligare bank-match-signal, analogt med `BANK_NAME_RE`-matchning.

**Rekommenderad tolkning.** Konkret, minsta omfång, tydlig use case.

### (b) Transaction-routing baserat på IBAN-prefix

Skicka TX till olika behandlings-pipelines beroende på IBAN-bank.
T.ex. olika parsers per bank, olika fee-strukturer per bank.

**Avvisad.** Inget behov identifierat. camt.053/054 är redan bank-
agnostiska ISO-standard. Bank-specifika quirks kan hanteras case-för-case
när de uppstår, inte preemptivt.

### (c) Egen mapping-tabell `iban_prefix_mappings`

DB-tabell analog med `bank_tx_code_mappings` med CRUD i Settings.
Tillåter användare att lägga till mappningar för banker som inte finns
i default-listan.

**Avvisad som MVP.** Överkompli­cerad jämfört med konstant-mapping i
kod. Svenska bankkoder ändras sällan (Riksbankens clearing-nummer-register
är stabilt). Om nya banker tillkommer görs det via code-change, inte
config.

Om framtida behov uppstår (t.ex. norsk/dansk-banks integration), kan
mappingen flyttas till DB då.

## MVP-spec (alt A)

### Scope

- Utvidga `classifyByHeuristic` med IBAN-prefix-match som tredje bank-
  signal (efter `BANK_NAME_RE`).
- IBAN-prefix-mapping som konstant TypeScript-Map i
  `src/main/services/bank/iban-bank-registry.ts`.
- Endast svenska IBAN (SE-prefix). Utländska IBAN ignoreras (returnerar
  null).

### Filer att skapa

`src/main/services/bank/iban-bank-registry.ts`:

```ts
/**
 * Svenska bankkoder (clearing-nummer-prefix) → bank-identifierare.
 *
 * Källa: Riksbankens clearing-nummer-register.
 * Enbart för classifier-heuristik — ingen routing eller användar-
 * exponering. M153: deterministisk (ingen runtime-state).
 */

export type BankInstitutionId =
  | 'SEB'
  | 'SWEDBANK'
  | 'HANDELSBANKEN'
  | 'NORDEA'
  | 'DANSKE'
  | 'ICA'
  | 'LANSFORSAKRINGAR'
  | 'SKANDIA'

/**
 * Prefix = första 4 siffrorna av clearing-nummer (svensk bankkod).
 * IBAN-format: SE{check2}{clearing4}{account14}
 * Extrahera prefix: iban.slice(4, 8) för SE-IBAN.
 */
const SE_IBAN_PREFIX_TO_BANK: ReadonlyMap<string, BankInstitutionId> = new Map([
  // SEB: 5000-5999
  ...rangeEntries(5000, 5999, 'SEB'),
  // Swedbank: 7000-7999, 8000-8999 (Sparbankerna)
  ...rangeEntries(7000, 7999, 'SWEDBANK'),
  ...rangeEntries(8000, 8999, 'SWEDBANK'),
  // Handelsbanken: 6000-6999
  ...rangeEntries(6000, 6999, 'HANDELSBANKEN'),
  // Nordea: 1100-1199, 1400-2099, 3000-3299, 3410-3999, 4000-4999
  ...rangeEntries(1100, 1199, 'NORDEA'),
  ...rangeEntries(1400, 2099, 'NORDEA'),
  ...rangeEntries(3000, 3299, 'NORDEA'),
  ...rangeEntries(3410, 3999, 'NORDEA'),
  ...rangeEntries(4000, 4999, 'NORDEA'),
  // Danske Bank: 1200-1399, 2400-2499
  ...rangeEntries(1200, 1399, 'DANSKE'),
  ...rangeEntries(2400, 2499, 'DANSKE'),
  // ICA Banken: 9270-9279
  ...rangeEntries(9270, 9279, 'ICA'),
  // Länsförsäkringar: 9020-9029, 3400-3409
  ...rangeEntries(9020, 9029, 'LANSFORSAKRINGAR'),
  ...rangeEntries(3400, 3409, 'LANSFORSAKRINGAR'),
  // Skandiabanken: 9150-9169
  ...rangeEntries(9150, 9169, 'SKANDIA'),
])

function rangeEntries(
  from: number,
  to: number,
  bank: BankInstitutionId,
): Array<[string, BankInstitutionId]> {
  const entries: Array<[string, BankInstitutionId]> = []
  for (let i = from; i <= to; i++) {
    entries.push([String(i), bank])
  }
  return entries
}

/**
 * Försök mappa en IBAN till bank-institut.
 * Returnerar null för:
 * - null/undefined IBAN
 * - Icke-SE-IBAN (utländska banker)
 * - Okänd prefix (ny svensk bank som saknas i registret)
 *
 * Deterministisk, inga side effects.
 */
export function lookupBankByIban(
  iban: string | null | undefined,
): BankInstitutionId | null {
  if (!iban) return null
  const normalized = iban.replace(/\s+/g, '').toUpperCase()
  if (!normalized.startsWith('SE') || normalized.length < 8) return null
  const prefix = normalized.slice(4, 8)
  return SE_IBAN_PREFIX_TO_BANK.get(prefix) ?? null
}
```

### Ändring i `bank-fee-classifier.ts`

Lägg till `counterparty_iban` i `BankTxInput`:
```ts
export interface BankTxInput {
  amount_ore: number
  counterparty_name: string | null
  counterparty_iban: string | null   // NYTT
  remittance_info: string | null
  bank_tx_domain: string | null
  bank_tx_family: string | null
  bank_tx_subfamily: string | null
}
```

Utvidga `classifyByHeuristic`:
```ts
function classifyByHeuristic(tx: BankTxInput): FeeClassification | null {
  if (Math.abs(tx.amount_ore) > MAX_FEE_HEURISTIC_ORE) return null

  const bankByName = tx.counterparty_name
    ? BANK_NAME_RE.test(tx.counterparty_name)
    : false
  const bankByIban = lookupBankByIban(tx.counterparty_iban) !== null
  const bankHit = bankByName || bankByIban

  // ... (rest of existing logic)

  if (bankHit) {
    score += 30
    reasons.push(
      bankByIban
        ? 'IBAN-prefix matchar bank-institut'
        : 'Counterparty matchar bank-mönster',
    )
  }

  // ... (rest of existing logic)
}
```

### Tests

`tests/session-N-iban-bank-registry.test.ts`:
- `lookupBankByIban` returnerar `SEB` för `SE35 5000 0000 ...`
- Returnerar `SWEDBANK` för `SE45 8327 0000 ...`
- Returnerar `null` för `NO123...` (utländskt)
- Returnerar `null` för `SE99 9999 0000 ...` (okänd prefix)
- Returnerar `null` för null, undefined, tom sträng
- Accepterar whitespace och lowercase: `'se35 5000 0000'` → SEB
- Deterministisk: samma input → samma output (100 iterationer)

`tests/session-N-classifier-iban.test.ts`:
- TX med bank-IBAN men ingen counterparty_name → bank_fee-score ≥ 30
- TX med utländsk IBAN → ingen IBAN-bonus (faller tillbaka på
  counterparty_name eller text-heuristik)
- TX med både bank-IBAN och bank-name → bara en +30-bonus (OR, inte AND)

### Scope out

- Non-SE IBAN (NO, DK, DE, etc.) — kan läggas till senare om use-case
  uppstår
- DB-tabell för user-customizable mappings (avvisat som MVP, se (c) ovan)
- IBAN-baserad routing (avvisat, se (b) ovan)
- Extrahering av bankkod från **clearing-nummer** (utan IBAN) — camt.053
  har `IBAN` som default, clearing-nummer-parse är icke-standard

### Invarianter

- **M153 (deterministisk scoring):** Registret är en konstant Map.
  `lookupBankByIban` har inga side effects, ingen runtime-state.
  Passerar `scripts/check-m153.mjs`.
- **Inget DB-access i hot path:** Map är i-memory, ingen query per TX.
- **Robust mot null/whitespace:** Funktion hanterar malformed input
  tystly (null return), inte kastar.

### Estimat

~0.5–1 SP. Tre filer att skapa/ändra (registry + classifier + 2
test-filer). Inga nya migrationer, inga nya IPC-kanaler, inga nya
M-principer.

### Beroenden

Inga. Kan implementeras direkt efter denna spec godkänns.

## Open questions

1. **Ska vi seed'a bank-mappings i en DB-tabell ändå?**
   Argument för: flexibilitet utan code-change. Mot: overkill för
   stabilt register, ökar komplexitet utan use case. **Svar:** Nej för
   MVP. Kan migreras till DB om behov uppstår.

2. **Ska `counterparty_iban` alltid prioriteras över `counterparty_name`?**
   Argument för: IBAN är mer deterministisk. Mot: user kan skriva
   counterparty_name manuellt (i testning) som override. **Svar:** Nej
   — båda ger samma +30-bonus (OR). Prioritering bara om vi vill ge
   IBAN högre vikt (t.ex. +40 vs +30), vilket inte är motiverat av
   nuvarande use case.

3. **Hur uppdateras registret när svenska banker tillkommer/försvinner?**
   Eftersom det är i kod, kräver det code-change + code-review. Bra
   för audit-trail men kräver release för att ta effekt. **Svar:**
   Acceptabelt för MVP. Om release-cadensen inte hinner med
   bank-ändringar, migrera till DB.

## Rekommendation

Implementera alt A med ovanstående scope. Nästa sprint kan leverera
denna i ~1 SP. Blockeras inte på något externt.
