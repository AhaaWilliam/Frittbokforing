import { describe, it, expect } from 'vitest'
import { queryKeys } from '../../../src/renderer/lib/query-keys'

describe('queryKeys', () => {
  describe('stamdata', () => {
    it('company / companies / fiscalYears utan args', () => {
      expect(queryKeys.company()).toEqual(['company'])
      expect(queryKeys.companies()).toEqual(['companies'])
      expect(queryKeys.fiscalYears()).toEqual(['fiscal-years'])
    })

    it('fiscalPeriods inkluderar fyId', () => {
      expect(queryKeys.fiscalPeriods(7)).toEqual(['fiscal-periods', 7])
    })

    it('counterparties utan params kortform', () => {
      expect(queryKeys.counterparties()).toEqual(['counterparties'])
    })

    it('counterparties med params inkluderar params-objekt', () => {
      expect(queryKeys.counterparties({ type: 'customer' })).toEqual([
        'counterparties',
        { type: 'customer' },
      ])
    })

    it('counterparty inkluderar id', () => {
      expect(queryKeys.counterparty(42)).toEqual(['counterparty', 42])
    })

    it('vatCodes utan/med direction', () => {
      expect(queryKeys.vatCodes()).toEqual(['vat-codes'])
      expect(queryKeys.vatCodes('outgoing')).toEqual(['vat-codes', 'outgoing'])
    })

    it('accounts inkluderar fiscalRule + class + active', () => {
      expect(queryKeys.accounts('K2', 1, true)).toEqual([
        'accounts',
        'K2',
        1,
        true,
      ])
    })

    it('allAccounts utan/med isActive', () => {
      expect(queryKeys.allAccounts()).toEqual(['accounts-all', undefined])
      expect(queryKeys.allAccounts(true)).toEqual(['accounts-all', true])
    })
  })

  describe('fakturor (FY-scopade)', () => {
    it('invoiceDrafts inkluderar fyId', () => {
      expect(queryKeys.invoiceDrafts(1)).toEqual(['invoices', 'drafts', 1])
    })

    it('invoice inkluderar id', () => {
      expect(queryKeys.invoice(99)).toEqual(['invoice', 99])
    })

    it('invoiceList med/utan filter', () => {
      expect(queryKeys.invoiceList(1)).toEqual(['invoices', 'list', 1])
      expect(queryKeys.invoiceList(1, { status: 'paid' })).toEqual([
        'invoices',
        'list',
        1,
        { status: 'paid' },
      ])
    })

    it('invoiceNextNumber inkluderar fyId', () => {
      expect(queryKeys.invoiceNextNumber(1)).toEqual(['invoice-next-number', 1])
    })

    it('invoicePayments inkluderar invoiceId', () => {
      expect(queryKeys.invoicePayments(5)).toEqual(['payments', 5])
    })
  })

  describe('kostnader (FY-scopade)', () => {
    it('expenseDrafts inkluderar fyId', () => {
      expect(queryKeys.expenseDrafts(2)).toEqual(['expense-drafts', 2])
    })

    it('expense inkluderar id', () => {
      expect(queryKeys.expense(7)).toEqual(['expense', 7])
    })

    it('expenses default-sort när inte angett', () => {
      const k = queryKeys.expenses(1)
      expect(k).toEqual(['expenses', 1, null, null, 'expense_date', 'desc'])
    })

    it('expenses fullständig variant', () => {
      const k = queryKeys.expenses(1, 'unpaid', 'foo', 'amount', 'asc')
      expect(k).toEqual(['expenses', 1, 'unpaid', 'foo', 'amount', 'asc'])
    })
  })

  describe('determinism', () => {
    it('samma argument ger likvärdiga keys (deep equal)', () => {
      const a = queryKeys.invoiceList(1, { status: 'paid' })
      const b = queryKeys.invoiceList(1, { status: 'paid' })
      expect(a).toEqual(b)
    })

    it('olika fyId ger distinkta keys', () => {
      expect(queryKeys.invoiceList(1)).not.toEqual(queryKeys.invoiceList(2))
    })
  })
})
