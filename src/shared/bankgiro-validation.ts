/**
 * Bankgiro validation — Modulus 10 (Luhn) checksum.
 * Shared between IPC-schema (main) and form-schema (renderer).
 */

export function normalizeBankgiro(input: string): string {
  return input.replace(/-/g, '')
}

export function validateBankgiroChecksum(bankgiro: string): boolean {
  const digits = normalizeBankgiro(bankgiro)
  if (digits.length < 7 || digits.length > 8) return false
  if (!/^\d+$/.test(digits)) return false

  // Luhn algorithm (mod 10)
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = parseInt(digits[digits.length - 1 - i], 10)
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }

  return sum % 10 === 0
}
