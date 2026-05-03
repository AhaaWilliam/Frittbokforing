// @vitest-environment jsdom
/**
 * VS-140 — regressionstest mot "useNavigate must be used within HashRouter".
 *
 * BAKGRUND: I produktion saknades HashRouter ovanför Vardag-mode-trädet
 * (HashRouter monterades bara i AppShell, dvs. bokförare-mode). VardagApp
 * använder useNavigate (sedan VS-117) och kraschade vid mount → ErrorFallback.
 *
 * Testet missade detta tidigare eftersom renderWithProviders alltid wrappar
 * sina barn i HashRouter. Detta test mountar full <App /> utan den hjälpen,
 * forcerar Vardag-mode, och verifierar att ErrorFallback INTE visas.
 *
 * För att fånga samma klass av bugg framöver: ny mode/route-relaterad kod
 * ska inte anta att en specifik mode-skal mountar HashRouter — den måste
 * finnas ovanför hela ModeRouter (App.tsx).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setupMockIpc, mockIpcResponse } from '../setup/mock-ipc'
import App from '../../src/renderer/App'

beforeEach(() => {
  setupMockIpc()

  // Auth: unlocked
  ;(window as unknown as { auth: Record<string, unknown> }).auth = {
    status: vi.fn().mockResolvedValue({
      success: true,
      data: {
        locked: false,
        userId: 'u1',
        timeoutMs: 900_000,
        msUntilLock: 900_000,
      },
    }),
    listUsers: vi.fn().mockResolvedValue({ success: true, data: [] }),
    logout: vi.fn().mockResolvedValue({ success: true, data: { ok: true } }),
    sessionTimeoutGet: vi.fn().mockResolvedValue({
      success: true,
      data: { timeoutMs: 900_000 },
    }),
    sessionTimeoutSet: vi.fn().mockResolvedValue({
      success: true,
      data: { timeoutMs: 900_000 },
    }),
  }

  // Minst ett bolag (annars hamnar vi i OnboardingWizard, inte ModeRouter)
  const company = {
    id: 1,
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 25_000,
    registration_date: '2025-01-01',
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
      notify_vat_deadline: 0,
    created_at: '2025-01-01',
  }
  mockIpcResponse('company:list', { success: true, data: [company] })
  mockIpcResponse('company:switch', { success: true, data: company })
  mockIpcResponse('fiscal-year:list', { success: true, data: [] })
  mockIpcResponse('settings:set', undefined)
  mockIpcResponse('expense:list-drafts', { success: true, data: [] })
  mockIpcResponse('invoice:list-drafts', { success: true, data: [] })
  mockIpcResponse('verification:latest', { success: true, data: null })
  mockIpcResponse('receipt:counts', {
    success: true,
    data: { inbox: 0, booked: 0, archived: 0 },
  })
})

describe('VS-140 — App-router-mount-regression', () => {
  it('mountar utan att kasta useNavigate-fel i Vardag-mode', async () => {
    // Settings: ui_mode='vardag' + last_company_id=1.
    // mock-ipc-helpern saknar nyckel-baserad differentiering för settings:get,
    // så vi stubbar en raw window.api.getSetting som returnerar rätt värde
    // per nyckel.
    const apiObj = (window as unknown as { api: Record<string, unknown> }).api
    apiObj.getSetting = vi.fn().mockImplementation((key: string) => {
      if (key === 'ui_mode') return Promise.resolve('vardag')
      if (key === 'last_company_id') return Promise.resolve(1)
      if (key === 'last_fiscal_year_id') return Promise.resolve(null)
      return Promise.resolve(null)
    })

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    render(
      <QueryClientProvider client={qc}>
        <App />
      </QueryClientProvider>,
    )

    // Vänta tills auth + companies + ui_mode resolverat. Vi kollar att
    // ErrorFallback ('Något gick fel') INTE visas — det är pre-fix-symptomet.
    // Specifika Vardag-element behöver inte rendera korrekt här (FY saknas);
    // det enda vi vill verifiera är att HashRouter-context når hela trädet.
    await waitFor(
      () => {
        expect(screen.queryByText('Något gick fel')).toBeNull()
      },
      { timeout: 3000 },
    )
    expect(
      screen.queryByText(/useNavigate must be used within HashRouter/),
    ).toBeNull()
  })
})
