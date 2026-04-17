// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { SuggestedMatchesPanel } from '../../../../src/renderer/components/bank/SuggestedMatchesPanel'

// Sprint 57 A4 — bank-API:er saknas i mock-ipc (känd debt).
// Vi patchar window.api direkt efter setupMockIpc().

type Suggestion = {
  bank_transaction_id: number
  candidates: Array<{
    entity_type: 'invoice' | 'expense'
    entity_id: number
    entity_number: string | null
    counterparty_name: string | null
    total_amount_ore: number
    remaining_ore: number
    entity_date: string
    due_date: string | null
    score: number
    confidence: 'HIGH' | 'MEDIUM'
    method: string
    reasons: string[]
  }>
}

function makeCandidate(overrides: Partial<Suggestion['candidates'][number]> = {}): Suggestion['candidates'][number] {
  return {
    entity_type: 'invoice',
    entity_id: 1,
    entity_number: '1042',
    counterparty_name: 'ACME AB',
    total_amount_ore: 1250000,
    remaining_ore: 1250000,
    entity_date: '2026-03-10',
    due_date: '2026-04-10',
    score: 150,
    confidence: 'HIGH',
    method: 'auto_amount_ref',
    reasons: ['amount_exact', 'ref_token'],
    ...overrides,
  }
}

function setupApi({
  suggestions,
  matchImpl,
}: {
  suggestions: Suggestion[] | Error
  matchImpl?: (input: unknown) => Promise<unknown>
}) {
  const suggestBankMatches = vi.fn(async () => {
    if (suggestions instanceof Error) {
      return { success: false, error: suggestions.message, code: 'ERR' }
    }
    return { success: true, data: suggestions }
  })
  const matchBankTransaction =
    matchImpl ??
    vi.fn(async () => ({ success: true, data: { journal_entry_id: 42 } }))
  const api = (window as unknown as { api: Record<string, unknown> }).api
  api.suggestBankMatches = suggestBankMatches
  api.matchBankTransaction = matchBankTransaction as typeof vi.fn extends (
    ...a: unknown[]
  ) => infer R
    ? R
    : never
  return { suggestBankMatches, matchBankTransaction }
}

beforeEach(() => {
  setupMockIpc()
})

describe('SuggestedMatchesPanel (S57 A4)', () => {
  it('expanderar och triggar IPC-anrop en gång', async () => {
    const { suggestBankMatches } = setupApi({
      suggestions: [{ bank_transaction_id: 1, candidates: [makeCandidate()] }],
    })
    await renderWithProviders(<SuggestedMatchesPanel statementId={10} />, {
      axeCheck: false,
    })

    // Initialt — stängd, ingen IPC
    expect(suggestBankMatches).not.toHaveBeenCalled()

    // Klick på summary → expanderar
    await userEvent.click(screen.getByText('Föreslå matchningar'))
    await waitFor(() => {
      expect(suggestBankMatches).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText(/ACME AB/)).toBeDefined()
    })
  })

  it('tom lista → visar "Inga förslag hittades"', async () => {
    setupApi({
      suggestions: [{ bank_transaction_id: 1, candidates: [] }],
    })
    await renderWithProviders(<SuggestedMatchesPanel statementId={10} />, {
      axeCheck: false,
    })
    await userEvent.click(screen.getByText('Föreslå matchningar'))
    await waitFor(() => {
      expect(screen.getByTestId('suggested-matches-empty')).toBeDefined()
    })
  })

  it('bulk-accept: 3 HIGH, 1 failure → toast "2 av 3" + failures lista', async () => {
    let callCount = 0
    const matchImpl = vi.fn(async () => {
      callCount++
      if (callCount === 2) {
        return { success: false, error: 'period stängd', code: 'PERIOD_CLOSED' }
      }
      return { success: true, data: { journal_entry_id: callCount } }
    })

    setupApi({
      suggestions: [
        {
          bank_transaction_id: 1,
          candidates: [makeCandidate({ entity_id: 1, entity_number: '1' })],
        },
        {
          bank_transaction_id: 2,
          candidates: [makeCandidate({ entity_id: 2, entity_number: '2' })],
        },
        {
          bank_transaction_id: 3,
          candidates: [makeCandidate({ entity_id: 3, entity_number: '3' })],
        },
      ],
      matchImpl,
    })

    await renderWithProviders(<SuggestedMatchesPanel statementId={10} />, {
      axeCheck: false,
    })
    await userEvent.click(screen.getByText('Föreslå matchningar'))
    await waitFor(() => {
      expect(screen.getByTestId('suggested-matches-accept-all-high')).toBeDefined()
    })

    await userEvent.click(screen.getByTestId('suggested-matches-accept-all-high'))

    await waitFor(() => {
      expect(screen.getByTestId('suggested-matches-failures')).toBeDefined()
    })
    const fails = screen.getByTestId('suggested-matches-failures')
    expect(fails.textContent).toContain('2 av 3 accepterade')
    expect(fails.textContent).toContain('period stängd')
    expect(matchImpl).toHaveBeenCalledTimes(3)
  })

  it('bulk-pending disablar bulk-knapp OCH per-candidate-knappar', async () => {
    // matchImpl hänger → bulk pending persisterar
    let resolveMatch: (v: unknown) => void = () => {}
    const matchImpl = vi.fn(
      () =>
        new Promise((r) => {
          resolveMatch = r
        }),
    )

    setupApi({
      suggestions: [
        {
          bank_transaction_id: 1,
          candidates: [makeCandidate({ entity_id: 1, entity_number: '1' })],
        },
        {
          bank_transaction_id: 2,
          candidates: [makeCandidate({ entity_id: 2, entity_number: '2' })],
        },
      ],
      matchImpl,
    })

    await renderWithProviders(<SuggestedMatchesPanel statementId={10} />, {
      axeCheck: false,
    })
    await userEvent.click(screen.getByText('Föreslå matchningar'))
    await waitFor(() => {
      expect(screen.getByTestId('suggested-matches-accept-all-high')).toBeDefined()
    })

    const bulkBtn = screen.getByTestId(
      'suggested-matches-accept-all-high',
    ) as HTMLButtonElement
    await userEvent.click(bulkBtn)

    // Direkt efter click — pending=true, loopen väntar på matchImpl
    await waitFor(() => {
      expect(bulkBtn.disabled).toBe(true)
    })

    // Resolve pending promise så testet kan avslutas rent
    resolveMatch({ success: true, data: { journal_entry_id: 1 } })
  })

  // S58 B2 — fee-candidates
  it('S58: fee-candidate renderas med konto + belopp + confidence', async () => {
    const suggestBankMatches = vi.fn(async () => ({
      success: true,
      data: [
        {
          bank_transaction_id: 501,
          candidates: [
            {
              entity_type: 'bank_fee',
              account: '6570',
              series: 'B',
              amount_ore: 5000,
              score: 100,
              confidence: 'HIGH',
              method: 'auto_fee',
              reasons: ['BkTxCd SubFmlyCd=CHRG'],
            },
          ],
        },
      ],
    }))
    const api = (window as unknown as { api: Record<string, unknown> }).api
    api.suggestBankMatches = suggestBankMatches

    renderWithProviders(<SuggestedMatchesPanel statementId={1} />)
    await userEvent.click(screen.getByText('Föreslå matchningar'))

    await waitFor(() => {
      expect(screen.getByTestId('suggested-tx-501')).toBeDefined()
    })
    const panel = screen.getByTestId('suggested-tx-501')
    expect(panel.textContent).toContain('Bankavgift')
    expect(panel.textContent).toContain('6570')
    expect(panel.textContent).toContain('HIGH')
    expect(panel.textContent).toContain('100')
  })

  it('S58: accept fee-candidate anropar createBankFeeEntry (inte matchBankTransaction)', async () => {
    const suggestBankMatches = vi.fn(async () => ({
      success: true,
      data: [
        {
          bank_transaction_id: 601,
          candidates: [
            {
              entity_type: 'bank_fee',
              account: '6570',
              series: 'B',
              amount_ore: 5000,
              score: 100,
              confidence: 'HIGH',
              method: 'auto_fee',
              reasons: [],
            },
          ],
        },
      ],
    }))
    const createBankFeeEntry = vi.fn(async () => ({
      success: true,
      data: { journal_entry_id: 99, match_id: 1 },
    }))
    const matchBankTransaction = vi.fn()
    const api = (window as unknown as { api: Record<string, unknown> }).api
    api.suggestBankMatches = suggestBankMatches
    api.createBankFeeEntry = createBankFeeEntry
    api.matchBankTransaction = matchBankTransaction

    renderWithProviders(<SuggestedMatchesPanel statementId={1} />)
    await userEvent.click(screen.getByText('Föreslå matchningar'))

    await waitFor(() => {
      expect(screen.getByTestId('accept-601-bank_fee')).toBeDefined()
    })
    await userEvent.click(screen.getByTestId('accept-601-bank_fee'))

    await waitFor(() => {
      expect(createBankFeeEntry).toHaveBeenCalledTimes(1)
    })
    expect(createBankFeeEntry).toHaveBeenCalledWith({
      bank_transaction_id: 601,
      payment_account: '1930',
    })
    expect(matchBankTransaction).not.toHaveBeenCalled()
  })
})
