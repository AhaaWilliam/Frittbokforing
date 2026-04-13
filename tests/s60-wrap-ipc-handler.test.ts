import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { IpcMainInvokeEvent } from 'electron'

// Mock electron-log before import
vi.mock('electron-log', () => ({
  default: { error: vi.fn() },
}))

import { wrapIpcHandler } from '../src/main/ipc/wrap-ipc-handler'
import log from 'electron-log'

const fakeEvent = {} as IpcMainInvokeEvent

const TestSchema = z.object({
  id: z.number(),
  name: z.string(),
})

describe('wrapIpcHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns VALIDATION_ERROR with field on Zod validation failure', async () => {
    const handler = wrapIpcHandler(TestSchema, (_p) => ({ value: 42 }))
    const result = await handler(fakeEvent, { id: 'not-a-number', name: 'ok' })

    expect(result).toEqual({
      success: false,
      error: expect.any(String),
      code: 'VALIDATION_ERROR',
      field: 'id',
    })
  })

  it('passes through IpcResult success from handler', async () => {
    const handler = wrapIpcHandler(TestSchema, (_p) => ({
      success: true as const,
      data: { answer: 42 },
    }))
    const result = await handler(fakeEvent, { id: 1, name: 'test' })

    expect(result).toEqual({ success: true, data: { answer: 42 } })
  })

  it('passes through IpcResult failure from handler', async () => {
    const handler = wrapIpcHandler(TestSchema, (_p) => ({
      success: false as const,
      error: 'Not found',
      code: 'NOT_FOUND' as const,
      field: 'id',
    }))
    const result = await handler(fakeEvent, { id: 1, name: 'test' })

    expect(result).toEqual({
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND',
      field: 'id',
    })
  })

  it('wraps raw T return as { success: true, data: T }', async () => {
    const handler = wrapIpcHandler(TestSchema, (p) => ({
      doubled: p.id * 2,
    }))
    const result = await handler(fakeEvent, { id: 5, name: 'test' })

    expect(result).toEqual({ success: true, data: { doubled: 10 } })
  })

  it('maps thrown structured error to IpcResult failure', async () => {
    const handler = wrapIpcHandler(TestSchema, () => {
      throw { code: 'INVOICE_NOT_FOUND', error: 'Faktura saknas', field: 'id' }
    })
    const result = await handler(fakeEvent, { id: 1, name: 'test' })

    expect(result).toEqual({
      success: false,
      code: 'INVOICE_NOT_FOUND',
      error: 'Faktura saknas',
      field: 'id',
    })
  })

  it('maps thrown Error to UNEXPECTED_ERROR and logs', async () => {
    const handler = wrapIpcHandler(TestSchema, () => {
      throw new Error('DB connection lost')
    })
    const result = await handler(fakeEvent, { id: 1, name: 'test' })

    expect(result).toEqual({
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: 'DB connection lost',
    })
    expect(log.error).toHaveBeenCalledWith(
      'IPC handler error:',
      expect.any(Error),
    )
  })

  it('maps thrown string to UNEXPECTED_ERROR and logs', async () => {
    const handler = wrapIpcHandler(TestSchema, () => {
      throw 'something went wrong'
    })
    const result = await handler(fakeEvent, { id: 1, name: 'test' })

    expect(result).toEqual({
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: 'Ett oväntat fel inträffade',
    })
    expect(log.error).toHaveBeenCalledWith(
      'IPC handler unknown error:',
      'something went wrong',
    )
  })

  it('skips validation when schema is null', async () => {
    const handler = wrapIpcHandler(null, (raw) => ({
      received: raw,
    }))
    const result = await handler(fakeEvent, { anything: true })

    expect(result).toEqual({
      success: true,
      data: { received: { anything: true } },
    })
  })
})
