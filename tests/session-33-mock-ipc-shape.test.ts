// @vitest-environment jsdom
/**
 * Sprint 33 F57 — Mock-IPC response-shape validation.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { setupMockIpc, mockIpcResponse } from './setup/mock-ipc'

beforeEach(() => {
  setupMockIpc()
})

describe('F57: mockIpcResponse shape validation', () => {
  it('throws if response lacks success field', () => {
    expect(() => {
      mockIpcResponse('invoice:list', { data: [] })
    }).toThrow('does not match IpcResult shape')
  })

  it('throws if success=true with wrong type for success', () => {
    expect(() => {
      mockIpcResponse('invoice:list', { success: 'yes', data: [] })
    }).toThrow('does not match IpcResult shape')
  })

  it('throws if success=false but missing error/code', () => {
    expect(() => {
      mockIpcResponse('invoice:list', { success: false })
    }).toThrow('does not match IpcResult shape')
  })

  it('throws if extra fields present (strict)', () => {
    expect(() => {
      mockIpcResponse('invoice:list', { success: true, data: 1, extra: 2 })
    }).toThrow('does not match IpcResult shape')
  })

  it('accepts correct success response', () => {
    // skipDataValidation: detta test validerar enbart IpcResult-shape (F57),
    // inte per-kanal-data-schema (F59) som kräver tät fixture.
    expect(() => {
      mockIpcResponse(
        'invoice:list',
        { success: true, data: [] },
        { skipDataValidation: true },
      )
    }).not.toThrow()
  })

  it('accepts correct error response', () => {
    expect(() => {
      mockIpcResponse('invoice:list', {
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
      })
    }).not.toThrow()
  })

  it('NO_SCHEMA_CHANNELS exempt from shape validation', () => {
    expect(() => {
      mockIpcResponse('db:health-check', 'ok')
    }).not.toThrow()
    expect(() => {
      mockIpcResponse('account:list-all', { success: true, data: [{ id: 1 }] })
    }).not.toThrow()
  })
})
