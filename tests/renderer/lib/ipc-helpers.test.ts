import { describe, it, expect } from 'vitest'
import { ipcCall, IpcError } from '../../../src/renderer/lib/ipc-helpers'

describe('IpcError', () => {
  it('är instans av Error med name="IpcError"', () => {
    const e = new IpcError('msg', 'VALIDATION_ERROR')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('IpcError')
    expect(e.message).toBe('msg')
    expect(e.code).toBe('VALIDATION_ERROR')
    expect(e.field).toBeUndefined()
  })

  it('field-prop sparas', () => {
    const e = new IpcError('msg', 'VALIDATION_ERROR', 'email')
    expect(e.field).toBe('email')
  })
})

describe('ipcCall', () => {
  it('returnerar data vid success', async () => {
    const result = await ipcCall(async () => ({
      success: true,
      data: { id: 42 },
    }))
    expect(result).toEqual({ id: 42 })
  })

  it('kastar IpcError vid success: false', async () => {
    await expect(
      ipcCall(async () => ({
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'Invalid input',
      })),
    ).rejects.toThrow(IpcError)
  })

  it('kastar IpcError med rätt code, error, field', async () => {
    try {
      await ipcCall(async () => ({
        success: false,
        code: 'VALIDATION_ERROR',
        error: 'bad email',
        field: 'email',
      }))
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(IpcError)
      expect((e as IpcError).code).toBe('VALIDATION_ERROR')
      expect((e as IpcError).message).toBe('bad email')
      expect((e as IpcError).field).toBe('email')
    }
  })

  it('propagerar inner-promise-rejection', async () => {
    await expect(
      ipcCall(async () => {
        throw new Error('network down')
      }),
    ).rejects.toThrow('network down')
  })
})
