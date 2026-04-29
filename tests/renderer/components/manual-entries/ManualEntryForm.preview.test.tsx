// @vitest-environment jsdom
/**
 * Sprint 18 — ManualEntryForm + ConsequencePane wire-in (ADR 006).
 *
 * Verifierar att form-state kopplas till useJournalPreview och att
 * ConsequencePane renderas i höger-zon.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ManualEntryForm } from '../../../../src/renderer/components/manual-entries/ManualEntryForm'

describe('ManualEntryForm — preview wire-in', () => {
  beforeEach(() => {
    setupMockIpc()
    // Default account list for picker
    mockIpcResponse('account:list', {
      success: true,
      data: [
        { account_number: '1930', name: 'Bankkonto', is_active: 1 },
        { account_number: '6230', name: 'Telefoni', is_active: 1 },
      ],
    })
    mockIpcResponse('company:get', {
      success: true,
      data: {
        id: 1,
        name: 'Acme AB',
        org_number: '5560000000',
        fiscal_rule: 'K2',
      },
    })
  })

  afterEach(() => {
    // mock-ipc registrerar sin egen afterEach — inget extra här.
  })

  it('renders consequence pane with idle state when form is empty', async () => {
    await renderWithProviders(
      <ManualEntryForm
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByTestId('manual-entry-consequence')).toBeInTheDocument()
    // Form starts with no valid lines (no account + no amount), so pane is idle.
    expect(screen.getByTestId('consequence-pane-idle')).toBeInTheDocument()
  })

  it('passes valid input to preview channel and renders active state', async () => {
    // Mock preview-IPC respons för en balanserad post
    mockIpcResponse('preview:journal-lines', {
      success: true,
      data: {
        source: 'manual',
        lines: [
          {
            account_number: '1930',
            account_name: 'Bankkonto',
            debit_ore: 50000,
            credit_ore: 0,
            description: null,
          },
          {
            account_number: '6230',
            account_name: 'Telefoni',
            debit_ore: 0,
            credit_ore: 50000,
            description: null,
          },
        ],
        total_debit_ore: 50000,
        total_credit_ore: 50000,
        balanced: true,
        entry_date: '2026-04-29',
        description: null,
        warnings: [],
      },
    })

    const initialData = {
      id: 99,
      fiscal_year_id: 1,
      entry_date: '2026-04-29',
      description: 'Test',
      status: 'draft' as const,
      journal_entry_id: null,
      created_at: '2026-04-29T10:00:00Z',
      updated_at: '2026-04-29T10:00:00Z',
      lines: [
        {
          id: 1,
          manual_entry_id: 99,
          line_number: 1,
          account_number: '1930',
          debit_ore: 50000,
          credit_ore: 0,
          description: null,
        },
        {
          id: 2,
          manual_entry_id: 99,
          line_number: 2,
          account_number: '6230',
          debit_ore: 0,
          credit_ore: 50000,
          description: null,
        },
      ],
    }

    await renderWithProviders(
      <ManualEntryForm
        initialData={initialData}
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )

    // Pane ska switcha från idle till active när preview kommer in
    await waitFor(
      () => {
        expect(
          screen.queryByTestId('consequence-pane-active'),
        ).toBeInTheDocument()
      },
      { timeout: 2000 },
    )

    // Visar "Balanserar" pill
    expect(screen.getByText('Balanserar')).toBeInTheDocument()
  })

  it('omits IPC call when no lines have account + amount', async () => {
    // Spy på window.api.previewJournalLines
    await renderWithProviders(
      <ManualEntryForm
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    // Default state: tre tomma rader → ingen ska skickas
    // Ger debounce-timer chans att förfalla — om vi anropade IPC skulle
    // mock-ipc returnera DEFAULT_RESPONSE och pane skulle inte vara idle.
    await new Promise((r) => setTimeout(r, 250))
    expect(screen.getByTestId('consequence-pane-idle')).toBeInTheDocument()
  })

  it('renders ConsequencePane after lg breakpoint (hidden lg:block class)', async () => {
    await renderWithProviders(
      <ManualEntryForm
        fiscalYearId={1}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    )
    const aside = screen.getByTestId('manual-entry-consequence')
    expect(aside.className).toContain('hidden')
    expect(aside.className).toContain('lg:block')
    expect(aside.getAttribute('aria-label')).toBe('Konsekvens')
  })
})
