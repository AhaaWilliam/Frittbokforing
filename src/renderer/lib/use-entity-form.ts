import { useState, useCallback, useRef } from 'react'
import type { z } from 'zod'
import { IpcError } from './ipc-helpers'

export interface UseEntityFormOptions<
  TForm extends object,
  TPayload,
  TResult = void,
> {
  /** Zod-schema for the form's local state (broad, incl. UI-only _-fields) */
  formSchema: z.ZodType<TForm>
  /** Zod-schema matching exactly what backend expects (.strict()) */
  payloadSchema: z.ZodType<TPayload>
  /** Maps FormState -> Payload. Strips _-fields, trims strings, sets null-defaults */
  transform: (formData: TForm) => TPayload
  /** Initial values for edit (populated from existing entity) */
  initialData?: Partial<TForm>
  /** Default values for new entities */
  defaults: TForm
  /** Called with validated payload on submit. Return value is forwarded to onSuccess. */
  onSubmit: (payload: TPayload) => Promise<TResult>
  /** Called after successful submit with the return value from onSubmit. */
  onSuccess?: (result: TResult) => void
}

export interface UseEntityFormReturn<TForm extends object> {
  /** Get a field's value */
  getField: <K extends keyof TForm>(name: K) => TForm[K]
  /** Set a field's value */
  setField: <K extends keyof TForm>(name: K, value: TForm[K]) => void
  /** Submit handler (validates -> transforms -> submits) */
  handleSubmit: () => Promise<void>
  /** Has the form changed since initialization? */
  isDirty: boolean
  /** Is submit in progress? */
  isSubmitting: boolean
  /** Per-field error messages from the last validation */
  errors: Partial<Record<keyof TForm, string>>
  /** Global error message (e.g. from backend) */
  submitError: string | null
  /** Reset the form */
  reset: (data?: Partial<TForm>) => void
}

export function useEntityForm<
  TForm extends object,
  TPayload,
  TResult = void,
>(
  options: UseEntityFormOptions<TForm, TPayload, TResult>,
): UseEntityFormReturn<TForm> {
  const {
    formSchema,
    payloadSchema,
    transform,
    initialData,
    defaults,
    onSubmit,
    onSuccess,
  } = options

  const initialState = { ...defaults, ...initialData } as TForm
  const initialStateRef = useRef<TForm>(initialState)
  const dirtyRef = useRef(false)

  const [formData, setFormData] = useState<TForm>(initialState)
  const [errors, setErrors] = useState<Partial<Record<keyof TForm, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function getField<K extends keyof TForm>(name: K): TForm[K] {
    return formData[name]
  }

  const setField = useCallback(<K extends keyof TForm>(name: K, value: TForm[K]) => {
    dirtyRef.current = true
    setFormData((prev) => ({ ...prev, [name]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }, [])

  const isDirty = dirtyRef.current

  const handleSubmit = useCallback(async () => {
    setIsSubmitting(true)
    setSubmitError(null)
    setErrors({})

    try {
      // Validate formData against formSchema
      const formResult = formSchema.safeParse(formData)
      if (!formResult.success) {
        const fieldErrors: Partial<Record<keyof TForm, string>> = {}
        for (const issue of formResult.error.issues) {
          const key = issue.path[0] as keyof TForm
          if (key && !fieldErrors[key]) {
            fieldErrors[key] = issue.message
          }
        }
        setErrors(fieldErrors)
        return
      }

      // Transform validated data to payload
      const payload = transform(formResult.data)

      // Validate payload against payloadSchema
      const payloadResult = payloadSchema.safeParse(payload)
      if (!payloadResult.success) {
        setSubmitError('Internt valideringsfel: payload matchade inte schemat')
        return
      }

      // Submit
      const result = await onSubmit(payload)
      onSuccess?.(result)
    } catch (err) {
      if (err instanceof IpcError) {
        // M100/M125: Propagera field-level-fel från backend till formuläret
        if (err.field) {
          setErrors((prev) => ({ ...prev, [err.field!]: err.message }))
        }
        setSubmitError(err.message)
      } else {
        setSubmitError(err instanceof Error ? err.message : 'Ett fel uppstod')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, formSchema, payloadSchema, transform, onSubmit, onSuccess])

  const reset = useCallback(
    (data?: Partial<TForm>) => {
      const newState = { ...defaults, ...initialData, ...data } as TForm
      setFormData(newState)
      initialStateRef.current = newState
      dirtyRef.current = false
      setErrors({})
      setSubmitError(null)
    },
    [defaults, initialData],
  )

  return {
    getField,
    setField,
    handleSubmit,
    isDirty,
    isSubmitting,
    errors,
    submitError,
    reset,
  }
}
