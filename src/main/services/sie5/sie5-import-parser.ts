/**
 * SIE5 import parser — XML-based.
 *
 * Parses SIE5 XML files into the same `SieParseResult` shape that the SIE4
 * parser returns so that `validateSieParseResult`, `detectAccountConflicts`
 * och import-service kan återanvändas oförändrade.
 *
 * Elementstruktur (namespace http://www.sie.se/sie5):
 *   <Sie>
 *     <FileInfo>
 *       <SoftwareProduct name version />
 *       <FileCreation time by />
 *       <Company organizationId name />
 *       <FiscalYears>
 *         <FiscalYear start end primary? />
 *       </FiscalYears>
 *       <AccountingCurrency currency />
 *     </FileInfo>
 *     <Accounts>
 *       <Account id name type?>
 *         <OpeningBalance month amount />
 *         <ClosingBalance month amount />
 *       </Account>
 *     </Accounts>
 *     <Journal id name>
 *       <JournalEntry id journalDate text>
 *         <LedgerEntry accountId amount />
 *       </JournalEntry>
 *     </Journal>
 *   </Sie>
 *
 * Sign handling: `amount` är signerat decimaltal i kronor (t.ex. "100.00").
 * Positivt = debit, negativt = credit (samma konvention som SIE4 och spegling
 * av `debitCreditToSie5Amount` i exporten).
 *
 * OpeningBalance/ClosingBalance tolkas som `{month: "YYYY-MM"}`. Endast
 * första/sista månaden används för IB/UB (yearIndex 0), resterande blir
 * periodBalances.
 */
import { DOMParser } from '@xmldom/xmldom'
import { sie4AmountToOre } from '../sie4/sie4-amount-parser'
import type {
  SieAccount,
  SieBalance,
  SieEntry,
  SieHeader,
  SieParseResult,
  SiePeriodBalance,
  SieTransaction,
} from '../sie4/sie4-import-parser'

const SIE5_NS = 'http://www.sie.se/sie5'

/** Parse ett decimaltal i kronor (t.ex. "100.00" eller "-50.50") → öre. */
function sie5AmountToOre(raw: string): number {
  // Accept "," som decimalavgränsare (normalisera till ".")
  const normalized = raw.replace(',', '.')
  return sie4AmountToOre(normalized)
}

/** Hämta första child-element med givet local-name (ignorera namespace). */
function firstChild(el: Element, localName: string): Element | null {
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1 /* ELEMENT_NODE */) {
      const e = n as Element
      if (e.localName === localName || stripNs(e.nodeName) === localName)
        return e
    }
  }
  return null
}

/** Hämta alla child-element med givet local-name (ignorera namespace). */
function allChildren(el: Element, localName: string): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const n = el.childNodes[i]
    if (n.nodeType === 1) {
      const e = n as Element
      if (e.localName === localName || stripNs(e.nodeName) === localName)
        out.push(e)
    }
  }
  return out
}

function stripNs(name: string): string {
  const idx = name.indexOf(':')
  return idx >= 0 ? name.substring(idx + 1) : name
}

function attr(el: Element, name: string): string | null {
  const v = el.getAttribute(name)
  return v && v.length > 0 ? v : null
}

function buildEmptyHeader(): SieHeader {
  return {
    flagga: null,
    program: null,
    programVersion: null,
    format: 'SIE5',
    genDate: null,
    genSign: null,
    sieType: 5,
    prosa: null,
    companyType: null,
    fileNumber: null,
    orgNumber: null,
    companyName: null,
    chartOfAccountsType: null,
    currency: null,
    fiscalYears: [],
  }
}

export function parseSie5(input: Buffer | string): SieParseResult {
  const xml = typeof input === 'string' ? input : input.toString('utf8')
  const warnings: string[] = []

  const errors: string[] = []
  const parser = new DOMParser({
    onError: (level: 'warning' | 'error' | 'fatalError', msg: string) => {
      if (level === 'warning') warnings.push(`XML-varning: ${msg}`)
      else if (level === 'fatalError') errors.push(`XML-fatalt fel: ${msg}`)
      else errors.push(`XML-fel: ${msg}`)
    },
  })

  let doc: Document | null = null
  try {
    doc = parser.parseFromString(xml, 'text/xml') as unknown as Document
  } catch (err) {
    errors.push(
      `XML-parsningsfel: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const header = buildEmptyHeader()
  const accounts: SieAccount[] = []
  const openingBalances: SieBalance[] = []
  const closingBalances: SieBalance[] = []
  const periodBalances: SiePeriodBalance[] = []
  const results: SieBalance[] = []
  const entries: SieEntry[] = []

  const root = doc?.documentElement
  if (!root || errors.length > 0) {
    for (const e of errors) warnings.push(e)
    return {
      header,
      accounts,
      openingBalances,
      closingBalances,
      periodBalances,
      results,
      entries,
      checksum: { expected: null, computed: 0, valid: true },
      warnings,
    }
  }

  // Defensiv: acceptera både <Sie> och andra root-namn.
  if (root.localName !== 'Sie' && stripNs(root.nodeName) !== 'Sie') {
    warnings.push(`Förväntade root-elementet <Sie>, hittade <${root.nodeName}>`)
  }

  // ═══ FileInfo ═══
  const fileInfo = firstChild(root, 'FileInfo')
  if (fileInfo) {
    const sw = firstChild(fileInfo, 'SoftwareProduct')
    if (sw) {
      header.program = attr(sw, 'name')
      header.programVersion = attr(sw, 'version')
    }
    const fc = firstChild(fileInfo, 'FileCreation')
    if (fc) {
      const t = attr(fc, 'time')
      if (t) header.genDate = t.substring(0, 10)
      header.genSign = attr(fc, 'by')
    }
    const comp = firstChild(fileInfo, 'Company')
    if (comp) {
      header.companyName = attr(comp, 'name')
      header.orgNumber = attr(comp, 'organizationId')
    }
    const currencyEl = firstChild(fileInfo, 'AccountingCurrency')
    if (currencyEl) {
      header.currency = attr(currencyEl, 'currency')
    }
    const fys = firstChild(fileInfo, 'FiscalYears')
    if (fys) {
      const fyEls = allChildren(fys, 'FiscalYear')
      // Primärt räkenskapsår = index 0
      // Sortera: primary=true först, sedan i dokumentordning.
      const sorted = [...fyEls].sort((a, b) => {
        const pa = attr(a, 'primary') === 'true' ? 0 : 1
        const pb = attr(b, 'primary') === 'true' ? 0 : 1
        return pa - pb
      })
      sorted.forEach((fy, idx) => {
        const from = attr(fy, 'start')
        const to = attr(fy, 'end')
        if (from && to) {
          header.fiscalYears.push({ index: idx, from, to })
        }
      })
    }
  }

  // ═══ Accounts ═══
  const accountsEl = firstChild(root, 'Accounts')
  if (accountsEl) {
    for (const acctEl of allChildren(accountsEl, 'Account')) {
      const id = attr(acctEl, 'id')
      const name = attr(acctEl, 'name')
      if (!id) {
        warnings.push('Account utan id — hoppas över')
        continue
      }
      accounts.push({
        number: id,
        name: name ?? '',
        type: sie5TypeToSie4Type(attr(acctEl, 'type')),
      })

      // OpeningBalance/ClosingBalance (yearIndex = 0 för primärt FY)
      const obs = allChildren(acctEl, 'OpeningBalance')
      const cbs = allChildren(acctEl, 'ClosingBalance')

      if (obs.length > 0) {
        // Först i listan = IB för året
        const first = obs[0]
        const amount = sie5AmountToOre(attr(first, 'amount') ?? '0')
        openingBalances.push({
          yearIndex: 0,
          accountNumber: id,
          amountOre: amount,
        })
        // Alla OB som perioddata
        for (const ob of obs) {
          const month = attr(ob, 'month')
          if (month) {
            periodBalances.push({
              yearIndex: 0,
              period: month.replace('-', ''),
              accountNumber: id,
              amountOre: sie5AmountToOre(attr(ob, 'amount') ?? '0'),
            })
          }
        }
      }
      if (cbs.length > 0) {
        // Sist i listan = UB för året
        const last = cbs[cbs.length - 1]
        const amount = sie5AmountToOre(attr(last, 'amount') ?? '0')
        closingBalances.push({
          yearIndex: 0,
          accountNumber: id,
          amountOre: amount,
        })
      }
    }
  }

  // ═══ Journals ═══
  const journalEls = allChildren(root, 'Journal')
  for (const jEl of journalEls) {
    const series = attr(jEl, 'id') ?? 'I'
    const entryEls = allChildren(jEl, 'JournalEntry')
    for (const entryEl of entryEls) {
      const idStr = attr(entryEl, 'id') ?? '0'
      const num = parseInt(idStr, 10)
      const date = attr(entryEl, 'journalDate') ?? ''
      const text = attr(entryEl, 'text') ?? ''
      const info = firstChild(entryEl, 'EntryInfo')
      const regDate = info ? attr(info, 'date') : null

      const transactions: SieTransaction[] = []
      for (const led of allChildren(entryEl, 'LedgerEntry')) {
        transactions.push({
          accountNumber: attr(led, 'accountId') ?? '',
          amountOre: sie5AmountToOre(attr(led, 'amount') ?? '0'),
          date: null,
          text: attr(led, 'text'),
        })
      }

      entries.push({
        series,
        number: Number.isFinite(num) ? num : 0,
        date,
        description: text,
        regDate,
        transactions,
      })
    }
  }

  return {
    header,
    accounts,
    openingBalances,
    closingBalances,
    periodBalances,
    results,
    entries,
    // SIE5 har ingen KSUMMA — checksum-validering är alltid valid.
    checksum: { expected: null, computed: 0, valid: true },
    warnings,
  }
}

/** Mappa SIE5 account type → SIE4-enum (T/S/I/K) för kompatibilitet. */
function sie5TypeToSie4Type(t: string | null): string | null {
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower === 'asset') return 'T'
  if (lower === 'liability' || lower === 'equity') return 'S'
  if (lower === 'income' || lower === 'revenue') return 'I'
  if (lower === 'cost' || lower === 'expense') return 'K'
  return null
}
