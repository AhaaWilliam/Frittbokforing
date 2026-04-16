import type Database from 'better-sqlite3'
import { escapeLikePattern } from '../../shared/escape-like'
import { escapeFtsQuery } from '../../shared/escape-fts'
import type { IpcResult } from '../../shared/types'
import type { GlobalSearchResponse, SearchResult } from '../../shared/search-types'

interface SearchInput {
  query: string
  fiscal_year_id: number
  limit?: number
}

const STATUS_LABELS: Record<string, string> = {
  unpaid: 'obetald',
  partial: 'delvis betald',
  paid: 'betald',
  overdue: 'förfallen',
  credited: 'krediterad',
}

function formatOreKr(ore: number): string {
  const kr = Math.abs(ore) / 100
  return new Intl.NumberFormat('sv-SE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kr) + ' kr'
}

const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  1: 'Tillgångar',
  2: 'Skulder & EK',
  3: 'Intäkter',
  4: 'Kostnader',
  5: 'Kostnader',
  6: 'Kostnader',
  7: 'Kostnader',
  8: 'Finansiellt',
  9: 'Övrigt',
}

// ── FTS5 rebuild ─────────────────────────────────────────────────────

/**
 * Full rebuild of FTS5 search index. Called at startup (db.ts) and after
 * every write to searchable entities (counterparty, product, manual-entry,
 * correction). ~50ms for 5k rows.
 */
export function rebuildSearchIndex(db: Database.Database): void {
  db.transaction(() => {
    db.exec('DELETE FROM search_index')

    // Counterparties (active only)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, search_text)
      SELECT 'counterparty', id, name || ' ' || COALESCE(org_number, '')
      FROM counterparties WHERE is_active = 1
    `)

    // Products (active only)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, search_text)
      SELECT 'product', id, name
      FROM products WHERE is_active = 1
    `)

    // Accounts (active only)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, search_text)
      SELECT 'account', id, account_number || ' ' || name
      FROM accounts WHERE is_active = 1
    `)

    // Manual journal entries (booked/corrected, source_type='manual')
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, search_text)
      SELECT 'journal_entry', je.id,
        je.verification_series || ' ' || CAST(je.verification_number AS TEXT) || ' ' || je.description
      FROM journal_entries je
      WHERE je.status IN ('booked', 'corrected')
        AND je.source_type = 'manual'
    `)
  })()
}

// ── FTS5 search helpers ──────────────────────────────────────────────

type FtsEntityType = 'counterparty' | 'product' | 'account' | 'journal_entry'

/**
 * Attempt FTS5 MATCH query. Returns matched entity_ids or null if FTS5 unavailable.
 */
function ftsSearch(
  db: Database.Database,
  entityType: FtsEntityType,
  query: string,
  limit: number,
): number[] | null {
  try {
    const escaped = escapeFtsQuery(query)
    // Column-filter entity_type:X + phrase prefix match
    const matchExpr = `entity_type:${entityType} AND "${escaped}"*`
    const rows = db.prepare(`
      SELECT entity_id FROM search_index
      WHERE search_index MATCH ?
      LIMIT ?
    `).all(matchExpr, limit) as Array<{ entity_id: string }>
    return rows.map(r => Number(r.entity_id))
  } catch {
    // FTS5 table missing or corrupt — fall back to LIKE
    return null
  }
}

// ── Main search function ─────────────────────────────────────────────

export function globalSearch(
  db: Database.Database,
  input: SearchInput,
): IpcResult<GlobalSearchResponse> {
  const trimmed = input.query.trim()
  if (trimmed.length < 2) {
    return { success: true, data: { results: [], total_count: 0 } }
  }

  const pattern = '%' + escapeLikePattern(trimmed) + '%'
  const perLimit = input.limit ?? 50

  const results: SearchResult[] = []

  // --- Invoices (FY-scoped, LIKE only — not in FTS5 index) ---
  const invoiceRows = db.prepare(`
    SELECT i.id, i.invoice_number, i.total_amount_ore, i.status, cp.name AS cp_name
    FROM invoices i
    JOIN counterparties cp ON cp.id = i.counterparty_id
    WHERE i.fiscal_year_id = :fy
      AND i.status IN ('unpaid', 'paid', 'partial', 'overdue', 'credited')
      AND (lower_unicode(i.invoice_number) LIKE lower_unicode(:pattern) ESCAPE '!'
           OR lower_unicode(cp.name) LIKE lower_unicode(:pattern) ESCAPE '!')
    ORDER BY i.created_at DESC
    LIMIT :lim
  `).all({ fy: input.fiscal_year_id, pattern, lim: perLimit }) as Array<{
    id: number
    invoice_number: string
    total_amount_ore: number
    status: string
    cp_name: string
  }>

  for (const r of invoiceRows) {
    results.push({
      type: 'invoice',
      identifier: String(r.id),
      title: `#${r.invoice_number} — ${r.cp_name}`,
      subtitle: `${formatOreKr(r.total_amount_ore)} · ${STATUS_LABELS[r.status] ?? r.status}`,
      route: `/income/view/${r.id}`,
    })
  }

  // --- Expenses (FY-scoped, LIKE only — not in FTS5 index) ---
  const expenseRows = db.prepare(`
    SELECT e.id, e.supplier_invoice_number, e.description, e.total_amount_ore, e.status, cp.name AS cp_name
    FROM expenses e
    JOIN counterparties cp ON cp.id = e.counterparty_id
    WHERE e.fiscal_year_id = :fy
      AND e.status IN ('unpaid', 'paid', 'partial', 'overdue')
      AND (lower_unicode(e.supplier_invoice_number) LIKE lower_unicode(:pattern) ESCAPE '!'
           OR lower_unicode(e.description) LIKE lower_unicode(:pattern) ESCAPE '!'
           OR lower_unicode(cp.name) LIKE lower_unicode(:pattern) ESCAPE '!')
    ORDER BY e.created_at DESC
    LIMIT :lim
  `).all({ fy: input.fiscal_year_id, pattern, lim: perLimit }) as Array<{
    id: number
    supplier_invoice_number: string | null
    description: string
    total_amount_ore: number
    status: string
    cp_name: string
  }>

  for (const r of expenseRows) {
    const title = r.supplier_invoice_number
      ? `${r.supplier_invoice_number} — ${r.cp_name}`
      : `${r.description} — ${r.cp_name}`
    results.push({
      type: 'expense',
      identifier: String(r.id),
      title,
      subtitle: `${formatOreKr(r.total_amount_ore)} · ${STATUS_LABELS[r.status] ?? r.status}`,
      route: `/expenses/view/${r.id}`,
    })
  }

  // --- Customers (global, FTS5-first → LIKE fallback) ---
  const customerFtsIds = ftsSearch(db, 'counterparty', trimmed, perLimit * 2)
  if (customerFtsIds !== null) {
    // Filter FTS hits to customers only
    if (customerFtsIds.length > 0) {
      const placeholders = customerFtsIds.map(() => '?').join(',')
      const customerRows = db.prepare(`
        SELECT id, name, org_number FROM counterparties
        WHERE id IN (${placeholders})
          AND type IN ('customer', 'both')
          AND is_active = 1
        ORDER BY name ASC
        LIMIT ?
      `).all(...customerFtsIds, perLimit) as Array<{
        id: number; name: string; org_number: string | null
      }>
      for (const r of customerRows) {
        results.push({
          type: 'customer',
          identifier: String(r.id),
          title: r.name,
          subtitle: `Kund${r.org_number ? ` · ${r.org_number}` : ''}`,
          route: `/customers/${r.id}`,
        })
      }
    }
  } else {
    // LIKE fallback
    const customerRows = db.prepare(`
      SELECT id, name, org_number
      FROM counterparties
      WHERE type IN ('customer', 'both')
        AND is_active = 1
        AND (lower_unicode(name) LIKE lower_unicode(:pattern) ESCAPE '!'
             OR lower_unicode(org_number) LIKE lower_unicode(:pattern) ESCAPE '!')
      ORDER BY name ASC
      LIMIT :lim
    `).all({ pattern, lim: perLimit }) as Array<{
      id: number; name: string; org_number: string | null
    }>
    for (const r of customerRows) {
      results.push({
        type: 'customer',
        identifier: String(r.id),
        title: r.name,
        subtitle: `Kund${r.org_number ? ` · ${r.org_number}` : ''}`,
        route: `/customers/${r.id}`,
      })
    }
  }

  // --- Suppliers (global, FTS5-first → LIKE fallback) ---
  const supplierFtsIds = ftsSearch(db, 'counterparty', trimmed, perLimit * 2)
  if (supplierFtsIds !== null) {
    if (supplierFtsIds.length > 0) {
      const placeholders = supplierFtsIds.map(() => '?').join(',')
      const supplierRows = db.prepare(`
        SELECT id, name, org_number FROM counterparties
        WHERE id IN (${placeholders})
          AND type IN ('supplier', 'both')
          AND is_active = 1
        ORDER BY name ASC
        LIMIT ?
      `).all(...supplierFtsIds, perLimit) as Array<{
        id: number; name: string; org_number: string | null
      }>
      for (const r of supplierRows) {
        results.push({
          type: 'supplier',
          identifier: String(r.id),
          title: r.name,
          subtitle: `Leverantör${r.org_number ? ` · ${r.org_number}` : ''}`,
          route: `/suppliers/${r.id}`,
        })
      }
    }
  } else {
    const supplierRows = db.prepare(`
      SELECT id, name, org_number
      FROM counterparties
      WHERE type IN ('supplier', 'both')
        AND is_active = 1
        AND (lower_unicode(name) LIKE lower_unicode(:pattern) ESCAPE '!'
             OR lower_unicode(org_number) LIKE lower_unicode(:pattern) ESCAPE '!')
      ORDER BY name ASC
      LIMIT :lim
    `).all({ pattern, lim: perLimit }) as Array<{
      id: number; name: string; org_number: string | null
    }>
    for (const r of supplierRows) {
      results.push({
        type: 'supplier',
        identifier: String(r.id),
        title: r.name,
        subtitle: `Leverantör${r.org_number ? ` · ${r.org_number}` : ''}`,
        route: `/suppliers/${r.id}`,
      })
    }
  }

  // --- Products (global, FTS5-first → LIKE fallback) ---
  const productFtsIds = ftsSearch(db, 'product', trimmed, perLimit)
  if (productFtsIds !== null) {
    if (productFtsIds.length > 0) {
      const placeholders = productFtsIds.map(() => '?').join(',')
      const productRows = db.prepare(`
        SELECT id, name, default_price_ore, unit FROM products
        WHERE id IN (${placeholders}) AND is_active = 1
        ORDER BY name ASC LIMIT ?
      `).all(...productFtsIds, perLimit) as Array<{
        id: number; name: string; default_price_ore: number; unit: string
      }>
      for (const r of productRows) {
        results.push({
          type: 'product',
          identifier: String(r.id),
          title: r.name,
          subtitle: `${formatOreKr(r.default_price_ore)}/${r.unit}`,
          route: `/products/${r.id}`,
        })
      }
    }
  } else {
    const productRows = db.prepare(`
      SELECT id, name, default_price_ore, unit
      FROM products
      WHERE is_active = 1
        AND lower_unicode(name) LIKE lower_unicode(:pattern) ESCAPE '!'
      ORDER BY name ASC
      LIMIT :lim
    `).all({ pattern, lim: perLimit }) as Array<{
      id: number; name: string; default_price_ore: number; unit: string
    }>
    for (const r of productRows) {
      results.push({
        type: 'product',
        identifier: String(r.id),
        title: r.name,
        subtitle: `${formatOreKr(r.default_price_ore)}/${r.unit}`,
        route: `/products/${r.id}`,
      })
    }
  }

  // --- Accounts (global, FTS5-first → LIKE fallback) ---
  const accountFtsIds = ftsSearch(db, 'account', trimmed, perLimit)
  if (accountFtsIds !== null) {
    if (accountFtsIds.length > 0) {
      const placeholders = accountFtsIds.map(() => '?').join(',')
      const accountRows = db.prepare(`
        SELECT account_number, name FROM accounts
        WHERE id IN (${placeholders}) AND is_active = 1
        ORDER BY account_number ASC LIMIT ?
      `).all(...accountFtsIds, perLimit) as Array<{
        account_number: string; name: string
      }>
      for (const r of accountRows) {
        const cls = parseInt(r.account_number[0])
        const clsName = ACCOUNT_CLASS_NAMES[cls] ?? ''
        results.push({
          type: 'account',
          identifier: r.account_number,
          title: `${r.account_number} ${r.name}`,
          subtitle: `Klass ${cls} — ${clsName}`,
          route: `/account-statement?account=${r.account_number}`,
        })
      }
    }
  } else {
    const accountRows = db.prepare(`
      SELECT account_number, name
      FROM accounts
      WHERE is_active = 1
        AND (lower_unicode(account_number) LIKE lower_unicode(:pattern) ESCAPE '!'
             OR lower_unicode(name) LIKE lower_unicode(:pattern) ESCAPE '!')
      ORDER BY account_number ASC
      LIMIT :lim
    `).all({ pattern, lim: perLimit }) as Array<{
      account_number: string; name: string
    }>
    for (const r of accountRows) {
      const cls = parseInt(r.account_number[0])
      const clsName = ACCOUNT_CLASS_NAMES[cls] ?? ''
      results.push({
        type: 'account',
        identifier: r.account_number,
        title: `${r.account_number} ${r.name}`,
        subtitle: `Klass ${cls} — ${clsName}`,
        route: `/account-statement?account=${r.account_number}`,
      })
    }
  }

  // --- Manual journal entries (FY-scoped, FTS5-first → LIKE fallback) ---
  const verRefMatch = trimmed.match(/^([A-Za-zÅÄÖåäö]+)(\d+)$/)
  const isVerRef = verRefMatch ? 1 : 0
  const verSeries = verRefMatch ? verRefMatch[1].toUpperCase() : ''
  const verNum = verRefMatch ? parseInt(verRefMatch[2], 10) : 0

  // For journal entries, always use LIKE-based search which handles
  // verRef patterns (e.g. "C1" → series='C', number=1) correctly.
  // FTS5 tokenizes "C 1" as two tokens, making "C1" prefix search unreliable.
  let journalRows: Array<{
    id: number
    verification_number: number
    verification_series: string
    description: string
    journal_date: string
    status: string
    corrects_entry_id: number | null
    corrected_by_id: number | null
    manual_entry_id: number | null
    original_manual_entry_id: number | null
  }>

  {
    journalRows = db.prepare(`
      SELECT je.id, je.verification_number, je.verification_series,
             je.description, je.journal_date, je.status,
             je.corrects_entry_id, je.corrected_by_id,
             me.id AS manual_entry_id,
             orig_me.id AS original_manual_entry_id
      FROM journal_entries je
      LEFT JOIN manual_entries me ON me.journal_entry_id = je.id
      LEFT JOIN manual_entries orig_me ON orig_me.journal_entry_id = je.corrects_entry_id
      WHERE je.fiscal_year_id = :fy
        AND je.status IN ('booked', 'corrected')
        AND je.source_type = 'manual'
        AND (me.id IS NOT NULL OR orig_me.id IS NOT NULL)
        AND (
          lower_unicode(je.description) LIKE lower_unicode(:pattern) ESCAPE '!'
          OR (:is_ver_ref = 1
              AND je.verification_series = :ver_series
              AND je.verification_number = :ver_num)
        )
      ORDER BY je.journal_date DESC
      LIMIT :lim
    `).all({
      fy: input.fiscal_year_id,
      pattern,
      lim: perLimit,
      is_ver_ref: isVerRef,
      ver_series: verSeries,
      ver_num: verNum,
    }) as typeof journalRows
  }

  for (const r of journalRows) {
    const ref = `${r.verification_series}${r.verification_number}`
    let title = `${ref} — ${r.description}`
    if (r.corrected_by_id !== null) {
      title += ' (korrigerad)'
    }
    let subtitle = `${ref} · ${r.journal_date}`
    if (r.corrects_entry_id !== null) {
      subtitle += ' · korrigering'
    }

    const targetMeId = r.manual_entry_id ?? r.original_manual_entry_id
    if (targetMeId === null) continue
    const route = r.corrects_entry_id !== null
      ? `/manual-entries/view/${targetMeId}?highlight=${ref}`
      : `/manual-entries/view/${targetMeId}`

    results.push({
      type: 'journal_entry',
      identifier: String(r.id),
      title,
      subtitle,
      route,
    })
  }

  return {
    success: true,
    data: {
      results: results.slice(0, perLimit),
      total_count: results.length,
    },
  }
}
