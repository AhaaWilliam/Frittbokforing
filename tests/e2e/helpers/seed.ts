/**
 * E2E seed helpers — IPC-based data creation through the renderer.
 *
 * Uses window.api (production IPC) for normal entities and
 * window.__testApi (test-only IPC) for test-specific operations.
 */
import type { Page } from '@playwright/test'

/**
 * Resolve a company_id automatiskt via listCompanies (första bolaget).
 *
 * Sprint H+G-18: M158 kräver company_id för counterparties. Helper
 * tillåter befintliga callers att fortsätta utan explicit companyId
 * — fallback hämtar första bolaget. Nya callers bör skicka companyId
 * explicit för deterministiskt beteende vid multi-bolag.
 */
async function resolveCompanyId(
  window: Page,
  explicit?: number,
): Promise<number> {
  if (explicit != null) return explicit
  const result = await window.evaluate(async () => {
    return await (
      window as unknown as {
        api: { listCompanies: () => Promise<unknown> }
      }
    ).api.listCompanies()
  })
  const r = result as {
    success: boolean
    data: Array<{ id: number }>
    error?: string
  }
  if (!r.success) throw new Error(`listCompanies failed: ${r.error}`)
  if (!r.data?.[0]) throw new Error('resolveCompanyId: inga bolag finns')
  return r.data[0].id
}

/**
 * Seed a customer counterparty via IPC. Returns counterparty id.
 *
 * Sprint H+G-18 (M158): `companyId` är obligatorisk på IPC-nivå men
 * helpern auto-resolverar mot första bolaget om värdet inte skickas
 * — bevarar bakåtkompatibilitet för befintliga e2e-tester. Nya
 * callsites bör skicka companyId explicit (multi-bolags-säkerhet).
 */
export async function seedCustomer(
  window: Page,
  companyIdOrName?: number | string,
  name?: string,
): Promise<number> {
  // Två-argument-bakåtkompat: seedCustomer(window, "Namn")
  const explicit =
    typeof companyIdOrName === 'number' ? companyIdOrName : undefined
  const resolvedName =
    typeof companyIdOrName === 'string' ? companyIdOrName : name
  const companyId = await resolveCompanyId(window, explicit)
  const result = await window.evaluate(
    async ({ n, cid }) => {
      return await (
        window as unknown as {
          api: { createCounterparty: (d: unknown) => Promise<unknown> }
        }
      ).api.createCounterparty({
        company_id: cid,
        name: n,
        type: 'customer',
        org_number: null,
        default_payment_terms: 30,
      })
    },
    { n: resolvedName ?? 'E2E Testkund AB', cid: companyId },
  )
  const r = result as { success: boolean; data: { id: number }; error?: string }
  if (!r.success) throw new Error(`seedCustomer failed: ${r.error}`)
  return r.data.id
}

/**
 * Seed a supplier counterparty via IPC. Returns counterparty id.
 *
 * Sprint H+G-18 (M158): se seedCustomer för companyId-semantik.
 */
export async function seedSupplier(
  window: Page,
  companyIdOrName?: number | string,
  name?: string,
): Promise<number> {
  const explicit =
    typeof companyIdOrName === 'number' ? companyIdOrName : undefined
  const resolvedName =
    typeof companyIdOrName === 'string' ? companyIdOrName : name
  const companyId = await resolveCompanyId(window, explicit)
  const result = await window.evaluate(
    async ({ n, cid }) => {
      return await (
        window as unknown as {
          api: { createCounterparty: (d: unknown) => Promise<unknown> }
        }
      ).api.createCounterparty({
        company_id: cid,
        name: n,
        type: 'supplier',
        org_number: null,
        default_payment_terms: 30,
      })
    },
    { n: resolvedName ?? 'E2E Testleverantör AB', cid: companyId },
  )
  const r = result as { success: boolean; data: { id: number }; error?: string }
  if (!r.success) throw new Error(`seedSupplier failed: ${r.error}`)
  return r.data.id
}

/**
 * Seed and finalize an invoice via IPC (saveDraft + finalizeDraft).
 * Returns { invoiceId, invoiceNumber }.
 */
export async function seedAndFinalizeInvoice(
  window: Page,
  opts: {
    counterpartyId: number
    fiscalYearId: number
    invoiceDate?: string
    dueDate?: string
    unitPriceOre?: number
    quantity?: number
  },
): Promise<{ invoiceId: number; invoiceNumber: string }> {
  // Get VAT code for 25% outgoing (M144: wrapped IpcResult)
  const vatCode = await window.evaluate(async () => {
    const result = await (
      window as unknown as {
        api: { listVatCodes: (d: { direction?: string }) => Promise<unknown> }
      }
    ).api.listVatCodes({ direction: 'outgoing' })
    const r = result as {
      success: boolean
      data: Array<{ id: number; code: string }>
      error?: string
    }
    if (!r.success) throw new Error(`listVatCodes failed: ${r.error}`)
    return r.data.find((c) => c.code === 'MP1')
  })
  if (!vatCode) throw new Error('VAT code MP1 not found')

  const draftResult = await window.evaluate(
    async (d) => {
      return await (
        window as unknown as {
          api: { saveDraft: (d: unknown) => Promise<unknown> }
        }
      ).api.saveDraft(d)
    },
    {
      counterparty_id: opts.counterpartyId,
      fiscal_year_id: opts.fiscalYearId,
      invoice_date: opts.invoiceDate ?? '2026-03-15',
      due_date: opts.dueDate ?? '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'E2E test tjänst',
          quantity: opts.quantity ?? 1,
          unit_price_ore: opts.unitPriceOre ?? 10000,
          vat_code_id: (vatCode as { id: number }).id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    },
  )
  const dr = draftResult as {
    success: boolean
    data: { id: number }
    error?: string
  }
  if (!dr.success) throw new Error(`saveDraft failed: ${dr.error}`)

  const finalResult = await window.evaluate(async (id) => {
    return await (
      window as unknown as {
        api: { finalizeInvoice: (d: { id: number }) => Promise<unknown> }
      }
    ).api.finalizeInvoice({ id })
  }, dr.data.id)
  const fr = finalResult as {
    success: boolean
    data: { verification_number: number; invoice_number: string }
    error?: string
  }
  if (!fr.success) throw new Error(`finalizeInvoice failed: ${fr.error}`)

  return {
    invoiceId: dr.data.id,
    invoiceNumber: fr.data.invoice_number ?? String(dr.data.id),
  }
}
