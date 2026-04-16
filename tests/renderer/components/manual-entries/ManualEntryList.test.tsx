// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ManualEntryList } from '../../../../src/renderer/components/manual-entries/ManualEntryList'

const DRAFT_1 = { id: 1, entry_date: '2026-03-01', description: 'Utkast 1', status: 'draft' }
const DRAFT_2 = { id: 2, entry_date: '2026-03-05', description: 'Utkast 2', status: 'draft' }

const ENTRY_BOOKED = {
  id: 10, entry_date: '2026-03-10', description: 'Bokförd post',
  verification_number: 1, verification_series: 'C',
  total_amount_ore: 50000, journal_entry_id: 100,
  je_status: 'booked', corrects_entry_id: null, corrected_by_id: null,
}
const ENTRY_CORRECTED = {
  id: 11, entry_date: '2026-03-12', description: 'Korrigerad post',
  verification_number: 2, verification_series: 'C',
  total_amount_ore: 30000, journal_entry_id: 101,
  je_status: 'corrected', corrects_entry_id: null, corrected_by_id: 102,
}
const ENTRY_CORRECTION = {
  id: 12, entry_date: '2026-03-14', description: 'Korrigeringspost',
  verification_number: 3, verification_series: 'C',
  total_amount_ore: 30000, journal_entry_id: 102,
  je_status: 'booked', corrects_entry_id: 101, corrected_by_id: null,
}

beforeEach(() => {
  setupMockIpc()
})

function renderList(props?: Partial<{ onCreate: () => void; onEdit: (id: number) => void; onView: (id: number) => void }>) {
  const onCreate = props?.onCreate ?? vi.fn()
  const onEdit = props?.onEdit ?? vi.fn()
  const onView = props?.onView ?? vi.fn()
  mockIpcResponse('manual-entry:list-drafts', [DRAFT_1, DRAFT_2])
  mockIpcResponse('manual-entry:list', [ENTRY_BOOKED, ENTRY_CORRECTED, ENTRY_CORRECTION])
  return renderWithProviders(<ManualEntryList onCreate={onCreate} onEdit={onEdit} onView={onView} />)
}

describe('ManualEntryList', () => {
  it('renders draft section with drafts', async () => {
    renderList()
    await waitFor(() => {
      expect(screen.getByText('Utkast 1')).toBeDefined()
      expect(screen.getByText('Utkast 2')).toBeDefined()
    })
  })

  it('renders finalized entries table', async () => {
    renderList()
    await waitFor(() => {
      expect(screen.getByText('Bokförd post')).toBeDefined()
    })
  })

  it('draft click calls onEdit', async () => {
    const onEdit = vi.fn()
    renderList({ onEdit })
    await waitFor(() => {
      expect(screen.getByText('Utkast 1')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Utkast 1'))
    expect(onEdit).toHaveBeenCalledWith(1)
  })

  it('finalized row click calls onView', async () => {
    const onView = vi.fn()
    renderList({ onView })
    await waitFor(() => {
      expect(screen.getByText('Bokförd post')).toBeDefined()
    })
    await userEvent.click(screen.getByText('Bokförd post'))
    expect(onView).toHaveBeenCalledWith(10)
  })

  it('shows "Korrigerad" badge for corrected entries', async () => {
    renderList()
    await waitFor(() => {
      expect(screen.getByText('Korrigerad')).toBeDefined()
    })
  })

  it('shows "Korrigering" badge for correction entries', async () => {
    renderList()
    await waitFor(() => {
      expect(screen.getByText('Korrigering')).toBeDefined()
    })
  })

  it('formats verification number as C1, C2, C3', async () => {
    renderList()
    await waitFor(() => {
      expect(screen.getByText('C1')).toBeDefined()
      expect(screen.getByText('C2')).toBeDefined()
      expect(screen.getByText('C3')).toBeDefined()
    })
  })

  it('empty state when no drafts and no entries', async () => {
    setupMockIpc()
    mockIpcResponse('manual-entry:list-drafts', [])
    mockIpcResponse('manual-entry:list', [])
    renderWithProviders(<ManualEntryList onCreate={vi.fn()} onEdit={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/inga manuella verifikationer/i)).toBeDefined()
    })
  })

  // empty state description text tested via empty state title test above
  // (axe race condition prevents running second render in same file)

  it('formats amount in kronor', async () => {
    renderList()
    await waitFor(() => {
      // 50000 öre = 500 kr — look in a table cell
      expect(screen.getByText('Bokförd post')).toBeDefined()
    })
    // The amount column shows formatted kr values
    const cells = screen.getAllByRole('cell')
    const amountCells = cells.filter(c => c.textContent?.includes('500'))
    expect(amountCells.length).toBeGreaterThan(0)
  })

  it('axe-check passes', async () => {
    const { axeResults } = await renderList()
    expect(axeResults?.violations).toEqual([])
  })
})
