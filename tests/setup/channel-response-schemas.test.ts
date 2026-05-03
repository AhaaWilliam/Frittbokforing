// @vitest-environment jsdom
/**
 * F59: Tests for per-channel response-schema validation in mock-IPC.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setupMockIpc, mockIpcResponse } from './mock-ipc'

beforeEach(() => {
  setupMockIpc()
})

describe('F59 — per-channel response-schema validation', () => {
  it('channel with response schema: correct data passes', () => {
    expect(() => {
      mockIpcResponse('fiscal-year:list', {
        success: true,
        data: [
          {
            id: 1,
            company_id: 1,
            year_label: '2026',
            start_date: '2026-01-01',
            end_date: '2026-12-31',
            is_closed: 0,
            annual_report_status: 'not_started',
            closed_at: null,
          },
        ],
      })
    }).not.toThrow()
  })

  it('channel with response schema: incorrect data throws', () => {
    expect(() => {
      mockIpcResponse('fiscal-year:list', {
        success: true,
        data: [{ id: 'not-a-number' }], // Invalid: id must be number
      })
    }).toThrow(/data does not match response schema/)
  })

  it('loose passthrough schema accepts any object shape', () => {
    // Sprint U: alla channels i channelResponseMap har nu tight (eller
    // loose passthrough) schemas — inga z.unknown() kvar. LooseObject-
    // baserade schemas (company:update, product:deactivate etc) tillåter
    // valfria extra fält via `.passthrough()` men kräver ett object.
    expect(() => {
      mockIpcResponse('company:update', {
        success: true,
        data: { anything: 'goes' },
      })
    }).not.toThrow()
  })

  it('NO_SCHEMA_CHANNELS: completely exempt from validation', () => {
    expect(() => {
      mockIpcResponse('settings:get', 42) // raw value, no IpcResult
    }).not.toThrow()
  })

  it('skipDataValidation: true allows incorrect data', () => {
    expect(() => {
      mockIpcResponse(
        'fiscal-year:list',
        { success: true, data: [{ id: 'bad' }] },
        { skipDataValidation: true },
      )
    }).not.toThrow()
  })

  it('error response bypasses data-schema check', () => {
    // Error responses don't have data → no data-schema check
    expect(() => {
      mockIpcResponse('fiscal-year:list', {
        success: false,
        error: 'Something failed',
        code: 'VALIDATION_ERROR',
      })
    }).not.toThrow()
  })

  it('opening-balance:net-result validates data shape', () => {
    expect(() => {
      mockIpcResponse('opening-balance:net-result', {
        success: true,
        data: { netResultOre: 5000, isAlreadyBooked: false },
      })
    }).not.toThrow()

    expect(() => {
      mockIpcResponse('opening-balance:net-result', {
        success: true,
        data: { netResultOre: 'not-a-number' },
      })
    }).toThrow(/data does not match response schema/)
  })
})
