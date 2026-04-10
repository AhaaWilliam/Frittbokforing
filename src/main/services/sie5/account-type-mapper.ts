/**
 * Maps BAS account numbers to SIE5 account types.
 * SIE5 types: 'asset' | 'liability' | 'equity' | 'cost' | 'income'
 *
 * BAS-kontoplan:
 *   1xxx = Tillgångar → 'asset'
 *   20xx = Eget kapital → 'equity'
 *   21xx–29xx = Skulder → 'liability'
 *   3xxx = Intäkter → 'income'
 *   4xxx–7xxx = Kostnader → 'cost'
 *   8xxx = Finansiella poster — grov mappning:
 *     8000–8069 = Finansiella intäkter → 'income'
 *     8070–8089 = Resultat vid avyttring → 'cost'
 *     8090–8399 = Övriga finansiella intäkter → 'income'
 *     8400–8999 = Finansiella kostnader/dispositioner/skatter → 'cost'
 */
export type Sie5AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'cost'
  | 'income'

export function mapAccountType(accountNumber: string): Sie5AccountType {
  if (
    !accountNumber ||
    !/^\d+$/.test(accountNumber) ||
    accountNumber.length < 4
  ) {
    throw new Error(`Invalid BAS account number: ${accountNumber}`)
  }

  const firstDigit = accountNumber.charAt(0)
  const firstTwo = parseInt(accountNumber.substring(0, 2), 10)
  const firstFour = parseInt(accountNumber.substring(0, 4), 10)

  if (firstDigit === '1') return 'asset'
  if (firstDigit === '2') {
    return firstTwo <= 20 ? 'equity' : 'liability'
  }
  if (firstDigit === '3') return 'income'
  if (firstDigit >= '4' && firstDigit <= '7') return 'cost'
  if (firstDigit === '8') {
    if (firstFour >= 8070 && firstFour <= 8089) return 'cost'
    if (firstFour <= 8399) return 'income'
    return 'cost'
  }

  throw new Error(`Cannot map account ${accountNumber} to SIE5 type`)
}
