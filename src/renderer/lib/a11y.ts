/**
 * A11y helpers (F49).
 *
 * Deterministic ID generators for ARIA attribute linking.
 * Used by FormField and inline ARIA in form components.
 */

/**
 * Generates a deterministic aria-describedby ID from a field ID.
 * Used for role="alert" elements announced on validation errors.
 */
export function errorIdFor(fieldId: string): string {
  if (!fieldId) {
    throw new Error('errorIdFor: fieldId required (prevents duplicate-id axe-violation)')
  }
  return `${fieldId}-error`
}

/**
 * A11y description ID (for hint texts, distinct from errors).
 */
export function descriptionIdFor(fieldId: string): string {
  if (!fieldId) {
    throw new Error('descriptionIdFor: fieldId required')
  }
  return `${fieldId}-description`
}
