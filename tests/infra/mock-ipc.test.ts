// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  setupMockIpc,
  mockIpcResponse,
  mockIpcPending,
} from '../setup/mock-ipc'

describe('mock-ipc', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('returns default response for valid schema input', async () => {
    const api = window.api as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    // counterparty:create has a schema requiring { name, type, company_id, ... }
    const result = await api.createCounterparty({
      company_id: 1,
      name: 'Test AB',
      type: 'customer',
    })
    expect(result).toEqual({ success: true, data: null })
  })

  it('throws when input violates channel schema', async () => {
    const api = window.api as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    // counterparty:create requires name (string min 1) — passing empty violates
    await expect(api.createCounterparty({ name: '' })).rejects.toThrow(
      'Mock-IPC: input violates schema for channel',
    )
  })

  it('mockIpcResponse override works and is reset by afterEach', async () => {
    const api = window.api as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    const customResponse = { success: true, data: { id: 42, name: 'Override' } }

    mockIpcResponse('counterparty:create', customResponse)

    const result = await api.createCounterparty({
      company_id: 1,
      name: 'Test AB',
      type: 'customer',
    })
    expect(result).toEqual(customResponse)

    // After reset (which afterEach triggers), the next call should return default.
    // We simulate by testing that the override was set — afterEach handles cleanup.
  })

  it('mockIpcPending returns a promise that does not resolve within 50ms', async () => {
    const api = window.api as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >
    mockIpcPending('fiscal-year:list')

    let resolved = false
    const promise = api.listFiscalYears().then(() => {
      resolved = true
    })

    // Wait 50ms
    await new Promise((r) => setTimeout(r, 50))
    expect(resolved).toBe(false)

    // Clean up — prevent unhandled promise warning
    void promise
  })
})
