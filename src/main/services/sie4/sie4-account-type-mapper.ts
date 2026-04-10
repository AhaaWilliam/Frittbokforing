/**
 * Maps BAS account numbers to SIE4 #KTYP values.
 * SIE4 types: T (Tillgång), S (Skuld), K (Kostnad), I (Intäkt)
 *
 * Eget kapital (20xx) klassas som S (skuld) i SIE4,
 * till skillnad från SIE5 som har separat 'equity'-typ.
 */
export type Sie4AccountType = 'T' | 'S' | 'K' | 'I'

export function mapSie4AccountType(accountNumber: string): Sie4AccountType {
  if (
    !accountNumber ||
    !/^\d+$/.test(accountNumber) ||
    accountNumber.length < 4
  ) {
    throw new Error(`Invalid BAS account number: ${accountNumber}`)
  }
  const firstDigit = accountNumber.charAt(0)
  const firstFour = parseInt(accountNumber.substring(0, 4), 10)

  if (firstDigit === '1') return 'T'
  if (firstDigit === '2') return 'S' // Både EK och skulder = S
  if (firstDigit === '3') return 'I'
  if (firstDigit >= '4' && firstDigit <= '7') return 'K'
  if (firstDigit === '8') {
    if (firstFour >= 8070 && firstFour <= 8089) return 'K'
    if (firstFour <= 8399) return 'I'
    return 'K'
  }
  throw new Error(`Cannot map account ${accountNumber} to SIE4 type`)
}
