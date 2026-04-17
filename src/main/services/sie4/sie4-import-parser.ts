/**
 * SIE4 import parser — line-based tokenizer.
 * Parses CP437-encoded SIE4 files into structured data.
 * Defensiv: unknown records → warning, not error.
 */
import * as iconv from 'iconv-lite'
import { sie4AmountToOre } from './sie4-amount-parser'
import { calculateKsumma } from './sie4-checksum'

// ═══ Types ═══

export interface SieHeader {
  flagga: number | null
  program: string | null
  programVersion: string | null
  format: string | null
  genDate: string | null
  genSign: string | null
  sieType: number | null
  prosa: string | null
  companyType: string | null
  fileNumber: string | null
  orgNumber: string | null
  companyName: string | null
  chartOfAccountsType: string | null
  currency: string | null
  fiscalYears: Array<{ index: number; from: string; to: string }>
}

export interface SieAccount {
  number: string
  name: string
  type: string | null // T, S, K, I
}

export interface SieBalance {
  yearIndex: number
  accountNumber: string
  amountOre: number
}

export interface SiePeriodBalance {
  yearIndex: number
  period: string // YYYYMM
  accountNumber: string
  amountOre: number
}

export interface SieTransaction {
  accountNumber: string
  amountOre: number
  date: string | null
  text: string | null
}

export interface SieEntry {
  series: string
  number: number
  date: string
  description: string
  regDate: string | null
  transactions: SieTransaction[]
}

export interface SieParseResult {
  header: SieHeader
  accounts: SieAccount[]
  openingBalances: SieBalance[]
  closingBalances: SieBalance[]
  periodBalances: SiePeriodBalance[]
  results: SieBalance[]
  entries: SieEntry[]
  checksum: { expected: number | null; computed: number; valid: boolean }
  warnings: string[]
}

// ═══ Tokenizer helpers ═══

/** Parse a single SIE4 field — handles quoted strings with escapes. */
function parseFields(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i < line.length) {
    // Skip whitespace
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
    if (i >= line.length) break

    if (line[i] === '"') {
      // Quoted string
      i++ // skip opening quote
      let str = ''
      while (i < line.length) {
        if (line[i] === '\\' && i + 1 < line.length) {
          str += line[i + 1]
          i += 2
        } else if (line[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          str += line[i]
          i++
        }
      }
      fields.push(str)
    } else if (line[i] === '{') {
      fields.push('{}')
      i++
      // Skip to matching }
      while (i < line.length && line[i] !== '}') i++
      if (i < line.length) i++ // skip }
    } else {
      // Unquoted field
      let start = i
      while (i < line.length && line[i] !== ' ' && line[i] !== '\t') i++
      fields.push(line.substring(start, i))
    }
  }
  return fields
}

/** Convert SIE4 date (YYYYMMDD) to ISO (YYYY-MM-DD). */
function sieDate(d: string): string {
  if (d.length === 8)
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
  return d
}

// ═══ Main parser ═══

export function parseSie4(buffer: Buffer): SieParseResult {
  // Decode CP437 → UTF-8
  const content = iconv.decode(buffer, 'cp437')

  // Normalize line endings
  const rawLines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const header: SieHeader = {
    flagga: null,
    program: null,
    programVersion: null,
    format: null,
    genDate: null,
    genSign: null,
    sieType: null,
    prosa: null,
    companyType: null,
    fileNumber: null,
    orgNumber: null,
    companyName: null,
    chartOfAccountsType: null,
    currency: null,
    fiscalYears: [],
  }

  const accounts: SieAccount[] = []
  const accountTypes = new Map<string, string>()
  const openingBalances: SieBalance[] = []
  const closingBalances: SieBalance[] = []
  const periodBalances: SiePeriodBalance[] = []
  const results: SieBalance[] = []
  const entries: SieEntry[] = []
  const warnings: string[] = []

  let ksummaValue: number | null = null
  let currentEntry: SieEntry | null = null

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim()
    if (!line || line.startsWith('//')) continue

    // Inside VER block
    if (currentEntry && line === '}') {
      entries.push(currentEntry)
      currentEntry = null
      continue
    }

    if (currentEntry) {
      if (line.startsWith('#TRANS')) {
        const fields = parseFields(line.substring(6))
        currentEntry.transactions.push({
          accountNumber: fields[0] ?? '',
          amountOre: sie4AmountToOre(
            fields[1] === '{}' ? (fields[2] ?? '0') : (fields[1] ?? '0'),
          ),
          date: fields[3] ? sieDate(fields[3]) : null,
          text: fields[4] ?? null,
        })
      }
      continue
    }

    // Record dispatch
    if (line.startsWith('#')) {
      const spaceIdx = line.indexOf(' ')
      const record = spaceIdx > 0 ? line.substring(0, spaceIdx) : line
      const rest = spaceIdx > 0 ? line.substring(spaceIdx + 1) : ''
      const fields = rest ? parseFields(rest) : []

      switch (record) {
        case '#FLAGGA':
          header.flagga = parseInt(fields[0] ?? '0', 10)
          break
        case '#PROGRAM':
          header.program = fields[0] ?? null
          header.programVersion = fields[1] ?? null
          break
        case '#FORMAT':
          header.format = fields[0] ?? null
          break
        case '#GEN':
          header.genDate = fields[0] ? sieDate(fields[0]) : null
          header.genSign = fields[1] ?? null
          break
        case '#SIETYP':
          header.sieType = parseInt(fields[0] ?? '4', 10)
          break
        case '#PROSA':
          header.prosa = fields[0] ?? null
          break
        case '#FTYP':
          header.companyType = fields[0] ?? null
          break
        case '#FNR':
          header.fileNumber = fields[0] ?? null
          break
        case '#ORGNR':
          header.orgNumber = fields[0] ?? null
          break
        case '#FNAMN':
          header.companyName = fields[0] ?? null
          break
        case '#RAR': {
          const idx = parseInt(fields[0] ?? '0', 10)
          header.fiscalYears.push({
            index: idx,
            from: fields[1] ? sieDate(fields[1]) : '',
            to: fields[2] ? sieDate(fields[2]) : '',
          })
          break
        }
        case '#KPTYP':
          header.chartOfAccountsType = fields[0] ?? null
          break
        case '#VALUTA':
          header.currency = fields[0] ?? null
          break
        case '#KONTO':
          accounts.push({
            number: fields[0] ?? '',
            name: fields[1] ?? '',
            type: null,
          })
          break
        case '#KTYP':
          accountTypes.set(fields[0] ?? '', fields[1] ?? '')
          break
        case '#IB':
          openingBalances.push({
            yearIndex: parseInt(fields[0] ?? '0', 10),
            accountNumber: fields[1] ?? '',
            amountOre: sie4AmountToOre(fields[2] ?? '0'),
          })
          break
        case '#UB':
          closingBalances.push({
            yearIndex: parseInt(fields[0] ?? '0', 10),
            accountNumber: fields[1] ?? '',
            amountOre: sie4AmountToOre(fields[2] ?? '0'),
          })
          break
        case '#RES':
          results.push({
            yearIndex: parseInt(fields[0] ?? '0', 10),
            accountNumber: fields[1] ?? '',
            amountOre: sie4AmountToOre(fields[2] ?? '0'),
          })
          break
        case '#PSALDO': {
          const yi = parseInt(fields[0] ?? '0', 10)
          const period = fields[1] ?? ''
          const acct = fields[2] ?? ''
          // fields[3] is {} (dimensioner), fields[4] is amount
          const amt =
            fields[3] === '{}' ? (fields[4] ?? '0') : (fields[3] ?? '0')
          periodBalances.push({
            yearIndex: yi,
            period,
            accountNumber: acct,
            amountOre: sie4AmountToOre(amt),
          })
          break
        }
        case '#VER': {
          const series = fields[0] ?? ''
          const num = parseInt(fields[1] ?? '0', 10)
          const date = fields[2] ? sieDate(fields[2]) : ''
          const desc = fields[3] ?? ''
          const regDate = fields[4] ? sieDate(fields[4]) : null
          currentEntry = {
            series,
            number: num,
            date,
            description: desc,
            regDate,
            transactions: [],
          }
          // Skip '{' on next line or same line
          break
        }
        case '#KSUMMA':
          ksummaValue = parseInt(fields[0] ?? '0', 10)
          break
        default:
          if (record.startsWith('#') && record !== '{' && record !== '}') {
            warnings.push(`Okänd post: ${record} (rad ${i + 1})`)
          }
          break
      }
    }
  }

  // Merge KTYP into accounts
  for (const acc of accounts) {
    acc.type = accountTypes.get(acc.number) ?? null
  }

  // Compute KSUMMA
  // Need original content without #KSUMMA line, preserving CRLF
  const contentForChecksum = buildChecksumContent(content)
  const computedKsumma = calculateKsumma(contentForChecksum)

  const checksumValid =
    ksummaValue === null ? true : ksummaValue === computedKsumma

  return {
    header,
    accounts,
    openingBalances,
    closingBalances,
    periodBalances,
    results,
    entries,
    checksum: {
      expected: ksummaValue,
      computed: computedKsumma,
      valid: checksumValid,
    },
    warnings,
  }
}

/** Build content for KSUMMA verification: original CRLF content minus #KSUMMA line. */
function buildChecksumContent(fullContent: string): string {
  // Ensure CRLF
  const crlf = fullContent.includes('\r\n')
    ? fullContent
    : fullContent.replace(/\n/g, '\r\n')

  const lines = crlf.split('\r\n')
  const filtered = lines.filter((l) => !l.trim().startsWith('#KSUMMA'))
  return filtered.join('\r\n')
}
