/**
 * Fixture-compose-funktioner för E2E (M148).
 *
 * Alla fixtures byggs via IPC/__testApi — aldrig direkt better-sqlite3.
 * Varje compose-funktion är idempotent (tar en nylanserad AppContext och
 * lämnar den i ett deterministiskt state) och returnerar handles som
 * testerna behöver (companyId, fiscalYearId, etc).
 *
 * Frys klockan via FRITT_NOW *innan* launchAppWithFreshDb() om testet
 * är tid-känsligt (overdue, chronology, #GEN). Compose-funktionerna
 * sätter ingen tid själva — det är testets ansvar.
 */
import type { Page } from '@playwright/test'
import { seedCompanyViaIPC } from '../helpers/launch-app'
import {
  seedCustomer,
  seedSupplier,
  seedAndFinalizeInvoice,
} from '../helpers/seed'
import { freezeClock } from '../helpers/ipc-testapi'

export interface EmptyCompanyFixture {
  companyId: number
  fiscalYearId: number
}

export interface ActiveYearFixture extends EmptyCompanyFixture {
  customerIds: number[]
  supplierIds: number[]
  invoiceIds: number[]
}

export interface OverdueFixture extends EmptyCompanyFixture {
  customerId: number
  overdueInvoiceIds: number[]
}

/**
 * K2-bolag med tomt räkenskapsår 2026-01-01 – 2026-12-31.
 * Reloadar fönstret så renderer plockar upp det nya bolaget och lämnar wizard.
 */
export async function composeEmptyK2(window: Page): Promise<EmptyCompanyFixture> {
  const result = await seedCompanyViaIPC(window, { fiscalRule: 'K2' })
  await window.reload()
  return result
}

/**
 * K3-variant av composeEmptyK2. Reloadar också fönstret.
 */
export async function composeEmptyK3(window: Page): Promise<EmptyCompanyFixture> {
  const result = await seedCompanyViaIPC(window, {
    fiscalRule: 'K3',
    name: 'E2E K3 Testföretag AB',
    orgNumber: '556677-8899',
  })
  await window.reload()
  return result
}

/**
 * K2-bolag + 3 kunder + 2 leverantörer + 2 bokförda fakturor.
 * Datum ligger inom 2026 FY. Kräver att klockan är frusen till 2026 eller
 * senare om chronology-guard aktiveras — annars sätt FRITT_NOW innan launch.
 */
export async function composeActiveYear(
  window: Page,
): Promise<ActiveYearFixture> {
  const base = await composeEmptyK2(window)

  const customerIds: number[] = []
  for (const name of ['Alpha AB', 'Beta HB', 'Gamma Konsult AB']) {
    customerIds.push(await seedCustomer(window, name))
  }

  const supplierIds: number[] = []
  for (const name of ['Leverantör Ett AB', 'Leverantör Två AB']) {
    supplierIds.push(await seedSupplier(window, name))
  }

  const invoiceIds: number[] = []
  for (let i = 0; i < 2; i++) {
    const r = await seedAndFinalizeInvoice(window, {
      counterpartyId: customerIds[i],
      fiscalYearId: base.fiscalYearId,
      invoiceDate: `2026-0${i + 2}-15`,
      dueDate: `2026-0${i + 3}-15`,
      unitPriceOre: 100000 * (i + 1),
      quantity: 1,
    })
    invoiceIds.push(r.invoiceId)
  }

  return {
    ...base,
    customerIds,
    supplierIds,
    invoiceIds,
  }
}

/**
 * K2-bolag + en kund + en förfallen faktura.
 * OBS: kräver att FRITT_NOW är satt till ett datum EFTER fakturans due_date
 * innan launchAppWithFreshDb(), annars blir status 'unpaid' istället för 'overdue'
 * vid appstart-refresh.
 *
 * Rekommenderad setup:
 *   process.env.FRITT_NOW = '2026-05-01T12:00:00Z'
 *   const ctx = await launchAppWithFreshDb()
 *   const fx = await composeOverdueInvoices(ctx.window)
 */
export async function composeOverdueInvoices(
  window: Page,
): Promise<OverdueFixture> {
  const base = await composeEmptyK2(window)
  const customerId = await seedCustomer(window, 'Förfallen Kund AB')

  const overdueInvoiceIds: number[] = []
  // Due-date 2026-03-15 — kommer vara overdue om FRITT_NOW > 2026-03-15.
  const r = await seedAndFinalizeInvoice(window, {
    counterpartyId: customerId,
    fiscalYearId: base.fiscalYearId,
    invoiceDate: '2026-02-01',
    dueDate: '2026-03-15',
    unitPriceOre: 50000,
    quantity: 1,
  })
  overdueInvoiceIds.push(r.invoiceId)

  return { ...base, customerId, overdueInvoiceIds }
}

/**
 * Exponerar freezeClock via __testApi. Thin re-export för compose-callers
 * som vill freeze/unfreeze mitt i ett test (t.ex. advancea tid för overdue).
 */
export { freezeClock }
