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
vi.mock('../../../../src/renderer/components/invoices/CustomerPicker', () => ({
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
}))

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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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

    expect(await screen.findByTestId('vardag-faktura-error')).toHaveTextContent(
      'Perioden är stängd.',
    )
  })

  it('VS-18 beskrivnings-fältet är auto-fokuserat när sheet öppnas', async () => {
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    const desc = await screen.findByTestId('vardag-faktura-description')
    await waitFor(() => {
      expect(document.activeElement).toBe(desc)
    })
  })

  it('VS-8 multi-line CTA navigerar till /income/create i bokförare-läget', async () => {
    const onClose = vi.fn()
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={onClose} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    fireEvent.click(await screen.findByTestId('vardag-faktura-multiline-cta'))

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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    fireEvent.click(await screen.findByTestId('customer-picker-mock'))

    await waitFor(() => {
      expect(screen.getByTestId('vardag-faktura-account')).toHaveValue('3540')
    })
  })

  // VS-134: paritets-tester med BokforKostnadSheet — inline-validering,
  // missing-fields-hint, datum-validering, vat-codes-loading. Fångar
  // regressioner i validation-paths som tidigare bara testats för
  // kostnads-sheeten men gäller faktura-sheeten med samma semantik.

  it('VS-134/VS-19 inline-fel om kontonummer inte finns i kontoplan', async () => {
    mockIpcResponse('account:list-all', {
      success: true,
      data: [
        {
          id: 1,
          account_number: '3001',
          name: 'Försäljning',
          account_type: 'revenue',
          is_active: 1,
          k2_allowed: 1,
          k3_only: 0,
          is_system_account: 0,
        },
      ],
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    const accountInput = await screen.findByTestId('vardag-faktura-account')
    fireEvent.change(accountInput, { target: { value: '9999' } })

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-faktura-account-error'),
      ).toHaveTextContent('finns inte i kontoplanen')
    })

    expect(screen.getByTestId('vardag-faktura-submit')).toBeDisabled()
  })

  it('VS-134/VS-28 visar missing-fields-hint när submit är disabled', async () => {
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    const hint = await screen.findByTestId('vardag-faktura-missing-hint')
    // Initialt är kund/beskrivning/à-pris obligatoriska och tomma.
    // (qty default 1, så det bör inte stå "antal")
    expect(hint.textContent).toMatch(/Saknas:/)
    expect(hint.textContent).toMatch(/kund/)
    expect(hint.textContent).toMatch(/beskrivning/)
    expect(hint.textContent).toMatch(/à-pris/)
  })

  it('VS-134/VS-14 visar inline-fel om datum utanför aktivt FY', async () => {
    // Default-FY i renderWithProviders är 2026-01-01..2026-12-31.
    // 2025-06-01 ligger före start → fiscalYearDateError triggar.
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    const dateInput = await screen.findByTestId('vardag-faktura-date')
    fireEvent.change(dateInput, { target: { value: '2025-06-01' } })

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-faktura-date-error'),
      ).toBeInTheDocument()
    })
  })

  it('VS-134/VS-22 vat-dropdown visar "Laddar momskoder…" innan vat-codes laddats', async () => {
    // Override default vat-code mock med en pending response.
    mockIpcResponse('vat-code:list', { success: true, data: [] })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    const vatSelect = (await screen.findByTestId(
      'vardag-faktura-vat',
    )) as HTMLSelectElement
    expect(vatSelect.disabled).toBe(true)
    expect(vatSelect.textContent).toMatch(/Laddar momskoder/)
  })

  it('VS-138/VS-25 submit-fel rensas när användaren börjar redigera', async () => {
    mockIpcResponse('invoice:save-draft', { success: true, data: { id: 88 } })
    mockIpcResponse('invoice:finalize', {
      success: false,
      error: 'Perioden är stängd.',
      code: 'PERIOD_CLOSED',
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    fireEvent.click(await screen.findByTestId('customer-picker-mock'))
    fireEvent.change(screen.getByTestId('vardag-faktura-description'), {
      target: { value: 'Konsult' },
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
    ).toBeInTheDocument()

    // När användaren börjar redigera ska felet försvinna (VS-96-mönstret)
    fireEvent.change(screen.getByTestId('vardag-faktura-description'), {
      target: { value: 'Konsult & analys' },
    })

    await waitFor(() => {
      expect(screen.queryByTestId('vardag-faktura-error')).toBeNull()
    })
  })

  it('VS-138/VS-20 visar kontonamn när kontonummer matchar', async () => {
    mockIpcResponse('account:list-all', {
      success: true,
      data: [
        {
          id: 1,
          account_number: '3001',
          name: 'Försäljning inom Sverige',
          account_type: 'revenue',
          is_active: 1,
          k2_allowed: 1,
          k3_only: 0,
          is_system_account: 0,
        },
      ],
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-faktura-account-name'),
      ).toHaveTextContent('Försäljning inom Sverige')
    })
  })

  it('VS-137/VS-16 Cmd+Enter triggar submit när formulär är giltigt', async () => {
    mockIpcResponse('invoice:save-draft', { success: true, data: { id: 88 } })
    mockIpcResponse('invoice:finalize', {
      success: true,
      data: { id: 88, journal_entry_id: 600, verification_number: 1 },
    })
    mockIpcResponse('counterparty:set-default-account', {
      success: true,
      data: customerFixtures[0],
    })

    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(ipcCalls('saveDraft').length).toBe(1)
  })

  it('VS-137/VS-16 Cmd+Enter triggar INTE submit när formulär är ogiltigt', async () => {
    await renderWithProviders(
      <SkapaFakturaSheet open={true} onClose={() => {}} />,
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
    )

    await screen.findByTestId('vardag-faktura-description')
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    await new Promise((r) => setTimeout(r, 50))
    expect(ipcCalls('saveDraft')).toEqual([])
  })

  // VS-47: regression-test för VS-37 (submittingRef-guard mot double-click).
  // Två snabba klick på submit-knappen ska aldrig resultera i fler än ett
  // saveDraft-anrop, även om React-batchningen gör att submitting-state
  // inte hunnit uppdateras mellan klicken.
  it('VS-37 dubbelklick på submit anropar saveDraft endast en gång', async () => {
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
      { axeCheck: false }, // M133 exempt — dedicated axe test in Sheets.a11y.test.tsx
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

    const submitBtn = screen.getByTestId('vardag-faktura-submit')
    // Snabba klick utan await mellan — emulerar dubbelklick före React
    // hunnit re-rendera disabled-state.
    fireEvent.click(submitBtn)
    fireEvent.click(submitBtn)
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })

    // Endast EN saveDraft trots tre klick.
    expect(ipcCalls('saveDraft').length).toBe(1)
    expect(ipcCalls('finalizeInvoice').length).toBe(1)
  })
})
