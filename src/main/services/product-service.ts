import type Database from 'better-sqlite3'
import { escapeLikePattern } from '../../shared/escape-like'
import { safeRebuildSearchIndex } from './search-service'
import { buildUpdate } from '../utils/build-update'
import type {
  Product,
  CustomerPrice,
  PriceResult,
  IpcResult,
  ErrorCode,
} from '../../shared/types'
import {
  CreateProductInputSchema,
  UpdateProductInputSchema,
} from '../ipc-schemas'
import { validateWithZod } from './validate-with-zod'
import log from 'electron-log'
import type { z } from 'zod'

export function listProducts(
  db: Database.Database,
  input: {
    company_id: number
    search?: string
    type?: string
    active_only?: boolean
  },
): Product[] {
  let sql = 'SELECT * FROM products WHERE company_id = ?'
  const params: unknown[] = [input.company_id]

  if (input.active_only !== false) {
    sql += ' AND is_active = 1'
  }
  if (input.type) {
    sql += ' AND article_type = ?'
    params.push(input.type)
  }
  if (input.search) {
    sql += " AND (name LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')"
    const term = `%${escapeLikePattern(input.search)}%`
    params.push(term, term)
  }

  sql += ' ORDER BY name ASC'
  return db.prepare(sql).all(...params) as Product[]
}

export function getProduct(
  db: Database.Database,
  id: number,
  companyId?: number,
): (Product & { customer_prices: CustomerPrice[] }) | null {
  // companyId optional för intern bakåtkompatibilitet (post-INSERT-läsning).
  // IPC-handlern skickar alltid companyId — defense-in-depth-guard.
  const sql =
    companyId !== undefined
      ? 'SELECT * FROM products WHERE id = ? AND company_id = ?'
      : 'SELECT * FROM products WHERE id = ?'
  const params = companyId !== undefined ? [id, companyId] : [id]
  const product = db.prepare(sql).get(...params) as Product | undefined
  if (!product) return null

  // Customer prices är scopade via JOIN till counterparties+price_lists,
  // som båda tillhör samma bolag som produkten (defense-in-depth-trigger 046).
  const customerPrices = db
    .prepare(
      `SELECT pli.price_ore, cp.id AS counterparty_id, cp.name AS counterparty_name
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     JOIN counterparties cp ON cp.id = pl.counterparty_id
     WHERE pli.product_id = ?
     ORDER BY cp.name ASC`,
    )
    .all(id) as CustomerPrice[]

  return { ...product, customer_prices: customerPrices }
}

export function createProduct(
  db: Database.Database,
  input: unknown,
): IpcResult<Product> {
  // Fynd 8: validateWithZod kastar strukturerat fel vid ogiltig input.
  let data: z.infer<typeof CreateProductInputSchema>
  try {
    data = validateWithZod(CreateProductInputSchema, input)
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; error: string; field?: string }
      return { success: false, code: e.code as ErrorCode, error: e.error, ...(e.field ? { field: e.field } : {}) }
    }
    throw err
  }

  try {
    const result = db
      .prepare(
        `INSERT INTO products (company_id, name, description, unit, default_price_ore, vat_code_id, account_id, article_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.company_id,
        data.name,
        data.description ?? null,
        data.unit,
        data.default_price_ore,
        data.vat_code_id,
        data.account_id,
        data.article_type,
      )

    const product = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as Product

    safeRebuildSearchIndex(db)
    return { success: true, data: product }
  } catch (err) {
    log.error('[product-service] createProduct failed:', err)
    return {
      success: false,
      error: 'Kunde inte spara artikeln.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

const ALLOWED_PRODUCT_COLUMNS = new Set([
  'name',
  'description',
  'unit',
  'default_price_ore',
  'vat_code_id',
  'account_id',
  'article_type',
])

export function updateProduct(
  db: Database.Database,
  input: unknown,
): IpcResult<Product> {
  const parsed = UpdateProductInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
    }
  }
  const { id, company_id: companyId, ...data } = parsed.data

  const existing = db
    .prepare('SELECT * FROM products WHERE id = ? AND company_id = ?')
    .get(id, companyId) as Product | undefined
  if (!existing) {
    return {
      success: false,
      error: 'Artikeln hittades inte.',
      code: 'PRODUCT_NOT_FOUND',
    }
  }

  try {
    const built = buildUpdate(
      db,
      'products',
      data as Record<string, unknown>,
      { allowedColumns: ALLOWED_PRODUCT_COLUMNS, touchUpdatedAt: true },
    )
    if (built) built.run('id = ? AND company_id = ?', [id, companyId])

    const updated = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as Product
    safeRebuildSearchIndex(db)
    return { success: true, data: updated }
  } catch (err) {
    log.error('[product-service] updateProduct failed:', err)
    return {
      success: false,
      error: 'Kunde inte uppdatera artikeln.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function deactivateProduct(
  db: Database.Database,
  id: number,
  companyId: number,
): IpcResult<Product> {
  const existing = db
    .prepare('SELECT * FROM products WHERE id = ? AND company_id = ?')
    .get(id, companyId) as Product | undefined
  if (!existing) {
    return {
      success: false,
      error: 'Artikeln hittades inte.',
      code: 'PRODUCT_NOT_FOUND',
    }
  }

  try {
    db.prepare(
      "UPDATE products SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ? AND company_id = ?",
    ).run(id, companyId)
    const updated = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as Product
    return { success: true, data: updated }
  } catch (err) {
    log.error('[product-service] deactivateProduct failed:', err)
    return {
      success: false,
      error: 'Kunde inte inaktivera artikeln.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function setCustomerPrice(
  db: Database.Database,
  input: {
    company_id: number
    product_id: number
    counterparty_id: number
    price_ore: number
  },
): IpcResult<CustomerPrice> {
  try {
    return db.transaction(() => {
      // Kund + produkt MÅSTE tillhöra samma bolag som anropet — verifieras
      // explicit för tydligare felmeddelande än trigger 046:s ABORT.
      const cp = db
        .prepare(
          'SELECT name FROM counterparties WHERE id = ? AND company_id = ?',
        )
        .get(input.counterparty_id, input.company_id) as
        | { name: string }
        | undefined
      if (!cp) {
        return {
          success: false as const,
          error: 'Kunden hittades inte.',
          code: 'COUNTERPARTY_NOT_FOUND' as const,
        }
      }
      const prod = db
        .prepare('SELECT 1 FROM products WHERE id = ? AND company_id = ?')
        .get(input.product_id, input.company_id)
      if (!prod) {
        return {
          success: false as const,
          error: 'Artikeln hittades inte.',
          code: 'PRODUCT_NOT_FOUND' as const,
        }
      }

      let priceList = db
        .prepare(
          'SELECT id FROM price_lists WHERE counterparty_id = ? AND company_id = ?',
        )
        .get(input.counterparty_id, input.company_id) as
        | { id: number }
        | undefined

      if (!priceList) {
        const result = db
          .prepare(
            'INSERT INTO price_lists (company_id, name, is_default, counterparty_id) VALUES (?, ?, 0, ?)',
          )
          .run(input.company_id, `Prislista ${cp.name}`, input.counterparty_id)
        priceList = { id: Number(result.lastInsertRowid) }
      }

      db.prepare(
        `INSERT INTO price_list_items (price_list_id, product_id, price_ore)
         VALUES (?, ?, ?)
         ON CONFLICT(price_list_id, product_id)
         DO UPDATE SET price_ore = excluded.price_ore`,
      ).run(priceList.id, input.product_id, input.price_ore)

      return {
        success: true as const,
        data: {
          counterparty_id: input.counterparty_id,
          counterparty_name: cp.name,
          price_ore: input.price_ore,
        },
      }
    })()
  } catch (err) {
    log.error('[product-service] setCustomerPrice failed:', err)
    return {
      success: false,
      error: 'Kunde inte spara kundpriset.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function removeCustomerPrice(
  db: Database.Database,
  input: { company_id: number; product_id: number; counterparty_id: number },
): IpcResult<undefined> {
  try {
    const priceList = db
      .prepare(
        'SELECT id FROM price_lists WHERE counterparty_id = ? AND company_id = ?',
      )
      .get(input.counterparty_id, input.company_id) as
      | { id: number }
      | undefined

    if (!priceList) {
      return { success: true, data: undefined }
    }

    db.prepare(
      'DELETE FROM price_list_items WHERE price_list_id = ? AND product_id = ?',
    ).run(priceList.id, input.product_id)

    return { success: true, data: undefined }
  } catch (err) {
    log.error('[product-service] removeCustomerPrice failed:', err)
    return {
      success: false,
      error: 'Kunde inte ta bort kundpriset.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function getPriceForCustomer(
  db: Database.Database,
  input: { company_id: number; product_id: number; counterparty_id: number },
): PriceResult {
  const customerPrice = db
    .prepare(
      `SELECT pli.price_ore
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pl.counterparty_id = ? AND pli.product_id = ? AND pl.company_id = ?`,
    )
    .get(input.counterparty_id, input.product_id, input.company_id) as
    | { price_ore: number }
    | undefined

  if (customerPrice) {
    return { price_ore: customerPrice.price_ore, source: 'customer' }
  }

  const product = db
    .prepare(
      'SELECT default_price_ore FROM products WHERE id = ? AND company_id = ?',
    )
    .get(input.product_id, input.company_id) as
    | { default_price_ore: number }
    | undefined

  return { price_ore: product?.default_price_ore ?? 0, source: 'default' }
}
