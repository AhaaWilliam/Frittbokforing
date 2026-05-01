// @vitest-environment jsdom
/**
 * Sprint VS-4 — SkapaFakturaSheet integration test
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'

function ipcCalls(method: string): unknown[][] {
  const fn = (
    window as unknown as {
      api: Record<string, { mock: { calls: unknown[][] } }>
    }
  ).api[method]
  return fn?.mock?.calls ?? []
}

import { renderWithProviders } from '../../../helpers/render-with-providers'
import { SkapaFakturaSheet } from '../../../../src/renderer/modes/vardag/SkapaFakturaSheet'
import { customerFixtures } from '../__fixtures__/counterparties'

// Mock CustomerPicker
vi.mock(
  '../../../../src/renderer/components/invoices/CustomerPicker',
  () => ({
    CustomerPicker: ({
      onChange,
    }: {
      onChange: (c: {
        id: number
        name: string
        default_payment_terms: number
      }) => void
    }) => (
      <button
        type="button"
        data-testid="customer-picker-mock"
        onClick={() => {
          const cust = customerFixtures[0]
          onChange({
            id: cust.id,
            name: cust.name,
            default_payment_terms: cust.default_payment_terms,
          })
        }}
      >
        Välj kund
      </button>
    ),
  }),
)

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'

const outgoingVatCodes = [
  {
    id: 10,
    code: 'MP1',
    description: 'Moms 25%',
    rate_percent: 25,
    vat_type: 'outgoing' as const,
    report_box: null,
  },
  {
    id: 11,
    code: 'MP2',
    description: 'Moms 12%',
    rate_percent: 12,
    vat_type: 'outgoing' as const,
    report_box: null,
  },
]

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  setupMockIpc()
  mockIpcResponse('vat-code:list', { success: true, data: outgoingVatCodes })
  mockIpcResponse('counterparty:get', {
    success: true,
    data: { ...customerFixtures[0], default_revenue_account: null },
  })
})

describe('Sprint VS-4 — SkapaFakturaSheet', () => {
  it('renderar med tomma fält när öppen', async () => {
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )
    expect(
      await screen.findByTestId('vardag-faktura-description'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('vardag-faktura-account')).toHaveValue('3001')
    expect(screen.getByTestId('vardag-faktura-qty')).toHaveValue('1')
  })

  it('Skicka-knapp disabled när formulär är tomt', async () => {
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )
    const submit = (await screen.findByTestId(
      'vardag-faktura-submit',
    )) as HTMLButtonElement
    expect(submit).toBeDisabled()
  })

  it('submit-flow: saveDraft → finalize → setDefaultAccount → success-toast', async () => {
    const onClose = vi.fn()
    mockIpcResponse('invoice:save-draft', {
      success: true,
      data: { id: 88 },
    })
    mockIpcResponse('invoice:finalize', {
      success: true,
      data: { id: 88, journal_entry_id: 600, verification_number: 1 },
    })
    mockIpcResponse('counterparty:set-default-account', {
      success: true,
      data: customerFixtures[0],
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={onClose} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('customer-picker-mock'))
    fireEvent.change(screen.getByTestId('vardag-faktura-description'), {
      target: { value: 'Konsulttimmar' },
    })
    fireEvent.change(screen.getByTestId('vardag-faktura-price'), {
      target: { value: '1500,00' },
    })

    await waitFor(() =>
      expect(screen.getByTestId('vardag-faktura-submit')).not.toBeDisabled(),
    )

    await waitFor(() => {
      expect(ipcCalls('getCounterparty').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByTestId('vardag-faktura-submit'))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Fakturan skickad som A1'),
    )
    expect(onClose).toHaveBeenCalled()

    const saveCalls = ipcCalls('saveDraft')
    expect(saveCalls.length).toBe(1)
    expect(saveCalls[0][0]).toMatchObject({
      counterparty_id: customerFixtures[0].id,
      lines: [
        {
          description: 'Konsulttimmar',
          quantity: 1,
          unit_price_ore: 150_000,
          account_number: '3001',
        },
      ],
    })

    expect(ipcCalls('finalizeInvoice')).toEqual([[{ id: 88 }]])

    await waitFor(() => {
      expect(ipcCalls('setCounterpartyDefaultAccount').length).toBe(1)
    })
    expect(ipcCalls('setCounterpartyDefaultAccount')[0][0]).toMatchObject({
      id: customerFixtures[0].id,
      field: 'default_revenue_account',
      account_number: '3001',
    })
  })

  it('visar fel om finalize misslyckas', async () => {
    mockIpcResponse('invoice:save-draft', {
      success: true,
      data: { id: 88 },
    })
    mockIpcResponse('invoice:finalize', {
      success: false,
      error: 'Perioden är stängd.',
      code: 'PERIOD_CLOSED',
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('customer-picker-mock'))
    fireEvent.change(screen.getByTestId('vardag-faktura-description'), {
      target: { value: 'X' },
    })
    fireEvent.change(screen.getByTestId('vardag-faktura-price'), {
      target: { value: '500,00' },
    })

    await waitFor(() =>
      expect(screen.getByTestId('vardag-faktura-submit')).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByTestId('vardag-faktura-submit'))

    expect(
      await screen.findByTestId('vardag-faktura-error'),
    ).toHaveTextContent('Perioden är stängd.')
  })

  it('VS-8 multi-line CTA navigerar till /income/create i bokförare-läget', async () => {
    const onClose = vi.fn()
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={onClose} />,
      { axeCheck: false },
    )

    fireEvent.click(
      await screen.findByTestId('vardag-faktura-multiline-cta'),
    )

    expect(window.location.hash).toBe('#/income/create')
    expect(onClose).toHaveBeenCalled()
  })

  it('konto pre-fylls från customer.default_revenue_account', async () => {
    mockIpcResponse('counterparty:get', {
      success: true,
      data: { ...customerFixtures[0], default_revenue_account: '3540' },
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('customer-picker-mock'))

    await waitFor(() => {
      expect(screen.getByTestId('vardag-faktura-account')).toHaveValue('3540')
    })
  })
})
