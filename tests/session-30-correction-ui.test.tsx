// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc, mockIpcResponse } from './setup/mock-ipc'
import { renderWithProviders } from './helpers/render-with-providers'
import { PageManualEntries } from '../src/renderer/pages/PageManualEntries'

// --- Fixtures ---

const BOOKED_ENTRY = {
  id: 1,
  entry_date: '2026-03-01',
  description: 'Manuell testbokning',
  verification_number: 1,
  verification_series: 'C',
  total_amount_ore: 10000,
  journal_entry_id: 10,
  je_status: 'booked',
  corrects_entry_id: null,
  corrected_by_id: null,
}

const CORRECTED_ENTRY = {
  ...BOOKED_ENTRY,
  id: 2,
  verification_number: 2,
  journal_entry_id: 11,
  je_status: 'corrected',
  corrected_by_id: 12,
}

const CORRECTION_ENTRY = {
  ...BOOKED_ENTRY,
  id: 3,
  verification_number: 3,
  journal_entry_id: 12,
  je_status: 'booked',
  corrects_entry_id: 11,
  description: 'Korrigering av ver. C2',
}

beforeEach(() => {
  setupMockIpc()
  mockIpcResponse('manual-entry:list-drafts', { success: true, data: [] })
})

describe('B4: Correction UI', () => {
  it('"Korrigerad" badge shown for corrected entries', async () => {
    mockIpcResponse('manual-entry:list', { success: true, data: [CORRECTED_ENTRY] })

    await renderWithProviders(<PageManualEntries />, {
      initialRoute: '/manual-entries',
    })

    await waitFor(() => {
      expect(screen.getByText('Korrigerad')).toBeInTheDocument()
    })
  })

  it('"Korrigering" badge shown for correction entries', async () => {
    mockIpcResponse('manual-entry:list', { success: true, data: [CORRECTION_ENTRY] })

    await renderWithProviders(<PageManualEntries />, {
      initialRoute: '/manual-entries',
    })

    await waitFor(() => {
      expect(screen.getByText('Korrigering')).toBeInTheDocument()
    })
  })

  it('"Korrigera" button shown in view for booked entry', async () => {
    mockIpcResponse('manual-entry:list', { success: true, data: [BOOKED_ENTRY] })
    mockIpcResponse('journal-entry:can-correct', {
      success: true,
      data: { canCorrect: true },
    })

    await renderWithProviders(<PageManualEntries />, {
      initialRoute: '/manual-entries/view/1',
    })

    await waitFor(() => {
      expect(screen.getByText('Korrigera')).toBeInTheDocument()
    })
  })

  it('"Korrigera" button hidden for corrected entries', async () => {
    mockIpcResponse('manual-entry:list', { success: true, data: [CORRECTED_ENTRY] })
    mockIpcResponse('journal-entry:can-correct', {
      success: true,
      data: { canCorrect: false, reason: 'Verifikatet är redan korrigerat.' },
    })

    await renderWithProviders(<PageManualEntries />, {
      initialRoute: '/manual-entries/view/2',
    })

    await waitFor(() => {
      expect(screen.getByText('Verifikat C2')).toBeInTheDocument()
    })

    // Button should not be present
    expect(screen.queryByText('Korrigera')).not.toBeInTheDocument()
  })
})
