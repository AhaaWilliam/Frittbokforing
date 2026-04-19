// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  ActiveCompanyProvider,
  useActiveCompany,
} from '../../../src/renderer/contexts/ActiveCompanyContext'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../../setup/mock-ipc'
import type { Company } from '../../../src/shared/types'

function makeCompany(overrides: Partial<Company> & { id: number }): Company {
  return {
    name: `Bolag ${overrides.id}`,
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    base_currency: 'SEK',
    registration_date: '2025-01-01',
    vat_number: null,
    email: null,
    phone: null,
    address_line1: null,
    address_line2: null,
    postal_code: null,
    city: null,
    country: 'SE',
    bankgiro: null,
    plusgiro: null,
    website: null,
    board_members: null,
    created_at: '2025-01-01 00:00:00',
    ...overrides,
  } as Company
}

const c1 = makeCompany({ id: 1 })
const c2 = makeCompany({ id: 2, name: 'Bolag B' })
const c3 = makeCompany({ id: 3, name: 'Bolag C' })

function makeWrapper(opts?: {
  companies?: Company[]
  settingsGet?: number | null
  settingsGetPending?: boolean
}) {
  const {
    companies = [c1, c2, c3],
    settingsGet = null,
    settingsGetPending = false,
  } = opts ?? {}

  mockIpcResponse('company:list', { success: true, data: companies })
  mockIpcResponse('company:switch', {
    success: true,
    data: companies[0] ?? null,
  })
  if (settingsGetPending) {
    mockIpcPending('settings:get')
  } else {
    mockIpcResponse('settings:get', settingsGet)
  }
  mockIpcResponse('settings:set', undefined)

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ActiveCompanyProvider>{children}</ActiveCompanyProvider>
    </QueryClientProvider>
  )
}

type MockFn = ReturnType<typeof vi.fn>

function switchCompanyCalls(): unknown[][] {
  return (window.api as unknown as Record<string, MockFn>).switchCompany.mock
    .calls
}

beforeEach(() => {
  setupMockIpc()
})

describe('ActiveCompanyContext — resolution chain', () => {
  it('selectedCompany takes priority over restoredId', async () => {
    const wrapper = makeWrapper({ settingsGet: c3.id })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c3.id))

    act(() => result.current.setActiveCompany(c2))

    expect(result.current.activeCompany?.id).toBe(c2.id)
  })

  it('restoredId is used when no selectedCompany', async () => {
    const wrapper = makeWrapper({ settingsGet: c2.id })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c2.id))
  })

  it('first company when no restored id', async () => {
    const wrapper = makeWrapper({ settingsGet: null })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c1.id))
  })

  it('falls through when restoredId points to missing company', async () => {
    const wrapper = makeWrapper({ settingsGet: 9999 })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c1.id))
  })
})

describe('ActiveCompanyContext — auto-persist gating (M102-mönstret)', () => {
  it('no auto-persist before settings:get resolves', async () => {
    const wrapper = makeWrapper({ settingsGetPending: true })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.allCompanies).toHaveLength(3))

    expect(switchCompanyCalls()).toHaveLength(0)
  })

  it('auto-persist fires after settings:get resolves as null', async () => {
    const wrapper = makeWrapper({ settingsGet: null })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c1.id))

    await waitFor(() => expect(switchCompanyCalls().length).toBeGreaterThan(0))
    expect(switchCompanyCalls()[0]).toEqual([{ company_id: c1.id }])
  })

  it('no auto-persist when restoredId is valid', async () => {
    const wrapper = makeWrapper({ settingsGet: c2.id })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c2.id))

    expect(switchCompanyCalls()).toHaveLength(0)
  })
})

describe('ActiveCompanyContext — setActiveCompany', () => {
  it('calls company:switch with the company id', async () => {
    const wrapper = makeWrapper({ settingsGet: c2.id })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.activeCompany?.id).toBe(c2.id))

    act(() => result.current.setActiveCompany(c3))

    expect(switchCompanyCalls()).toHaveLength(1)
    expect(switchCompanyCalls()[0]).toEqual([{ company_id: c3.id }])
  })
})

describe('ActiveCompanyContext — edge cases', () => {
  it('handles empty company list without crashing', async () => {
    const wrapper = makeWrapper({ companies: [], settingsGet: null })
    const { result } = renderHook(() => useActiveCompany(), { wrapper })

    await waitFor(() => expect(result.current.allCompanies).toHaveLength(0))
    expect(result.current.activeCompany).toBeNull()
  })
})

describe('useActiveCompany outside provider', () => {
  it('throws when used without ActiveCompanyProvider', () => {
    expect(() => {
      renderHook(() => useActiveCompany())
    }).toThrow('useActiveCompany måste användas inom ActiveCompanyProvider')
  })
})
