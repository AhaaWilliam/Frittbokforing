import type Database from 'better-sqlite3'
import type {
  Product,
  CustomerPrice,
  PriceResult,
  IpcResult,
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
    sql += ' AND (name LIKE ? OR description LIKE ?)'
    const term = `%${input.search}%`
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
      `SELECT pli.price, cp.id AS counterparty_id, cp.name AS counterparty_name
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
        `INSERT INTO products (name, description, unit, default_price, vat_code_id, account_id, article_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.description ?? null,
        data.unit,
        data.default_price,
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
      code: 'TRANSACTION_ERROR',
    }
  }
}

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
      if (value !== undefined) {
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
      code: 'TRANSACTION_ERROR',
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
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function setCustomerPrice(
  db: Database.Database,
  input: { product_id: number; counterparty_id: number; price: number },
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
        `INSERT INTO price_list_items (price_list_id, product_id, price)
         VALUES (?, ?, ?)
         ON CONFLICT(price_list_id, product_id)
         DO UPDATE SET price = excluded.price`,
      ).run(priceList.id, input.product_id, input.price)

      const cp = db
        .prepare('SELECT name FROM counterparties WHERE id = ?')
        .get(input.counterparty_id) as { name: string }

      return {
        success: true as const,
        data: {
          counterparty_id: input.counterparty_id,
          counterparty_name: cp.name,
          price: input.price,
        },
      }
    })()
  } catch (err) {
    log.error('[product-service] setCustomerPrice failed:', err)
    return {
      success: false,
      error: 'Kunde inte spara kundpriset.',
      code: 'TRANSACTION_ERROR',
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
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function getPriceForCustomer(
  db: Database.Database,
  input: { product_id: number; counterparty_id: number },
): PriceResult {
  const customerPrice = db
    .prepare(
      `SELECT pli.price
     FROM price_list_items pli
     JOIN price_lists pl ON pl.id = pli.price_list_id
     WHERE pl.counterparty_id = ? AND pli.product_id = ?`,
    )
    .get(input.counterparty_id, input.product_id) as
    | { price: number }
    | undefined

  if (customerPrice) {
    return { price: customerPrice.price, source: 'customer' }
  }

  const product = db
    .prepare('SELECT default_price FROM products WHERE id = ?')
    .get(input.product_id) as { default_price: number } | undefined

  return { price: product?.default_price ?? 0, source: 'default' }
}
