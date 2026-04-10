/**
 * Beräkna OCR-nummer med Luhn-algoritm (mod 10).
 * Input: fakturanummer som sträng (t.ex. "A0001").
 * Steg: strippa icke-siffror → nollpadda till minst 4 siffror → Luhn kontrollsiffra → returnera siffror + kontrollsiffra.
 *
 * Luhn-algoritm för att SKAPA kontrollsiffra:
 * 1. Iterera bakifrån (höger→vänster) genom befintliga siffror
 * 2. Sista befintliga siffran (längst till höger) DUBBLERAS alltid
 * 3. Varannan siffra bakåt dubbleras (toggle)
 * 4. Om dubblat tal > 9, subtrahera 9
 * 5. Summera alla siffror
 * 6. Kontrollsiffra = (10 - (summa % 10)) % 10
 *
 * Golden reference: "0001" → kontrollsiffra 8 → OCR "00018"
 */
export function calculateOCR(invoiceNumber: string): string {
  // Strippa alla icke-siffror
  const digits = invoiceNumber.replace(/\D/g, '')
  // Nollpadda till minst 4 siffror
  const padded = digits.padStart(4, '0')

  // Luhn-beräkning — iterera baklänges med boolean toggle
  // double=true för sista befintliga siffran (den hamnar på pos 2 räknat från kontrollsiffran)
  let sum = 0
  let double = true
  for (let i = padded.length - 1; i >= 0; i--) {
    let digit = parseInt(padded[i], 10)
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  const checkDigit = (10 - (sum % 10)) % 10

  return padded + checkDigit.toString()
}
