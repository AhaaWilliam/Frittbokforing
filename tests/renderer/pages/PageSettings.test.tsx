// @vitest-environment jsdom
/**
 * PageSettings — VS-120 (has_employees-toggle) + VS-121 (vat_frequency-dropdown).
 *
 * Verifierar att formfälten:
 *  - prepopulera från `company:get`
 *  - reagerar på user-input (toggle / select)
 *  - submitar korrekt payload till `company:update`
 *
 * Existerande smoke-test i PageSmoke.test.tsx täcker render-without-crash;
 * detta filtillägg täcker beteende-paritet för fält som tidigare saknat
 * UI-test efter introduktion i Sprint VS-120/121.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { PageSettings } from '../../../src/renderer/pages/PageSettings'

function makeCompany(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test AB',
    org_number: '556000-0000',
    fiscal_rule: 'K2',
    share_capital: 25000,
    registration_date: '2020-01-01',
    board_members: null,
    vat_number: null,
    address_line1: null,
    postal_code: null,
    city: null,
    email: null,
    phone: null,
    bankgiro: null,
    plusgiro: null,
    website: null,
    approved_for_f_tax: 1,
    vat_frequency: 'quarterly',
    has_employees: 0,
    created_at: '2020-01-01',
    ...overrides,
  }
}

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('bank-tx-mapping:list', { success: true, data: [] })
  // SecuritySection läser window.auth.status() vid mount — stubba så
  // PageSettings kan rendera utan att krascha. AutoLockBlock anropar
  // även sessionTimeoutGet (om den finns) för minutes-state.
  ;(window as unknown as { auth: Record<string, unknown> }).auth = {
    status: vi.fn().mockResolvedValue({
      success: true,
      data: {
        locked: false,
        userId: 'u1',
        timeoutMs: 900000,
        msUntilLock: 900000,
      },
    }),
    sessionTimeoutGet: vi.fn().mockResolvedValue({
      success: true,
      data: { timeoutMs: 900000 },
    }),
    sessionTimeoutSet: vi.fn().mockResolvedValue({
      success: true,
      data: { timeoutMs: 900000 },
    }),
  }
})

describe('PageSettings — VS-120/121', () => {
  it('VS-120: has_employees-checkbox prepopulerar från company.has_employees', async () => {
    mockIpcResponse('company:get', {
      success: true,
      data: makeCompany({ has_employees: 1 }),
    })

    await renderWithProviders(<PageSettings />, {
      axeCheck: false, // M133 exempt — BackupSection använder window.api.getSetting (raw)
      initialRoute: '/settings',
    })

    await waitFor(() => {
      expect(screen.getByLabelText(/Bolaget har anställda/)).toBeChecked()
    })
  })

  it('VS-120: has_employees toggle uppdaterar checkboxen', async () => {
    mockIpcResponse('company:get', {
      success: true,
      data: makeCompany({ has_employees: 0 }),
    })

    await renderWithProviders(<PageSettings />, {
      axeCheck: false, // M133 exempt — BackupSection använder window.api.getSetting (raw)
      initialRoute: '/settings',
    })

    const checkbox = await screen.findByLabelText(/Bolaget har anställda/)
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    expect(checkbox).toBeChecked()
  })

  it('VS-121: vat_frequency-dropdown prepopulerar med sparat värde', async () => {
    mockIpcResponse('company:get', {
      success: true,
      data: makeCompany({ vat_frequency: 'monthly' }),
    })

    await renderWithProviders(<PageSettings />, {
      axeCheck: false, // M133 exempt — BackupSection använder window.api.getSetting (raw)
      initialRoute: '/settings',
    })

    await waitFor(() => {
      const select = screen.getByLabelText(
        /Moms-deklarationsfrekvens/,
      ) as HTMLSelectElement
      expect(select.value).toBe('monthly')
    })
  })

  it('VS-121: vat_frequency-dropdown ändrar till yearly', async () => {
    mockIpcResponse('company:get', {
      success: true,
      data: makeCompany({ vat_frequency: 'quarterly' }),
    })

    await renderWithProviders(<PageSettings />, {
      axeCheck: false, // M133 exempt — BackupSection använder window.api.getSetting (raw)
      initialRoute: '/settings',
    })

    const select = (await screen.findByLabelText(
      /Moms-deklarationsfrekvens/,
    )) as HTMLSelectElement
    expect(select.value).toBe('quarterly')
    fireEvent.change(select, { target: { value: 'yearly' } })
    expect(select.value).toBe('yearly')
  })

  it('VS-120+121: submit skickar payload med has_employees + vat_frequency', async () => {
    mockIpcResponse('company:get', {
      success: true,
      data: makeCompany({ has_employees: 0, vat_frequency: 'quarterly' }),
    })
    mockIpcResponse('company:update', {
      success: true,
      data: makeCompany({ has_employees: 1, vat_frequency: 'monthly' }),
    })

    await renderWithProviders(<PageSettings />, {
      axeCheck: false, // M133 exempt — BackupSection använder window.api.getSetting (raw)
      initialRoute: '/settings',
    })

    // Spy på window.api.updateCompany efter setupMockIpc skapat API:et
    const api = (window as unknown as { api: Record<string, unknown> }).api
    const updateSpy = vi.spyOn(
      api as { updateCompany: (...args: unknown[]) => unknown },
      'updateCompany',
    )

    const checkbox = await screen.findByLabelText(/Bolaget har anställda/)
    fireEvent.click(checkbox)

    const select = (await screen.findByLabelText(
      /Moms-deklarationsfrekvens/,
    )) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'monthly' } })

    // Flera "Spara"-knappar finns (BankTxMappings + main form) — välj
    // submit-knappen i company-formet, identifierad genom form-typ.
    const buttons = screen.getAllByRole('button', { name: /^Spara$/ })
    const submit = buttons.find((b) => b.getAttribute('type') === 'submit')
    if (!submit) throw new Error('No submit-button found')
    fireEvent.click(submit)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledTimes(1)
    })
    const payload = updateSpy.mock.calls[0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      has_employees: 1,
      vat_frequency: 'monthly',
    })
  })
})
