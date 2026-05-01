// @vitest-environment jsdom
/**
 * Sprint VS-3 — BokforKostnadSheet integration test
 *
 * Verifierar:
 *  - Sheet öppnas och visar fält
 *  - Submit-knapp disabled tills required-fält är ifyllda
 *  - Submit-flow anropar saveExpenseDraft + finalizeExpense + setCounterpartyDefaultAccount
 *  - Felmeddelande visas vid finalize-fail
 *  - Konto pre-fylls från supplier.default_expense_account
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'

function ipcCalls(method: string): unknown[][] {
  const fn = (window as unknown as { api: Record<string, { mock: { calls: unknown[][] } }> })
    .api[method]
  return fn?.mock?.calls ?? []
}
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { BokforKostnadSheet } from '../../../../src/renderer/modes/vardag/BokforKostnadSheet'
import { supplierFixtures } from '../__fixtures__/counterparties'
import { defaultExpenseVatCodes, makeExpenseDraft } from '../__fixtures__/expenses'

// Mock SupplierPicker — knapp som anropar onChange med vald leverantör
vi.mock(
  '../../../../src/renderer/components/expenses/SupplierPicker',
  () => ({
    SupplierPicker: ({
      onChange,
    }: {
      onChange: (s: {
        id: number
        name: string
        default_payment_terms: number
      }) => void
    }) => (
      <button
        type="button"
        data-testid="supplier-picker-mock"
        onClick={() => {
          const sup = supplierFixtures[0]
          onChange({
            id: sup.id,
            name: sup.name,
            default_payment_terms: sup.default_payment_terms,
          })
        }}
      >
        Välj leverantör
      </button>
    ),
  }),
)

// sonner toast mock
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Toast mock för verifiering av success-call
import { toast } from 'sonner'

beforeEach(() => {
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  setupMockIpc()
  mockIpcResponse('vat-code:list', {
    success: true,
    data: defaultExpenseVatCodes,
  })
  mockIpcResponse('counterparty:get', {
    success: true,
    data: { ...supplierFixtures[0], default_expense_account: null },
  })
})

describe('Sprint VS-3 — BokforKostnadSheet', () => {
  it('renderar sheet med tomma fält när öppen', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )
    expect(
      await screen.findByTestId('vardag-kostnad-amount'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('vardag-kostnad-description')).toBeInTheDocument()
    expect(screen.getByTestId('vardag-kostnad-account')).toHaveValue('6110')
  })

  it('Bokför-knapp disabled när formulär är tomt', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )
    const submit = (await screen.findByTestId(
      'vardag-kostnad-submit',
    )) as HTMLButtonElement
    expect(submit).toBeDisabled()
  })

  it('submit-flow: saveDraft → finalize → setDefaultAccount → success-toast', async () => {
    const onClose = vi.fn()
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:finalize', {
      success: true,
      data: { id: 99, journal_entry_id: 500, verification_number: 1 },
    })
    mockIpcResponse('counterparty:set-default-account', {
      success: true,
      data: supplierFixtures[0],
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={onClose} />,
      { axeCheck: false },
    )

    fireEvent.change(await screen.findByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Pennor' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() => {
      const submit = screen.getByTestId('vardag-kostnad-submit')
      expect(submit).not.toBeDisabled()
    })

    // Vänta in useCounterparty-queryn så att supplierFull är laddad innan submit.
    await waitFor(() => {
      expect(ipcCalls('getCounterparty').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByTestId('vardag-kostnad-submit'))

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Kostnaden bokförd som B1')
    })
    expect(onClose).toHaveBeenCalled()

    const saveCalls = ipcCalls('saveExpenseDraft')
    expect(saveCalls.length).toBe(1)
    expect(saveCalls[0][0]).toMatchObject({
      counterparty_id: supplierFixtures[0].id,
      description: 'Pennor',
      lines: [{ unit_price_ore: 10_000, account_number: '6110', quantity: 1 }],
    })

    const finalizeCalls = ipcCalls('finalizeExpense')
    expect(finalizeCalls).toEqual([[{ id: 99 }]])

    await waitFor(() => {
      expect(ipcCalls('setCounterpartyDefaultAccount').length).toBe(1)
    })
    expect(ipcCalls('setCounterpartyDefaultAccount')[0][0]).toMatchObject({
      id: supplierFixtures[0].id,
      field: 'default_expense_account',
      account_number: '6110',
    })
  })

  it('visar fel om finalize misslyckas', async () => {
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:finalize', {
      success: false,
      error: 'Perioden är stängd.',
      code: 'PERIOD_CLOSED',
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.change(await screen.findByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Pennor' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-submit')).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByTestId('vardag-kostnad-submit'))

    expect(
      await screen.findByTestId('vardag-kostnad-error'),
    ).toHaveTextContent('Perioden är stängd.')
  })

  it('konto pre-fylls från supplier.default_expense_account', async () => {
    mockIpcResponse('counterparty:get', {
      success: true,
      data: { ...supplierFixtures[0], default_expense_account: '5010' },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('supplier-picker-mock'))

    await waitFor(() => {
      expect(screen.getByTestId('vardag-kostnad-account')).toHaveValue('5010')
    })
  })

  it('hoppar över setDefaultAccount om supplier redan har default', async () => {
    mockIpcResponse('counterparty:get', {
      success: true,
      data: { ...supplierFixtures[0], default_expense_account: '5010' },
    })
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:finalize', {
      success: true,
      data: { id: 99, journal_entry_id: 500, verification_number: 1 },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.change(await screen.findByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Hyra' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-submit')).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByTestId('vardag-kostnad-submit'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    expect(ipcCalls('setCounterpartyDefaultAccount')).toEqual([])
  })

  // VS-7: receipt-attach UI

  it('VS-7 receipt-pick visar attached-state med filnamn', async () => {
    mockIpcResponse('expense:select-receipt-file', {
      success: true,
      data: { filePath: '/Users/test/Downloads/kvitto-mars.pdf' },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('vardag-kostnad-receipt-pick'))

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-kostnad-receipt-attached'),
      ).toHaveTextContent('kvitto-mars.pdf')
    })
  })

  it('VS-19 visar inline-fel om kontonummer inte finns i kontoplan', async () => {
    mockIpcResponse('account:list-all', {
      success: true,
      data: [
        {
          id: 1,
          account_number: '6110',
          name: 'Kontorsmateriel',
          account_type: 'expense',
          is_active: 1,
          k2_allowed: 1,
          k3_only: 0,
          is_system_account: 0,
        },
      ],
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    const accountInput = await screen.findByTestId('vardag-kostnad-account')
    fireEvent.change(accountInput, { target: { value: '9999' } })

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-kostnad-account-error'),
      ).toHaveTextContent('finns inte i kontoplanen')
    })

    expect(screen.getByTestId('vardag-kostnad-submit')).toBeDisabled()
  })

  it('VS-19 inget fel visas innan accounts laddats (false-positive-skydd)', async () => {
    // account:list-all utan mock → mock-ipc default = success: true, data: null
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    await screen.findByTestId('vardag-kostnad-account')

    // Default-konto 6110 finns inte i tomma listan, men eftersom listan
    // INTE har laddats än ska vi inte flagga fel.
    expect(
      screen.queryByTestId('vardag-kostnad-account-error'),
    ).toBeNull()
  })

  it('VS-18 belopp-fältet är auto-fokuserat när sheet öppnas', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    const amount = await screen.findByTestId('vardag-kostnad-amount')
    await waitFor(() => {
      expect(document.activeElement).toBe(amount)
    })
  })

  it('VS-16 Cmd+Enter triggar submit när formulär är giltigt', async () => {
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:finalize', {
      success: true,
      data: { id: 99, journal_entry_id: 500, verification_number: 1 },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.change(await screen.findByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Pennor' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-submit')).not.toBeDisabled(),
    )

    // Cmd+Enter
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(ipcCalls('saveExpenseDraft').length).toBe(1)
  })

  it('VS-16 Cmd+Enter triggar INTE submit när formulär är ogiltigt', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    await screen.findByTestId('vardag-kostnad-amount')
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    await new Promise((r) => setTimeout(r, 50))
    expect(ipcCalls('saveExpenseDraft')).toEqual([])
  })

  it('VS-14 visar inline-fel om datum utanför aktivt FY', async () => {
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false, fiscalYear: { id: 1, label: '2026' } },
    )

    // FY från fixturen är 2026 (start 2026-01-01, end 2026-12-31).
    // Sätt datum till 2024-06-15 → ska trigga error.
    fireEvent.change(await screen.findByTestId('vardag-kostnad-date'), {
      target: { value: '2024-06-15' },
    })

    await waitFor(() => {
      expect(
        screen.getByTestId('vardag-kostnad-date-error'),
      ).toHaveTextContent('utanför räkenskapsåret')
    })

    // Submit-knappen ska vara disabled så länge datum är ogiltigt.
    expect(screen.getByTestId('vardag-kostnad-submit')).toBeDisabled()
  })

  it('VS-12 cross-platform: backslash-paths visar bara filnamn', async () => {
    mockIpcResponse('expense:select-receipt-file', {
      success: true,
      data: { filePath: 'C:\\Users\\test\\Downloads\\kvitto.pdf' },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('vardag-kostnad-receipt-pick'))

    await waitFor(() => {
      const el = screen.getByTestId('vardag-kostnad-receipt-attached')
      expect(el).toHaveTextContent('kvitto.pdf')
      expect(el.textContent).not.toContain('Users')
    })
  })

  it('VS-7 receipt-clear återställer pick-knappen', async () => {
    mockIpcResponse('expense:select-receipt-file', {
      success: true,
      data: { filePath: '/tmp/abc.pdf' },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('vardag-kostnad-receipt-pick'))
    await waitFor(() =>
      expect(
        screen.getByTestId('vardag-kostnad-receipt-attached'),
      ).toBeInTheDocument(),
    )

    fireEvent.click(screen.getByTestId('vardag-kostnad-receipt-clear'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-receipt-pick')).toBeInTheDocument(),
    )
  })

  it('VS-7 submit anropar attachReceipt när kvitto är valt', async () => {
    mockIpcResponse('expense:select-receipt-file', {
      success: true,
      data: { filePath: '/tmp/kvitto.pdf' },
    })
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:attach-receipt', {
      success: true,
      data: { receipt_path: 'receipts/99/kvitto.pdf' },
    })
    mockIpcResponse('expense:finalize', {
      success: true,
      data: { id: 99, journal_entry_id: 500, verification_number: 1 },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.click(await screen.findByTestId('vardag-kostnad-receipt-pick'))
    await waitFor(() =>
      expect(
        screen.getByTestId('vardag-kostnad-receipt-attached'),
      ).toBeInTheDocument(),
    )

    fireEvent.change(screen.getByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Pennor' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-submit')).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByTestId('vardag-kostnad-submit'))

    await waitFor(() =>
      expect(ipcCalls('attachReceipt').length).toBe(1),
    )
    expect(ipcCalls('attachReceipt')[0][0]).toMatchObject({
      expense_id: 99,
      source_file_path: '/tmp/kvitto.pdf',
    })
  })

  it('VS-7 submit utan kvitto anropar inte attachReceipt', async () => {
    mockIpcResponse('expense:save-draft', {
      success: true,
      data: makeExpenseDraft({ id: 99 }),
    })
    mockIpcResponse('expense:finalize', {
      success: true,
      data: { id: 99, journal_entry_id: 500, verification_number: 1 },
    })

    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={() => {}} />,
      { axeCheck: false },
    )

    fireEvent.change(await screen.findByTestId('vardag-kostnad-amount'), {
      target: { value: '125,00' },
    })
    fireEvent.change(screen.getByTestId('vardag-kostnad-description'), {
      target: { value: 'Pennor' },
    })
    fireEvent.click(screen.getByTestId('supplier-picker-mock'))

    await waitFor(() =>
      expect(screen.getByTestId('vardag-kostnad-submit')).not.toBeDisabled(),
    )
    fireEvent.click(screen.getByTestId('vardag-kostnad-submit'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())

    expect(ipcCalls('attachReceipt')).toEqual([])
  })

  // VS-8: Multi-line escape-hatch CTA

  it('VS-8 multi-line CTA navigerar till /expenses/create i bokförare-läget', async () => {
    const onClose = vi.fn()
    await renderWithProviders(
      <BokforKostnadSheet open={true} onClose={onClose} />,
      { axeCheck: false },
    )

    fireEvent.click(
      await screen.findByTestId('vardag-kostnad-multiline-cta'),
    )

    expect(window.location.hash).toBe('#/expenses/create')
    expect(onClose).toHaveBeenCalled()
  })
})
