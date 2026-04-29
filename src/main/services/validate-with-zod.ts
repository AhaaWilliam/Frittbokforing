/**
 * validateWithZod — centraliserad Zod-validering för service-lagret.
 *
 * Används av services som vill validera input och kasta strukturerat fel
 * (M100) istället för att bygga catch-block per callsite. Returnerar den
 * parsade payloaden vid framgång; kastar `{ code: 'VALIDATION_ERROR', error, field }`
 * vid fail (första issue som i wrapIpcHandler).
 *
 * Wrap-ipc-handler fångar strukturerade fel automatiskt.
 */

import type { z } from 'zod'

export interface StructuredValidationError {
  code: 'VALIDATION_ERROR'
  error: string
  field?: string
}

export function validateWithZod<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const err: StructuredValidationError = {
      code: 'VALIDATION_ERROR',
      error: firstIssue?.message ?? 'Ogiltigt input.',
    }
    if (firstIssue?.path[0] != null) {
      err.field = firstIssue.path[0].toString()
    }
    throw err
  }
  return parsed.data
}
