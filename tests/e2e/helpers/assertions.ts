/**
 * E2E assertion helpers — query DB state via __testApi IPC endpoints.
 * All DB access goes through window.__testApi (exposed only when FRITT_TEST=1).
 */
import type { Page } from '@playwright/test'

interface JournalEntry {
  id: number
  fiscal_year_id: number
  verification_series: string
  verification_number: number
  status: string
  source_type: string
  source_reference: string | null
  description: string
  [key: string]: unknown
}

interface JournalEntryLine {
  journal_entry_id: number
  line_number: number
  account_number: string
  debit_ore: number
  credit_ore: number
  [key: string]: unknown
}

interface InvoicePayment {
  id: number
  invoice_id: number
  amount_ore: number
  payment_batch_id: number | null
  [key: string]: unknown
}

interface PaymentBatch {
  id: number
  fiscal_year_id: number
  batch_type: string
  status: string
  bank_fee_ore: number
  bank_fee_journal_entry_id: number | null
  [key: string]: unknown
}

interface Invoice {
  id: number
  status: string
  total_amount_ore: number
  paid_amount_ore: number
  remaining: number
  [key: string]: unknown
}

export async function getJournalEntries(
  window: Page,
  fyId?: number,
): Promise<{
  entries: JournalEntry[]
  lines: JournalEntryLine[]
}> {
  return window.evaluate(
    (fid) =>
      (
        window as unknown as {
          __testApi: { getJournalEntries: (f?: number) => Promise<unknown> }
        }
      ).__testApi.getJournalEntries(fid),
    fyId,
  ) as Promise<{ entries: JournalEntry[]; lines: JournalEntryLine[] }>
}

export async function getInvoicePayments(
  window: Page,
  invoiceId?: number,
): Promise<InvoicePayment[]> {
  return window.evaluate(
    (iid) =>
      (
        window as unknown as {
          __testApi: { getInvoicePayments: (i?: number) => Promise<unknown> }
        }
      ).__testApi.getInvoicePayments(iid),
    invoiceId,
  ) as Promise<InvoicePayment[]>
}

export async function getPaymentBatches(window: Page): Promise<PaymentBatch[]> {
  return window.evaluate(() =>
    (
      window as unknown as {
        __testApi: { getPaymentBatches: () => Promise<unknown> }
      }
    ).__testApi.getPaymentBatches(),
  ) as Promise<PaymentBatch[]>
}

export async function getInvoices(
  window: Page,
  fyId?: number,
): Promise<Invoice[]> {
  return window.evaluate(
    (fid) =>
      (
        window as unknown as {
          __testApi: { getInvoices: (f?: number) => Promise<unknown> }
        }
      ).__testApi.getInvoices(fid),
    fyId,
  ) as Promise<Invoice[]>
}

export async function setInvoiceStatus(
  window: Page,
  invoiceId: number,
  status: string,
): Promise<void> {
  await window.evaluate(
    ([iid, s]) =>
      (
        window as unknown as {
          __testApi: {
            setInvoiceStatus: (i: number, s: string) => Promise<unknown>
          }
        }
      ).__testApi.setInvoiceStatus(iid, s),
    [invoiceId, status] as [number, string],
  )
}

export async function createFiscalYear(
  window: Page,
  opts: {
    companyId: number
    startDate: string
    endDate: string
    yearLabel: string
  },
): Promise<{ id: number }> {
  return window.evaluate(
    (o) =>
      (
        window as unknown as {
          __testApi: { createFiscalYear: (o: unknown) => Promise<unknown> }
        }
      ).__testApi.createFiscalYear(o),
    opts,
  ) as Promise<{ id: number }>
}
