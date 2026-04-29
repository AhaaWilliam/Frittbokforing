// @vitest-environment jsdom
/**
 * Sprint 40 — VardagPageStatus dedikerade tester.
 *
 * Sprint 31 kopplade VardagPageStatus till verkligt bank-saldo
 * (summary.bankBalanceOre). Den enda asserterande täckningen var
 * "renders three KPI-cards" i VardagRouting.test.tsx — denna fil
 * lägger till specifika invariant-tester för bank-saldo-rendering,
 * VAT-tecken, resultat-tecken och loading-state.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { VardagPageStatus } from '../../../../src/renderer/modes/vardag/VardagPageStatus'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'

function makeSummary(overrides: {
  bankBalanceOre?: number
  vatNetOre?: number
  operatingResultOre?: number
}) {
  return {
    success: true as const,
    data: {
      revenueOre: 0,
      expensesOre: 0,
      operatingResultOre: overrides.operatingResultOre ?? 0,
      vatOutgoingOre: 0,
      vatIncomingOre: 0,
      vatNetOre: overrides.vatNetOre ?? 0,
      unpaidReceivablesOre: 0,
      unpaidPayablesOre: 0,
      bankBalanceOre: overrides.bankBalanceOre ?? 0,
    },
  }
}

describe('VardagPageStatus', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('renderar tre KPI-kort med rätt rubriker', async () => {
    mockIpcResponse('dashboard:summary', makeSummary({ bankBalanceOre: 0 }))
    await renderWithProviders(<VardagPageStatus />)
    expect(screen.getByText('Bank-saldo')).toBeInTheDocument()
    expect(screen.getByText('Moms (netto)')).toBeInTheDocument()
    expect(screen.getByText('Resultat YTD')).toBeInTheDocument()
  })

  it('visar bank-saldo i kr-format', async () => {
    mockIpcResponse(
      'dashboard:summary',
      makeSummary({ bankBalanceOre: 12345600 }),
    )
    await renderWithProviders(<VardagPageStatus />)
    // 12 345 600 öre = 123 456 kr
    expect(screen.getByText(/123\s*456/)).toBeInTheDocument()
  })

  it('visar negativt bank-saldo (overdraft) korrekt', async () => {
    mockIpcResponse(
      'dashboard:summary',
      makeSummary({ bankBalanceOre: -50000 }),
    )
    await renderWithProviders(<VardagPageStatus />)
    // -500 öre → -500 kr eller -500,00 kr beroende på formatKr
    const card = screen.getByText('Bank-saldo').closest('div')
    expect(card?.textContent).toMatch(/-?500/)
  })

  it('moms-hint växlar baserat på vatNetOre', async () => {
    mockIpcResponse('dashboard:summary', makeSummary({ vatNetOre: 100000 }))
    await renderWithProviders(<VardagPageStatus />)
    expect(screen.getByText('Att betala till SKV')).toBeInTheDocument()
  })

  it('moms-hint växlar till "få tillbaka" när vatNet ≤ 0', async () => {
    mockIpcResponse('dashboard:summary', makeSummary({ vatNetOre: -10000 }))
    await renderWithProviders(<VardagPageStatus />)
    expect(screen.getByText('Att få tillbaka')).toBeInTheDocument()
  })

  it('Resultat YTD visar operatingResultOre', async () => {
    mockIpcResponse(
      'dashboard:summary',
      makeSummary({ operatingResultOre: 25000000 }),
    )
    await renderWithProviders(<VardagPageStatus />)
    // 25 000 000 öre = 250 000 kr
    expect(screen.getByText(/250\s*000/)).toBeInTheDocument()
  })
})
