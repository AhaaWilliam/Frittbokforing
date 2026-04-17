/**
 * Minimal useTestForm hook that implements UseEntityFormReturn<TForm>
 * for component testing. Does NOT test useEntityForm — just provides
 * the same type surface so Form* components can be rendered with
 * real React state driving re-renders.
 */
import { useState, useCallback } from 'react'
import type { UseEntityFormReturn } from '../../src/renderer/lib/use-entity-form'

export function useTestForm<TForm extends object>(
  initialValues: TForm,
  overrides?: Partial<UseEntityFormReturn<TForm>>,
): UseEntityFormReturn<TForm> {
  const [formData, setFormData] = useState<TForm>(initialValues)

  function getField<K extends keyof TForm>(name: K): TForm[K] {
    return formData[name]
  }

  const setField = useCallback(
    <K extends keyof TForm>(name: K, value: TForm[K]) => {
      setFormData((prev) => ({ ...prev, [name]: value }))
    },
    [],
  )

  const handleSubmit = useCallback(async () => {
    // no-op stub
  }, [])

  const reset = useCallback((data?: Partial<TForm>) => {
    setFormData((prev) => ({ ...prev, ...data }) as TForm)
  }, [])

  return {
    getField,
    setField,
    handleSubmit,
    isDirty: false,
    isSubmitting: false,
    errors: {},
    submitError: null,
    reset,
    ...overrides,
  }
}
