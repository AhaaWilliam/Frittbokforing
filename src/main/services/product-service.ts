import type Database from 'better-sqlite3'
import { escapeLikePattern } from '../../shared/escape-like'
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
import log from 'electron-log'

export function listProducts(
  db: Database.Database,
  input: { search?: string; type?: string; active_only?: boolean },
): Product[] {
  let sql = 'SELECT * FROM products WHERE 1=1'
  const params: unknown[] = []

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
): (Product & { customer_prices: CustomerPrice[] }) | null {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Product
    | undefined
  if (!product) return null

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
  const parsed = CreateProductInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
    }
  }
  const data = parsed.data

  try {
    const result = db
      .prepare(
        `INSERT INTO products (name, description, unit, default_price_ore, vat_code_id, account_id, article_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
  const { id, ...data } = parsed.data

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Product
    | undefined
  if (!existing) {
    return {
      success: false,
      error: 'Artikeln hittades inte.',
      code: 'PRODUCT_NOT_FOUND',
    }
  }

  try {
    const sets: string[] = []
    const params: unknown[] = []

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && ALLOWED_PRODUCT_COLUMNS.has(key)) {
        sets.push(`${key} = ?`)
        params.push(value ?? null)
      }
    }

    if (sets.length > 0) {
      sets.push("updated_at = datetime('now','localtime')")
      params.push(id)
      db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = ?`).run(
        ...params,
      )
    }

    const updated = db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as Product
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
): IpcResult<Product> {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Product
    | undefined
  if (!existing) {
    return {
      success: false,
      error: 'Artikeln hittades inte.',
      code: 'PRODUCT_NOT_FOUND',
    }
  }

  try {
    db.prepare(
      "UPDATE products SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?",
    ).run(id)
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
  input: { product_id: number; counterparty_id: number; price_ore: number },
): IpcResult<CustomerPrice> {
  try {
    return db.transaction(() => {
      let priceList = db
        .prepare('SELECT id FROM price_lists WHERE counterparty_id = ?')
        .get(input.counterparty_id) as { id: number } | undefined

      if (!priceList) {
        const cp = db
          .prepare('SELECT name FROM counterparties WHERE id = ?')
          .get(input.counterparty_id) as { name: string } | undefined

        if (!cp) {
          return {
            success: false as const,
            error: 'Kunden hittades inte.',
            code: 'COUNTERPARTY_NOT_FOUND' as const,
          }
        }

        const result = db
          .prepare(
            'INSERT INTO price_lists (name, is_default, counterparty_id) VALUES (?, 0, ?)',
          )
          .run(`Prislista ${cp.name}`, input.counterparty_id)
        priceList = { id: Number(result.lastInsertRowid) }
      }

      db.prepare(
        `INSERT INTO price_list_items (price_list_id, product_id, price_ore)
         VALUES (?, ?, ?)
         ON CONFLICT(price_list_id, product_id)
         DO UPDATE SET price_ore = excluded.price_ore`,
      ).run(priceList.id, input.product_id, input.price_ore)

      const cp = db
        .prepare('SELECT name FROM counterparties WHERE id = ?')
        .get(input.counterparty_id) as { name: string }

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
  input: { product_id: number; counterparty_id: number },
): IpcResult<undefined> {
  try {
    const priceList = db
      .prepare('SELECT id FROM price_lists WHERE counterparty_id = ?')
      .get(input.counterparty_id) as { id: number } | undefined

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
  input: { product_id: number; counterparty_id: number },
): PriceResult {
  const customerPrice = db
    .prepare(
      `SELECT pli.price_ore
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pl.counterparty_id = ? AND pli.product_id = ?`,
    )
    .get(input.counterparty_id, input.product_id) as
    | { price_ore: number }
    | undefined

  if (customerPrice) {
    return { price_ore: customerPrice.price_ore, source: 'customer' }
  }

  const product = db
    .prepare('SELECT default_price_ore FROM products WHERE id = ?')
    .get(input.product_id) as { default_price_ore: number } | undefined

  return { price_ore: product?.default_price_ore ?? 0, source: 'default' }
}
