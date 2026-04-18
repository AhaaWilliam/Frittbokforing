/**
 * Nordiska bankkoder → bank-identifierare.
 *
 * Sprint P: svenska bankkoder (SL/SN IBAN-prefix-dispatch spec alt (a)).
 * Sprint R: utvidgat med norska (NO) + danska (DK) register-nummer för
 * större banker med nordisk närvaro. Scope: classifier-heuristik. Ingen
 * routing, ingen DB-tabell.
 *
 * M153: deterministisk. Konstant Map, ingen runtime-state, inga side
 * effects. Scanneras av scripts/check-m153.mjs.
 *
 * Osäkerhet: NO/DK register är inte uttömmande — bara större banker
 * med hög sannolikhet för transaktioner från svenska SMEs. Utöka
 * efter behov om classifier missar legitima bank-matches.
 */

export type BankInstitutionId =
  // Svenska banker
  | 'SEB'
  | 'SWEDBANK'
  | 'HANDELSBANKEN'
  | 'NORDEA'
  | 'DANSKE'
  | 'ICA'
  | 'LANSFORSAKRINGAR'
  | 'SKANDIA'
  // Norska storbanker
  | 'DNB'
  | 'SPAREBANK1'
  // Danska storbanker (Danske och Nordea overlap med SE-identifierare)
  | 'JYSKE'
  | 'SYDBANK'

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
 * Extrahera prefix: iban.slice(4, 8) för SE-IBAN.
 *
 * Källa: Riksbankens clearing-nummer-register.
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
 * Norsk IBAN-format: NO{check2}{registernummer4}{konto6}{check1}
 * Extrahera prefix: iban.slice(4, 8).
 *
 * Källa: Finans Norge / Bits registernummer-register (subset).
 */
const NO_IBAN_PREFIX_TO_BANK: ReadonlyMap<string, BankInstitutionId> = new Map([
  // DNB (Den Norske Bank) — största banken
  ...rangeEntries(1503, 1510, 'DNB'),
  ...rangeEntries(4200, 4299, 'DNB'),
  // Nordea Norge
  ...rangeEntries(5096, 5099, 'NORDEA'),
  ...rangeEntries(6000, 6099, 'NORDEA'),
  // Handelsbanken Norge
  ...rangeEntries(9049, 9049, 'HANDELSBANKEN'),
  ...rangeEntries(9040, 9049, 'HANDELSBANKEN'),
  // SpareBank 1 (kooperation av regionala sparbanker)
  ...rangeEntries(4312, 4356, 'SPAREBANK1'),
  // Danske Bank Norge
  ...rangeEntries(8101, 8101, 'DANSKE'),
  ...rangeEntries(3000, 3200, 'DANSKE'),
])

/**
 * Dansk IBAN-format: DK{check2}{bankkode4}{konto10}
 * Extrahera prefix: iban.slice(4, 8).
 *
 * Källa: Finanstilsynet pengeinstitut-register (subset).
 */
const DK_IBAN_PREFIX_TO_BANK: ReadonlyMap<string, BankInstitutionId> = new Map([
  // Danske Bank — största i DK
  ...rangeEntries(3000, 3999, 'DANSKE'),
  // Nordea Danmark
  ...rangeEntries(2000, 2299, 'NORDEA'),
  ...rangeEntries(40, 80, 'NORDEA'),
  // Jyske Bank
  ...rangeEntries(5000, 5999, 'JYSKE'),
  // Sydbank
  ...rangeEntries(6600, 6699, 'SYDBANK'),
  ...rangeEntries(7600, 7699, 'SYDBANK'),
  // Handelsbanken DK
  ...rangeEntries(6480, 6499, 'HANDELSBANKEN'),
])

/**
 * Försök mappa en IBAN till bank-institut.
 * Stöder SE (fullständigt), NO (subset), DK (subset).
 * Returnerar null för:
 * - null/undefined/tom IBAN
 * - Länder som inte stöds
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
  if (normalized.length < 8) return null

  const countryCode = normalized.slice(0, 2)
  const prefix = normalized.slice(4, 8)

  switch (countryCode) {
    case 'SE':
      return SE_IBAN_PREFIX_TO_BANK.get(prefix) ?? null
    case 'NO':
      return NO_IBAN_PREFIX_TO_BANK.get(prefix) ?? null
    case 'DK':
      return DK_IBAN_PREFIX_TO_BANK.get(prefix) ?? null
    default:
      return null
  }
}
