/**
 * Property-based / fuzz-tester för SIE4-importen (M145).
 *
 * SIE4 är extern, otillförlitlig data — parsern är en genuin säkerhetsgräns.
 * Invarianter:
 *
 * 1. Parser avslutar alltid (ingen hang, ingen unhandled throw) för godtycklig
 *    Unicode-sträng ≤ 50KB.
 * 2. Parser är rent funktionell (idempotent, inga side effects).
 * 3. Amount-parser: strikt grammatik → heltal öre; ogiltig → NaN (aldrig Infinity).
 *    Round-trip via oreToSie4Amount är bijektiv.
 * 4. Checksum är deterministisk; identity-property gäller.
 * 5. Validator släpper inte igenom ogiltig data: obalanserat / icke-finita
 *    belopp → errors.length > 0, valid=false.
 * 6. Roundtrip på amount-nivå: slumpat verifikat i kanoniskt SIE4-format →
 *    parsa → samma struktur.
 *
 * Failing seed dokumenterad i fix-commit f7fa1ee:
 * amount-fält "abc" (eller "--5", "1.2.3", "1,50") bypassade E1-balanscheck
 * pga NaN-aritmetik. Fixad genom strikt regex i sie4-amount-parser och E6
 * non-finite-guard i validator.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import * as iconv from 'iconv-lite'
import { parseSie4 } from '../../src/main/services/sie4/sie4-import-parser'
import { validateSieParseResult } from '../../src/main/services/sie4/sie4-import-validator'
import { sie4AmountToOre } from '../../src/main/services/sie4/sie4-amount-parser'
import { oreToSie4Amount } from '../../src/main/services/sie4/sie4-amount'
import { calculateKsumma } from '../../src/main/services/sie4/sie4-checksum'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCp437Buffer(content: string): Buffer {
  return iconv.encode(content, 'cp437')
}

function buildSie4(lines: string[]): Buffer {
  return toCp437Buffer(lines.join('\r\n') + '\r\n')
}

// ─── 1. Parser-robusthet: avslutar alltid, kastar aldrig ─────────────────────

describe('SIE4 parser — robusthet mot godtycklig input (M145)', () => {
  it('parser kastar aldrig unhandled för godtycklig Unicode ≤ 50KB', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 50_000 }), (content) => {
        // Vitest default timeout (5s) fungerar som hang-guard.
        const buf = toCp437Buffer(content)
        expect(() => parseSie4(buf)).not.toThrow()
      }),
      { numRuns: 200 },
    )
  })

  it('parser kastar aldrig för godtyckliga rå bytes', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 0, maxLength: 10_000 }),
        (bytes) => {
          const buf = Buffer.from(bytes)
          expect(() => parseSie4(buf)).not.toThrow()
        },
      ),
      { numRuns: 200 },
    )
  })

  it('parser returnerar strukturellt giltigt resultat även för skräp-input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5_000 }), (content) => {
        const result = parseSie4(toCp437Buffer(content))
        return (
          Array.isArray(result.accounts) &&
          Array.isArray(result.entries) &&
          Array.isArray(result.warnings) &&
          Array.isArray(result.openingBalances) &&
          Array.isArray(result.closingBalances) &&
          typeof result.checksum.computed === 'number' &&
          Number.isFinite(result.checksum.computed)
        )
      }),
      { numRuns: 100 },
    )
  })
})

// ─── 2. Parser-idempotens (rent funktionell) ─────────────────────────────────

describe('SIE4 parser — idempotens', () => {
  it('parseSie4(x) === parseSie4(x) (strukturell likhet)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 5_000 }), (content) => {
        const buf = toCp437Buffer(content)
        const a = parseSie4(buf)
        const b = parseSie4(buf)
        // Djup strukturell jämförelse via JSON (inga funktioner/regex i resultat).
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }),
      { numRuns: 100 },
    )
  })
})

// ─── 3. Amount-parser invarianter ────────────────────────────────────────────

// Generator för strängar som matchar den strikta SIE4-amount-grammatiken.
const validAmountStringGen = fc
  .record({
    negative: fc.boolean(),
    krPart: fc.integer({ min: 0, max: 999_999_999 }).map((n) => n.toString()),
    decPart: fc.option(
      fc.integer({ min: 0, max: 99 }).map((n) => n.toString().padStart(2, '0')),
      { nil: null },
    ),
  })
  .map(({ negative, krPart, decPart }) => {
    const sign = negative ? '-' : ''
    return decPart === null ? `${sign}${krPart}` : `${sign}${krPart}.${decPart}`
  })

describe('sie4AmountToOre — grammatik-invarianter (M145)', () => {
  it('giltig amount-sträng ger finit heltal', () => {
    fc.assert(
      fc.property(validAmountStringGen, (s) => {
        const ore = sie4AmountToOre(s)
        return Number.isFinite(ore) && Number.isInteger(ore)
      }),
      { numRuns: 500 },
    )
  })

  it('round-trip: oreToSie4Amount(sie4AmountToOre(s)) bevarar numeriskt värde', () => {
    // För kanonisk form (2 decimaler eller inga) är round-tripen bijektiv.
    fc.assert(
      fc.property(
        fc.integer({ min: -99_999_999_999, max: 99_999_999_999 }),
        (ore) => {
          const s = oreToSie4Amount(ore)
          const back = sie4AmountToOre(s)
          return back === ore
        },
      ),
      { numRuns: 500 },
    )
  })

  it('ogiltig sträng returnerar NaN, aldrig Infinity', () => {
    // Arbitraries som garanterat bryter grammatiken.
    const invalidArb = fc.oneof(
      fc.constantFrom(
        'abc',
        '--5',
        '1.2.3',
        '1,50',
        '1 2',
        '+5',
        '5e10',
        '0x10',
        '-',
        '.',
        'NaN',
        'Infinity',
        '--',
        '..',
        '-.',
      ),
      // Godtycklig sträng som inte matchar regex — filtrera bort av misstag
      // giltiga strängar.
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => {
        const t = s.trim()
        if (t === '' || t === '0') return false
        return !/^-?(?:\d+\.?\d*|\.\d+)$/.test(t)
      }),
    )
    fc.assert(
      fc.property(invalidArb, (s) => {
        const r = sie4AmountToOre(s)
        // Specifikt: får aldrig vara Infinity eller -Infinity; NaN eller 0 ok.
        // Tom-sträng-fall ("") returnerar 0; alla andra invalida returnerar NaN.
        return r === 0 || Number.isNaN(r)
      }),
      { numRuns: 300 },
    )
  })

  it('returnerar aldrig Infinity eller -Infinity för godtycklig input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), (s) => {
        const r = sie4AmountToOre(s)
        return r !== Infinity && r !== -Infinity
      }),
      { numRuns: 500 },
    )
  })
})

// ─── 4. Checksum-determinism ─────────────────────────────────────────────────

describe('calculateKsumma — determinism (M145)', () => {
  it('samma content ger samma ksumma', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10_000 }), (content) => {
        const a = calculateKsumma(content)
        const b = calculateKsumma(content)
        return a === b && Number.isInteger(a)
      }),
      { numRuns: 200 },
    )
  })

  it('ksumma är alltid ett signed 32-bit heltal', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10_000 }), (content) => {
        const v = calculateKsumma(content)
        return Number.isInteger(v) && v >= -(2 ** 31) && v <= 2 ** 31 - 1
      }),
      { numRuns: 200 },
    )
  })
})

// ─── 5. Validator: släpper inte igenom ogiltig data (M145) ──────────────────

/**
 * Bygg en minimalistisk SIE4-fil med ett verifikat och valfri amount-sträng
 * för första TRANS-raden. Resten av verifikatet balanserar mot 500.00 kr.
 */
function buildVoucherWithAmountField(amountField: string): Buffer {
  return buildSie4([
    '#FLAGGA 0',
    '#PROGRAM "Test" "1.0"',
    '#FORMAT PC8',
    '#GEN 20250101 "x"',
    '#SIETYP 4',
    '#ORGNR 556036-0793',
    '#FNAMN "Test AB"',
    '#RAR 0 20250101 20251231',
    '#KPTYP BAS2014',
    '#KONTO 1910 "Kassa"',
    '#KONTO 3010 "Försäljning"',
    '#VER A 1 20250115 "Test"',
    '{',
    `#TRANS 1910 {} ${amountField}`,
    '#TRANS 3010 {} -500.00',
    '}',
  ])
}

describe('validator — catches NaN amounts (M145, tidigare bypass)', () => {
  // Detta är det konkreta failing seed från fuzzingen som orsakade
  // fix-commit f7fa1ee.
  it('ogiltig amount-syntax fångas av E6 (inte tyst bypassad som balanserad)', () => {
    const invalidAmounts = ['abc', '--5', '1.2.3', '1,50', '+5', '5e10', 'NaN']
    for (const bad of invalidAmounts) {
      const parsed = parseSie4(buildVoucherWithAmountField(bad))
      const v = validateSieParseResult(parsed)
      expect(v.valid, `expected invalid for amount="${bad}"`).toBe(false)
      const codes = v.errors.map((e) => e.code)
      expect(codes).toContain('E6')
    }
  })

  it('property: obalanserat verifikat → E1 eller E6', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1_000_000 }).chain((a) =>
          fc
            .integer({ min: 100, max: 1_000_000 })
            .filter((b) => Math.abs(a - b) > 1)
            .map((b) => [a, b] as const),
        ),
        ([debitKr, creditKr]) => {
          const parsed = parseSie4(
            buildSie4([
              '#FLAGGA 0',
              '#SIETYP 4',
              '#ORGNR 556036-0793',
              '#RAR 0 20250101 20251231',
              '#KONTO 1910 "Kassa"',
              '#KONTO 3010 "Försäljning"',
              '#VER A 1 20250115 "Test"',
              '{',
              `#TRANS 1910 {} ${debitKr}.00`,
              `#TRANS 3010 {} -${creditKr}.00`,
              '}',
            ]),
          )
          const v = validateSieParseResult(parsed)
          // Obalanserat → invalid med E1 eller E6 (beroende på input).
          const codes = v.errors.map((e) => e.code)
          return !v.valid && (codes.includes('E1') || codes.includes('E6'))
        },
      ),
      { numRuns: 50 },
    )
  })

  it('property: balanserat verifikat med giltiga belopp passerar balance-check', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100_000 }), (amountKr) => {
        const parsed = parseSie4(
          buildSie4([
            '#FLAGGA 0',
            '#SIETYP 4',
            '#ORGNR 556036-0793',
            '#RAR 0 20250101 20251231',
            '#KONTO 1910 "Kassa"',
            '#KONTO 3010 "Försäljning"',
            '#VER A 1 20250115 "Test"',
            '{',
            `#TRANS 1910 {} ${amountKr}.00`,
            `#TRANS 3010 {} -${amountKr}.00`,
            '}',
          ]),
        )
        const v = validateSieParseResult(parsed)
        // Får inte ha E1 eller E6.
        const codes = v.errors.map((e) => e.code)
        return !codes.includes('E1') && !codes.includes('E6')
      }),
      { numRuns: 100 },
    )
  })

  it('property: duplicerade konton fångas av E3', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('1910', '3010', '2640'),
        fc
          .string({ minLength: 1, maxLength: 20 })
          .filter((s) => !s.includes('"')),
        (acctNr, name) => {
          const parsed = parseSie4(
            buildSie4([
              '#FLAGGA 0',
              '#SIETYP 4',
              '#ORGNR 556036-0793',
              '#RAR 0 20250101 20251231',
              `#KONTO ${acctNr} "${name}"`,
              `#KONTO ${acctNr} "${name} kopia"`,
            ]),
          )
          const v = validateSieParseResult(parsed)
          return v.errors.some((e) => e.code === 'E3')
        },
      ),
      { numRuns: 30 },
    )
  })
})

// ─── 6. Roundtrip via amount-generator ───────────────────────────────────────

describe('roundtrip öre → SIE4-string → parse → öre (M145)', () => {
  it('oreToSie4Amount → parseSie4 → sie4AmountToOre bevarar värdet per rad', () => {
    // Generera ett balanserat par (debit, credit = -debit), formatera till
    // SIE4-strängar via oreToSie4Amount, parsa hela filen, och jämför att
    // transactions[0].amountOre === original.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99_999_999 }), (ore) => {
        const debitStr = oreToSie4Amount(ore)
        const creditStr = oreToSie4Amount(-ore)
        const parsed = parseSie4(
          buildSie4([
            '#FLAGGA 0',
            '#SIETYP 4',
            '#ORGNR 556036-0793',
            '#RAR 0 20250101 20251231',
            '#KONTO 1910 "Kassa"',
            '#KONTO 3010 "Försäljning"',
            '#VER A 1 20250115 "Test"',
            '{',
            `#TRANS 1910 {} ${debitStr}`,
            `#TRANS 3010 {} ${creditStr}`,
            '}',
          ]),
        )
        expect(parsed.entries).toHaveLength(1)
        expect(parsed.entries[0].transactions).toHaveLength(2)
        expect(parsed.entries[0].transactions[0].amountOre).toBe(ore)
        expect(parsed.entries[0].transactions[1].amountOre).toBe(-ore)
        const v = validateSieParseResult(parsed)
        // Balanserat → ingen E1/E6.
        expect(v.errors.find((e) => e.code === 'E1')).toBeUndefined()
        expect(v.errors.find((e) => e.code === 'E6')).toBeUndefined()
      }),
      { numRuns: 200 },
    )
  })
})
