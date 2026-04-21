import { IpcMainInvokeEvent } from 'electron'
import log from 'electron-log'
import { z } from 'zod'
import type { IpcResult, ErrorCode } from '../../shared/types'

interface StructuredError {
  code: ErrorCode
  error: string
  field?: string
}

function isStructuredError(err: unknown): err is StructuredError {
  return (
    err != null &&
    typeof err === 'object' &&
    'code' in err &&
    'error' in err &&
    typeof (err as StructuredError).code === 'string' &&
    typeof (err as StructuredError).error === 'string'
  )
}

function isIpcResult<T>(value: unknown): value is IpcResult<T> {
  return (
    value != null &&
    typeof value === 'object' &&
    'success' in value &&
    typeof (value as { success: unknown }).success === 'boolean'
  )
}

/**
 * Wraps an IPC handler with Zod validation and M100-compliant error handling.
 *
 * Two modes:
 * - schema provided: validates raw input, passes parsed payload to handler
 * - schema null: passes raw input directly (handler handles its own validation)
 *
 * Handler can:
 * - Return IpcResult<T> directly (passed through)
 * - Return raw T (wrapped as { success: true, data: T })
 * - Throw structured { code, error, field? } (mapped to IpcResult failure)
 * - Throw Error or unknown (mapped to UNEXPECTED_ERROR + logged)
 */
export function wrapIpcHandler<TPayload, TResult>(
  schema: z.ZodType<TPayload> | null,
  handler: (
    payload: TPayload,
  ) => Promise<TResult | IpcResult<TResult>> | TResult | IpcResult<TResult>,
): (_event: IpcMainInvokeEvent, raw: unknown) => Promise<IpcResult<TResult>> {
  return async (_event: IpcMainInvokeEvent, raw: unknown) => {
    try {
      let payload: TPayload
      if (schema) {
        const parsed = schema.safeParse(raw)
        if (!parsed.success) {
          const firstIssue = parsed.error.issues[0]
          return {
            success: false,
            error: firstIssue?.message ?? 'Ogiltigt input.',
            code: 'VALIDATION_ERROR' as const,
            field: firstIssue?.path[0]?.toString(),
          }
        }
        payload = parsed.data
      } else {
        payload = raw as TPayload
      }

      const result = await handler(payload)

      if (isIpcResult<TResult>(result)) {
        return result
      }

      return { success: true as const, data: result }
    } catch (err: unknown) {
      if (isStructuredError(err)) {
        return {
          success: false as const,
          code: err.code,
          error: err.error,
          ...(err.field != null ? { field: err.field } : {}),
        }
      }

      if (err instanceof Error) {
        log.error('IPC handler error:', err)
        return {
          success: false as const,
          code: 'UNEXPECTED_ERROR' as const,
          error: err.name === 'SqliteError' ? 'Ett databasfel inträffade' : err.message,
        }
      }

      log.error('IPC handler unknown error:', err)
      return {
        success: false as const,
        code: 'UNEXPECTED_ERROR' as const,
        error: 'Ett oväntat fel inträffade',
      }
    }
  }
}
