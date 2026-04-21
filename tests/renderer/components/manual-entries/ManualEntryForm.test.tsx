// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, act, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ManualEntryForm } from '../../../../src/renderer/components/manual-entries/ManualEntryForm'
import type { ManualEntryWithLines } from '../../../../src/shared/types'

// ── Helpers ────────────────────────────────────────────────────────────

function makeManualEntryDraft(
  overrides?: Partial<ManualEntryWithLines>,
): ManualEntryWithLines {
  return {
    id: 99,
    fiscal_year_id: 1,
    entry_date: '2026-03-15',
    description: 'Periodisering mars',
    status: 'draft',
    journal_entry_id: null,
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    lines: [
      {
        id: 1,
        manual_entry_id: 99,
        line_number: 1,
        account_number: '6110',
        debit_ore: 50000,
        credit_ore: 0,
        description: null,
      },
      {
        id: 2,
        manual_entry_id: 99,
        line_number: 2,
        account_number: '1930',
        debit_ore: 0,
        credit_ore: 50000,
        description: null,
      },
    ],
    ...overrides,
  }
}

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
  setupMockIpc()
  mockIpcResponse('company:get', {
    success: true,
    data: {
      id: 1,
      fiscal_rule: 'K2',
      name: 'Test AB',
      org_number: '556000-0000',
      address: '',
      postal_code: '',
      city: '',
      country: 'SE',
      bankgiro: null,
      plusgiro: null,
      iban: null,
      bic: null,
      phone: null,
      email: null,
      website: null,
      contact_person: null,
    },
  })
  mockIpcResponse('account:list', { success: true, data: [] })
  mockIpcResponse('manual-entry:save-draft', {
    success: true,
    data: { id: 100 },
  })
  mockIpcResponse('manual-entry:update-draft', {
    success: true,
    data: { id: 99 },
  })
  mockIpcResponse('manual-entry:finalize', {
    success: true,
    data: { id: 100, journal_entry_id: 1, verification_number: 1 },
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

// ── Render helper ────────────────────────────────────────────────────

async function renderForm(initialData?: ManualEntryWithLines) {
  const onSave = vi.fn()
  const onCancel = vi.fn()
  const result = await renderWithProviders(
    <ManualEntryForm
      fiscalYearId={1}
      initialData={initialData}
      onSave={onSave}
      onCancel={onCancel}
    />,
  )
  return { ...result, onSave, onCancel }
}

// ── C1: Rad-hantering ─────────────────────────────────────────────────

describe('ManualEntryForm — rad-hantering', () => {
  it('C1.1: create-mode visar 3 tomma rader från start', async () => {
    await renderForm()
    // Three rows exist (placeholder "1910" on each account input)
    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    expect(accountInputs.length).toBe(3)
  })

  it('C1.2: + Lägg till rad lägger till en rad', async () => {
    await renderForm()
    const addBtn = screen.getByText('+ Lägg till rad')
    await act(async () => {
      fireEvent.click(addBtn)
    })
    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    expect(accountInputs.length).toBe(4)
  })

  it('C1.3: Ta bort rad minskar radantalet (ej under 1)', async () => {
    await renderForm()
    const removeBtns = screen.getAllByRole('button', {
      name: /ta bort rad/i,
    })
    // Remove first row
    await act(async () => {
      fireEvent.click(removeBtns[0])
    })
    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    expect(accountInputs.length).toBe(2)
  })

  it('C1.4: edit-mode förifyller rader från initialData', async () => {
    const draft = makeManualEntryDraft()
    await renderForm(draft)
    // Both account numbers from draft lines should appear
    expect(screen.getByDisplayValue('6110')).toBeDefined()
    expect(screen.getByDisplayValue('1930')).toBeDefined()
  })
})

// ── C2: D/K-saldovalidering ──────────────────────────────────────────

describe('ManualEntryForm — D/K-saldovalidering', () => {
  it('C2.1: Bokför-knappen är inaktiverad när debet ≠ kredit', async () => {
    await renderForm()
    const bookBtn = screen.getByRole('button', { name: /bokför/i })
    // Initial state: all amounts empty → not balanced → disabled
    expect((bookBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('C2.2: Bokför-knappen aktiveras när debet = kredit med >= 2 aktiva rader', async () => {
    await renderForm()

    // Fill date
    const dateInput = screen.getByLabelText(/datum/i)
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-01-15' } })
    })

    // Get account inputs (placeholder="1910") and debet/kredit inputs (placeholder="0")
    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    const zeroInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '0')

    // Row 0: account 6110, debet 500
    await act(async () => {
      fireEvent.change(accountInputs[0], { target: { value: '6110' } })
      fireEvent.change(zeroInputs[0], { target: { value: '500' } }) // debet row 0
    })
    // Row 1: account 1930, kredit 500
    await act(async () => {
      fireEvent.change(accountInputs[1], { target: { value: '1930' } })
      fireEvent.change(zeroInputs[3], { target: { value: '500' } }) // kredit row 1
    })

    const bookBtn = screen.getByRole('button', { name: /bokför/i })
    expect((bookBtn as HTMLButtonElement).disabled).toBe(false)
  })

  it('C2.3: Differens-text visar "debet > kredit" vid obalans', async () => {
    await renderForm()
    const zeroInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '0')
    await act(async () => {
      fireEvent.change(zeroInputs[0], { target: { value: '500' } })
    })
    expect(screen.getByText(/debet > kredit/)).toBeDefined()
  })
})

// ── C3: Submit-flöde ──────────────────────────────────────────────────

describe('ManualEntryForm — submit', () => {
  it('C3.1: Spara utkast anropar onSave vid lyckat IPC-svar', async () => {
    const { onSave } = await renderForm()

    const dateInput = screen.getByLabelText(/datum/i)
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-01-15' } })
    })

    // Must have at least one line with account + amount for payload to pass schema
    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    const zeroInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '0')

    await act(async () => {
      fireEvent.change(accountInputs[0], { target: { value: '6110' } })
      fireEvent.change(zeroInputs[0], { target: { value: '500' } })
    })

    const saveBtn = screen.getByRole('button', { name: /spara utkast/i })
    await act(async () => {
      fireEvent.click(saveBtn)
    })

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })

  it('C3.2: Avbryt anropar onCancel utan att spara', async () => {
    const { onCancel, onSave } = await renderForm()
    const cancelBtn = screen.getByRole('button', { name: /avbryt/i })
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('C3.3: Bokför balanserat verifikat anropar onSave', async () => {
    const { onSave } = await renderForm()

    const dateInput = screen.getByLabelText(/datum/i)
    await act(async () => {
      fireEvent.change(dateInput, { target: { value: '2026-01-15' } })
    })

    const accountInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '1910')
    const zeroInputs = screen
      .getAllByRole('textbox')
      .filter((el) => el.getAttribute('placeholder') === '0')

    await act(async () => {
      fireEvent.change(accountInputs[0], { target: { value: '6110' } })
      fireEvent.change(zeroInputs[0], { target: { value: '500' } })
      fireEvent.change(accountInputs[1], { target: { value: '1930' } })
      fireEvent.change(zeroInputs[3], { target: { value: '500' } })
    })

    const bookBtn = screen.getByRole('button', { name: /bokför/i })
    await act(async () => {
      fireEvent.click(bookBtn)
    })

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
    })
  })
})
