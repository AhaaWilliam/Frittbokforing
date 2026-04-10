import type { IpcResult } from '../../shared/types'

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
    const error = new Error(result.error)
    ;(error as unknown as Record<string, unknown>).code = result.code
    ;(error as unknown as Record<string, unknown>).field = result.field
    throw error
  }
  return result.data
}
