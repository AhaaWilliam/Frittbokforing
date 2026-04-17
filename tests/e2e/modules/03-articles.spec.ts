/**
 * 03 — Artiklar/Produkter.
 * Kräver vat_code_id och account_id — slås upp via IPC.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb } from '../helpers/launch-app'
import { composeEmptyK2 } from '../fixtures/compose'

async function createProduct(
  window: import('@playwright/test').Page,
  opts: {
    name: string
    article_type: 'service' | 'goods' | 'expense'
    accountNumber: string
  },
): Promise<number> {
  const vatCode = await window.evaluate(async () => {
    const result = await (
      window as unknown as {
        api: { listVatCodes: (d: unknown) => Promise<unknown> }
      }
    ).api.listVatCodes({ direction: 'outgoing' })
    const r = result as {
      success: boolean
      data: Array<{ id: number; code: string }>
    }
    return r.data.find((c) => c.code === 'MP1')
  })
  if (!vatCode) throw new Error('VAT code MP1 not found')

  const accounts = await window.evaluate(async () => {
    return (
      window as unknown as {
        api: { listAllAccounts: (d: unknown) => Promise<unknown> }
      }
    ).api.listAllAccounts({})
  })
  const acctList = (
    accounts as { data: Array<{ id: number; account_number: string }> }
  ).data
  const account = acctList.find((a) => a.account_number === opts.accountNumber)
  if (!account) throw new Error(`Account ${opts.accountNumber} not found`)

  const result = await window.evaluate(
    async (data) => {
      return (
        window as unknown as {
          api: { createProduct: (d: unknown) => Promise<unknown> }
        }
      ).api.createProduct(data)
    },
    {
      name: opts.name,
      unit: 'styck',
      default_price_ore: 10000,
      vat_code_id: vatCode.id,
      account_id: account.id,
      article_type: opts.article_type,
    },
  )
  const r = result as { success: boolean; data: { id: number }; error?: string }
  if (!r.success) throw new Error(`createProduct failed: ${r.error}`)
  return r.data.id
}

test.describe('Artiklar', () => {
  test('skapa tjänst + vara + utlägg och lista dem', async () => {
    const ctx = await launchAppWithFreshDb()
    try {
      await expect(ctx.window.getByTestId('wizard')).toBeVisible({
        timeout: 15_000,
      })
      await composeEmptyK2(ctx.window)
      await expect(ctx.window.getByTestId('app-ready')).toBeVisible({
        timeout: 15_000,
      })

      await createProduct(ctx.window, {
        name: 'Konsulttjänst',
        article_type: 'service',
        accountNumber: '3002',
      })
      await createProduct(ctx.window, {
        name: 'Mus',
        article_type: 'goods',
        accountNumber: '3001',
      })
      await createProduct(ctx.window, {
        name: 'Frakt',
        article_type: 'expense',
        accountNumber: '3004',
      })

      await ctx.window.evaluate(() => {
        location.hash = '#/products'
      })
      await expect(ctx.window.getByTestId('page-products')).toBeVisible({
        timeout: 10_000,
      })
      await expect(ctx.window.getByText('Konsulttjänst')).toBeVisible({
        timeout: 5_000,
      })
      await expect(ctx.window.getByText('Mus')).toBeVisible()
      await expect(ctx.window.getByText('Frakt')).toBeVisible()
    } finally {
      await ctx.cleanup()
    }
  })
})
