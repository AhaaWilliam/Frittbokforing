// K2 (BFNAR 2016:10) report line mapping — static configuration
// M33: Account ranges → K2 headings via numerisk prefix-jämförelse

// ═══ Types ═══

export interface AccountRange {
  from: string // 4-digit inclusive, e.g. "3000"
  to: string // 4-digit inclusive, e.g. "3699"
}

export interface ReportLine {
  id: string
  label: string
  ranges: AccountRange[]
  signMultiplier: 1 | -1
}

export interface ReportGroup {
  id: string
  label: string
  lines: ReportLine[]
}

// ═══ Matching ═══

/**
 * Numerisk prefix-jämförelse (4 första siffrorna).
 * - Framtidssäkert för 5-siffriga underkonton (t.ex. 37991 → prefix 3799)
 * - Säkert mot edge cases med <4-siffriga konton (t.ex. "99" → 9900)
 */
export function matchesRanges(
  accountNumber: string,
  ranges: AccountRange[],
): boolean {
  const prefixInt = parseInt(accountNumber.substring(0, 4).padEnd(4, '0'), 10)
  return ranges.some((r) => {
    const fromInt = parseInt(r.from, 10)
    const toInt = parseInt(r.to, 10)
    return prefixInt >= fromInt && prefixInt <= toInt
  })
}

// ═══ Validation ═══

function rangesOverlap(a: AccountRange, b: AccountRange): boolean {
  const aFrom = parseInt(a.from, 10)
  const aTo = parseInt(a.to, 10)
  const bFrom = parseInt(b.from, 10)
  const bTo = parseInt(b.to, 10)
  return aFrom <= bTo && bFrom <= aTo
}

export function validateNoOverlap(configs: ReportGroup[][]): void {
  const allRanges: { lineId: string; range: AccountRange }[] = []
  for (const config of configs) {
    for (const group of config) {
      for (const line of group.lines) {
        for (const range of line.ranges) {
          for (const existing of allRanges) {
            if (rangesOverlap(range, existing.range)) {
              throw new Error(
                `Overlap between ${line.id} and ${existing.lineId}`,
              )
            }
          }
          allRanges.push({ lineId: line.id, range })
        }
      }
    }
  }
}

export function validateAllAccountsCovered(
  accounts: string[],
  configs: ReportGroup[][],
): string[] {
  const allLines = configs.flatMap((c) => c.flatMap((g) => g.lines))
  return accounts.filter(
    (acc) => !allLines.some((line) => matchesRanges(acc, line.ranges)),
  )
}

// ═══ Resultaträkning (Income Statement) — K2 ═══

export const INCOME_STATEMENT_CONFIG: ReportGroup[] = [
  {
    id: 'operating_income',
    label: 'Rörelseintäkter',
    lines: [
      {
        id: 'net_revenue',
        label: 'Nettoomsättning',
        ranges: [{ from: '3000', to: '3799' }],
        signMultiplier: 1,
      },
      {
        id: 'other_operating_income',
        label: 'Övriga rörelseintäkter',
        ranges: [{ from: '3800', to: '3999' }],
        signMultiplier: 1,
      },
    ],
  },
  {
    id: 'operating_expenses',
    label: 'Rörelsekostnader',
    lines: [
      {
        id: 'materials',
        label: 'Råvaror och förnödenheter',
        ranges: [{ from: '4000', to: '4999' }],
        signMultiplier: -1,
      },
      {
        id: 'other_external',
        label: 'Övriga externa kostnader',
        ranges: [{ from: '5000', to: '6999' }],
        signMultiplier: -1,
      },
      {
        id: 'personnel',
        label: 'Personalkostnader',
        ranges: [{ from: '7000', to: '7699' }],
        signMultiplier: -1,
      },
      {
        id: 'depreciation',
        label: 'Av- och nedskrivningar',
        ranges: [{ from: '7700', to: '7899' }],
        signMultiplier: -1,
      },
      {
        id: 'other_operating_expenses',
        label: 'Övriga rörelsekostnader',
        ranges: [{ from: '7900', to: '7999' }],
        signMultiplier: -1,
      },
    ],
  },
  {
    id: 'financial_items',
    label: 'Finansiella poster',
    lines: [
      {
        id: 'financial_income',
        label: 'Övriga ränteintäkter och liknande resultatposter',
        ranges: [{ from: '8000', to: '8399' }],
        signMultiplier: 1,
      },
      {
        id: 'financial_expenses',
        label: 'Räntekostnader och liknande resultatposter',
        ranges: [{ from: '8400', to: '8799' }],
        signMultiplier: -1,
      },
    ],
  },
  {
    id: 'appropriations_and_tax',
    label: 'Bokslutsdispositioner och skatt',
    lines: [
      {
        id: 'appropriations',
        label: 'Bokslutsdispositioner',
        ranges: [{ from: '8800', to: '8899' }],
        signMultiplier: -1,
      },
      {
        id: 'tax',
        label: 'Skatt på årets resultat',
        ranges: [{ from: '8900', to: '8999' }],
        signMultiplier: -1,
      },
    ],
  },
]

// ═══ Config Invariant Validation ═══

export function validateResultConfigInvariants(config: ReportGroup[]): void {
  // 1. Hela intervallet 3000–8999 ska vara täckt utan luckor
  const ranges = config.flatMap((g) => g.lines.flatMap((l) => l.ranges))
  const sortedRanges = [...ranges].sort(
    (a, b) => parseInt(a.from, 10) - parseInt(b.from, 10),
  )
  let expectedFrom = 3000
  for (const r of sortedRanges) {
    const from = parseInt(r.from, 10)
    const to = parseInt(r.to, 10)
    if (from !== expectedFrom) {
      throw new Error(
        `INCOME_STATEMENT_CONFIG coverage gap: expected ${expectedFrom}, got ${from}`,
      )
    }
    expectedFrom = to + 1
  }
  if (expectedFrom !== 9000) {
    throw new Error(
      `INCOME_STATEMENT_CONFIG does not cover up to 8999 (ends at ${expectedFrom - 1})`,
    )
  }

  // 2. signMultiplier-konsistens per grupp-id
  const expectedSigns: Record<string, 1 | -1> = {
    operating_income: 1,
    operating_expenses: -1,
    // NOTE: Skip financial_items — contains mixed signs (income +1, expenses -1)
    appropriations_and_tax: -1,
  }
  for (const group of config) {
    if (group.id === 'financial_items') continue
    const expected = expectedSigns[group.id]
    if (expected === undefined) continue
    for (const line of group.lines) {
      if (line.signMultiplier !== expected) {
        throw new Error(
          `INCOME_STATEMENT_CONFIG sign mismatch: group ${group.id} line ${line.id} has signMultiplier ${line.signMultiplier}, expected ${expected}`,
        )
      }
    }
  }
}

// ═══ Balansräkning (Balance Sheet) — K2 ═══

export const BALANCE_SHEET_ASSETS_CONFIG: ReportGroup[] = [
  {
    id: 'fixed_assets',
    label: 'Anläggningstillgångar',
    lines: [
      {
        id: 'intangible',
        label: 'Immateriella anläggningstillgångar',
        ranges: [{ from: '1000', to: '1099' }],
        signMultiplier: -1,
      },
      {
        id: 'tangible',
        label: 'Materiella anläggningstillgångar',
        ranges: [{ from: '1100', to: '1299' }],
        signMultiplier: -1,
      },
      {
        id: 'financial_fixed',
        label: 'Finansiella anläggningstillgångar',
        ranges: [{ from: '1300', to: '1399' }],
        signMultiplier: -1,
      },
    ],
  },
  {
    id: 'current_assets',
    label: 'Omsättningstillgångar',
    lines: [
      {
        id: 'inventory',
        label: 'Varulager m.m.',
        ranges: [{ from: '1400', to: '1499' }],
        signMultiplier: -1,
      },
      {
        id: 'short_term_receivables',
        label: 'Kortfristiga fordringar',
        ranges: [{ from: '1500', to: '1799' }],
        signMultiplier: -1,
      },
      {
        id: 'short_term_investments',
        label: 'Kortfristiga placeringar',
        ranges: [{ from: '1800', to: '1899' }],
        signMultiplier: -1,
      },
      {
        id: 'cash_and_bank',
        label: 'Kassa och bank',
        ranges: [{ from: '1900', to: '1999' }],
        signMultiplier: -1,
      },
    ],
  },
]

export const BALANCE_SHEET_EQUITY_CONFIG: ReportGroup[] = [
  {
    id: 'equity',
    label: 'Eget kapital',
    lines: [
      {
        id: 'restricted_equity',
        label: 'Bundet eget kapital',
        ranges: [{ from: '2000', to: '2089' }],
        signMultiplier: 1,
      },
      {
        id: 'unrestricted_equity',
        label: 'Fritt eget kapital',
        ranges: [{ from: '2090', to: '2099' }],
        signMultiplier: 1,
      },
      // "Årets resultat" added dynamically in report-service
    ],
  },
  {
    id: 'untaxed_reserves',
    label: 'Obeskattade reserver',
    lines: [
      {
        id: 'untaxed',
        label: 'Periodiseringsfonder m.m.',
        ranges: [{ from: '2100', to: '2199' }],
        signMultiplier: 1,
      },
    ],
  },
  {
    id: 'provisions',
    label: 'Avsättningar',
    lines: [
      {
        id: 'provisions',
        label: 'Avsättningar',
        ranges: [{ from: '2200', to: '2299' }],
        signMultiplier: 1,
      },
    ],
  },
  {
    id: 'long_term_liabilities',
    label: 'Långfristiga skulder',
    lines: [
      {
        id: 'long_term',
        label: 'Långfristiga skulder',
        ranges: [{ from: '2300', to: '2399' }],
        signMultiplier: 1,
      },
    ],
  },
  {
    id: 'short_term_liabilities',
    label: 'Kortfristiga skulder',
    lines: [
      {
        id: 'accounts_payable',
        label: 'Leverantörsskulder',
        ranges: [{ from: '2400', to: '2499' }],
        signMultiplier: 1,
      },
      {
        id: 'tax_liabilities',
        label: 'Skatteskulder',
        ranges: [{ from: '2500', to: '2599' }],
        signMultiplier: 1,
      },
      {
        id: 'other_short_term',
        label: 'Övriga kortfristiga skulder',
        ranges: [{ from: '2600', to: '2999' }],
        signMultiplier: 1,
      },
    ],
  },
]
