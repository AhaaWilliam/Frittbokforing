/**
 * BAS-kontoplanens klass-intervall.
 *
 * Enda källa för kontoklass-konstanter (1–2 = balans, 3–8 = resultat).
 * Hårdkodning i service-kod är förbjuden — importera härifrån.
 *
 * M98 gäller: INGEN lexikografisk jämförelse (`> '3000'`) — använd numerisk
 * CAST(SUBSTR()) eller helpern nedan för att matcha även 5-siffriga
 * underkonton korrekt.
 */

export const BALANCE_SHEET_CLASS_MIN = 1000
export const BALANCE_SHEET_CLASS_MAX = 2999

export const INCOME_STATEMENT_CLASS_MIN = 3000
export const INCOME_STATEMENT_CLASS_MAX = 8999

/**
 * True om kontot tillhör balansräkningen (klass 1 eller 2).
 * Robust mot underkonton (både '1930' och '19305' matchar).
 */
export function isBalanceSheetAccount(accountNumber: string): boolean {
  const first = accountNumber.charAt(0)
  return first === '1' || first === '2'
}

/**
 * True om kontot tillhör resultaträkningen (klass 3–8).
 */
export function isIncomeStatementAccount(accountNumber: string): boolean {
  const first = accountNumber.charAt(0)
  return first >= '3' && first <= '8'
}

/**
 * SQL-fragment som matchar balanskonton via numerisk CAST (M98-kompatibel).
 * Används i queries där vi vill filtrera på klass utan att anropa helpern per rad.
 */
export const BALANCE_SHEET_SQL_RANGE =
  "CAST(SUBSTR(account_number || '0000', 1, 4) AS INTEGER) BETWEEN 1000 AND 2999"
