/**
 * Svenska bankkoder (clearing-nummer-prefix) → bank-identifierare.
 *
 * Sprint P (F-backlog från SL/SN): IBAN-prefix-dispatch spec alt (a).
 * Scope: classifier-heuristik. Ingen routing, ingen DB-tabell, inga
 * utländska banker i MVP. Se docs/iban-prefix-dispatch-spec.md.
 *
 * M153: deterministisk. Konstant Map, ingen runtime-state, inga side
 * effects. Scanneras av scripts/check-m153.mjs.
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

function* rangeEntries(
  from: number,
  to: number,
  bank: BankInstitutionId,
): Generator<[string, BankInstitutionId]> {
  for (let i = from; i <= to; i++) {
    yield [String(i), bank]
  }
}

/**
 * Prefix = första 4 siffrorna av clearing-nummer (svensk bankkod).
 * Svensk IBAN-format: SE{check2}{clearing4}{account14}
 * Extrahera prefix: iban.slice(4, 8) för SE-IBAN (4 = SE + check2).
 *
 * Källa: Riksbankens clearing-nummer-register (publikt dokument).
 */
const SE_IBAN_PREFIX_TO_BANK: ReadonlyMap<string, BankInstitutionId> = new Map([
  ...rangeEntries(5000, 5999, 'SEB'),
  ...rangeEntries(7000, 7999, 'SWEDBANK'),
  ...rangeEntries(8000, 8999, 'SWEDBANK'),
  ...rangeEntries(6000, 6999, 'HANDELSBANKEN'),
  ...rangeEntries(1100, 1199, 'NORDEA'),
  ...rangeEntries(1400, 2099, 'NORDEA'),
  ...rangeEntries(3000, 3299, 'NORDEA'),
  ...rangeEntries(3410, 3999, 'NORDEA'),
  ...rangeEntries(4000, 4999, 'NORDEA'),
  ...rangeEntries(1200, 1399, 'DANSKE'),
  ...rangeEntries(2400, 2499, 'DANSKE'),
  ...rangeEntries(9270, 9279, 'ICA'),
  ...rangeEntries(9020, 9029, 'LANSFORSAKRINGAR'),
  ...rangeEntries(3400, 3409, 'LANSFORSAKRINGAR'),
  ...rangeEntries(9150, 9169, 'SKANDIA'),
])

/**
 * Försök mappa en IBAN till bank-institut.
 * Returnerar null för:
 * - null/undefined/tom IBAN
 * - Icke-SE-IBAN (utländska banker)
 * - IBAN kortare än 8 tecken efter normalisering
 * - Okänd prefix (bank saknas i registret)
 *
 * Tolerant för whitespace och lowercase.
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
