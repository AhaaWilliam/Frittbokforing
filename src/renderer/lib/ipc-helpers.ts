import type { IpcResult, ErrorCode } from '../../shared/types'

export class IpcError extends Error {
  code: ErrorCode
  field?: string

  constructor(message: string, code: ErrorCode, field?: string) {
    super(message)
    this.name = 'IpcError'
    this.code = code
    this.field = field
  }
}

/**
 * Wraps an IPC call that returns IpcResult<T>.
 * Throws on success: false so React Query enters error state.
 * Returns only the data on success.
 */
export async function ipcCall<T>(
  fn: () => Promise<IpcResult<T>>,
): Promise<T> {
  const result = await fn()
  if (!result.success) {
    throw new IpcError(result.error, result.code, result.field)
  }
  return result.data
}
