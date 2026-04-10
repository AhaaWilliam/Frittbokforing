// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { useEntityForm } from '../src/renderer/lib/use-entity-form'

// --- Test schemas ---

const TestFormSchema = z.object({
  name: z.string().min(1, 'Required'),
  _uiOnly: z.string(),
})

type TestForm = z.infer<typeof TestFormSchema>

const TestPayloadSchema = z
  .object({
    name: z.string().min(1),
  })
  .strict()

type TestPayload = z.infer<typeof TestPayloadSchema>

function testTransform(form: TestForm): TestPayload {
  return { name: form.name.trim() }
}

const TEST_DEFAULTS: TestForm = { name: '', _uiOnly: '' }

function setup(overrides?: {
  initialData?: Partial<TestForm>
  onSubmit?: (p: TestPayload) => Promise<number>
  onSuccess?: (r: number) => void
}) {
  const onSubmit = overrides?.onSubmit ?? vi.fn().mockResolvedValue(42)
  const onSuccess = overrides?.onSuccess ?? vi.fn()

  return {
    hook: renderHook(() =>
      useEntityForm<TestForm, TestPayload, number>({
        formSchema: TestFormSchema,
        payloadSchema: TestPayloadSchema,
        transform: testTransform,
        defaults: TEST_DEFAULTS,
        initialData: overrides?.initialData,
        onSubmit: onSubmit as (p: TestPayload) => Promise<number>,
        onSuccess,
      }),
    ),
    onSubmit,
    onSuccess,
  }
}

describe('useEntityForm', () => {
  it('getField returns initial value', () => {
    const { hook } = setup()
    expect(hook.result.current.getField('name')).toBe('')
    expect(hook.result.current.getField('_uiOnly')).toBe('')
  })

  it('setField updates the value', () => {
    const { hook } = setup()
    act(() => hook.result.current.setField('name', 'Acme'))
    expect(hook.result.current.getField('name')).toBe('Acme')
  })

  it('setField clears field error', async () => {
    const { hook } = setup()
    // Submit with empty name to trigger error
    await act(async () => hook.result.current.handleSubmit())
    expect(hook.result.current.errors.name).toBe('Required')

    // Setting the field clears the error
    act(() => hook.result.current.setField('name', 'Acme'))
    expect(hook.result.current.errors.name).toBeUndefined()
  })

  it('isDirty false initially, true after setField', () => {
    const { hook } = setup()
    expect(hook.result.current.isDirty).toBe(false)

    act(() => hook.result.current.setField('name', 'Acme'))
    expect(hook.result.current.isDirty).toBe(true)
  })

  it('handleSubmit with valid data calls onSubmit with correct payload', async () => {
    const onSubmit = vi.fn().mockResolvedValue(42)
    const { hook } = setup({ onSubmit })

    act(() => hook.result.current.setField('name', '  Acme  '))

    await act(async () => hook.result.current.handleSubmit())

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Acme' })
  })

  it('handleSubmit forwards onSubmit return value to onSuccess (TResult)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(42)
    const onSuccess = vi.fn()
    const { hook } = setup({ onSubmit, onSuccess })

    act(() => hook.result.current.setField('name', 'Acme'))
    await act(async () => hook.result.current.handleSubmit())

    expect(onSuccess).toHaveBeenCalledWith(42)
  })

  it('handleSubmit with invalid FormState sets errors and does NOT call onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(42)
    const { hook } = setup({ onSubmit })

    // name is empty string -> validation fails
    await act(async () => hook.result.current.handleSubmit())

    expect(hook.result.current.errors.name).toBe('Required')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('handleSubmit with payload that does not match PayloadSchema sets submitError', async () => {
    const BadPayloadSchema = z
      .object({
        name: z.string().min(1),
        extra: z.string(),
      })
      .strict()

    const { result } = renderHook(() =>
      useEntityForm<TestForm, z.infer<typeof BadPayloadSchema>, number>({
        formSchema: TestFormSchema,
        payloadSchema: BadPayloadSchema,
        transform: (form) =>
          ({ name: form.name.trim() }) as z.infer<typeof BadPayloadSchema>,
        defaults: TEST_DEFAULTS,
        onSubmit: vi.fn().mockResolvedValue(42),
      }),
    )

    act(() => result.current.setField('name', 'Acme'))
    await act(async () => result.current.handleSubmit())

    expect(result.current.submitError).toBe(
      'Internt valideringsfel: payload matchade inte schemat',
    )
  })

  it('isSubmitting is true during submit, false after', async () => {
    let resolveSubmit!: (value: number) => void
    const onSubmit = vi.fn(
      () => new Promise<number>((resolve) => { resolveSubmit = resolve }),
    )
    const { hook } = setup({ onSubmit })

    act(() => hook.result.current.setField('name', 'Acme'))

    let submitPromise: Promise<void>
    act(() => {
      submitPromise = hook.result.current.handleSubmit()
    })

    expect(hook.result.current.isSubmitting).toBe(true)

    await act(async () => {
      resolveSubmit(42)
      await submitPromise!
    })

    expect(hook.result.current.isSubmitting).toBe(false)
  })

  it('isSubmitting resets to false even if transform throws (try/finally guard)', async () => {
    const throwingTransform = (): TestPayload => {
      throw new Error('transform boom')
    }

    const { result } = renderHook(() =>
      useEntityForm<TestForm, TestPayload, number>({
        formSchema: TestFormSchema,
        payloadSchema: TestPayloadSchema,
        transform: throwingTransform,
        defaults: TEST_DEFAULTS,
        onSubmit: vi.fn().mockResolvedValue(42),
      }),
    )

    act(() => result.current.setField('name', 'Acme'))
    await act(async () => result.current.handleSubmit())

    expect(result.current.isSubmitting).toBe(false)
    expect(result.current.submitError).toBe('transform boom')
  })

  it('reset restores to initial state and isDirty = false', () => {
    const { hook } = setup()

    act(() => hook.result.current.setField('name', 'Acme'))
    expect(hook.result.current.isDirty).toBe(true)

    act(() => hook.result.current.reset())
    expect(hook.result.current.getField('name')).toBe('')
    expect(hook.result.current.isDirty).toBe(false)
  })

  it('submitError is set when onSubmit throws', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Server error'))
    const { hook } = setup({ onSubmit })

    act(() => hook.result.current.setField('name', 'Acme'))
    await act(async () => hook.result.current.handleSubmit())

    expect(hook.result.current.submitError).toBe('Server error')
  })
})
