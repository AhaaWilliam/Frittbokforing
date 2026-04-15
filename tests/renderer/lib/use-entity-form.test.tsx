// @vitest-environment jsdom
import { renderHook, act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import { useEntityForm } from '../../../src/renderer/lib/use-entity-form'
import type { UseEntityFormOptions } from '../../../src/renderer/lib/use-entity-form'
import { IpcError } from '../../../src/renderer/lib/ipc-helpers'
import { setupMockIpc } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { FormField } from '../../../src/renderer/components/ui/FormField'

// ── Test types & schemas ─────────────────────────────────────────────

type TestFormValues = { name: string; age: number; email: string }
type TestPayload = { full_name: string; age_years: number; email: string }

const testFormSchema = z.object({
  name: z.string().min(1, 'Namn krävs'),
  age: z.number().int().positive('Ålder måste vara positiv'),
  email: z.string().email('Ogiltig e-post'),
})

const testPayloadSchema = z.object({
  full_name: z.string().min(1),
  age_years: z.number().int().positive(),
  email: z.string().email(),
})

const testTransform = (form: TestFormValues): TestPayload => ({
  full_name: form.name.trim(),
  age_years: form.age,
  email: form.email.trim(),
})

const TEST_DEFAULTS: TestFormValues = { name: '', age: 0, email: '' }

function makeOptions(
  overrides?: Partial<UseEntityFormOptions<TestFormValues, TestPayload, { id: number }>>,
): UseEntityFormOptions<TestFormValues, TestPayload, { id: number }> {
  return {
    formSchema: testFormSchema,
    payloadSchema: testPayloadSchema,
    transform: testTransform,
    defaults: TEST_DEFAULTS,
    initialData: { name: 'Anna', age: 30, email: 'anna@example.com' },
    onSubmit: vi.fn().mockResolvedValue({ id: 1 }),
    ...overrides,
  }
}

function setup(
  overrides?: Partial<UseEntityFormOptions<TestFormValues, TestPayload, { id: number }>>,
) {
  const opts = makeOptions(overrides)
  const hook = renderHook(() =>
    useEntityForm<TestFormValues, TestPayload, { id: number }>(opts),
  )
  return { hook, opts }
}

// ── Group 1: Init & default-state ────────────────────────────────────

describe('useEntityForm', () => {
  describe('init & default-state', () => {
    it('returns initialData via getField with correct default state', () => {
      const { hook } = setup()
      const r = hook.result.current
      expect(r.getField('name')).toBe('Anna')
      expect(r.getField('age')).toBe(30)
      expect(r.getField('email')).toBe('anna@example.com')
      expect(r.errors).toEqual({})
      expect(r.submitError).toBeNull()
      expect(r.isSubmitting).toBe(false)
      expect(r.isDirty).toBe(false)
    })

    it('without initialData, getField returns defaults', () => {
      const { hook } = setup({ initialData: undefined })
      expect(hook.result.current.getField('name')).toBe('')
      expect(hook.result.current.getField('age')).toBe(0)
      expect(hook.result.current.getField('email')).toBe('')
    })
  })

  // ── Group 2: getField / setField ─────────────────────────────────

  describe('getField / setField', () => {
    it('setField updates value returned by getField', () => {
      const { hook } = setup()
      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.getField('name')).toBe('Bertil')
    })

    it('setField clears field-specific error', async () => {
      const { hook } = setup({ initialData: { name: '', age: 30, email: 'a@b.com' } })
      // Trigger validation error on name
      await act(async () => hook.result.current.handleSubmit())
      expect(hook.result.current.errors.name).toBe('Namn krävs')

      // setField clears that field's error
      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.errors.name).toBeUndefined()
    })

    it('setField on one field does NOT clear other fields errors', async () => {
      // Both name and email invalid
      const { hook } = setup({
        initialData: { name: '', age: 30, email: 'not-an-email' },
      })
      await act(async () => hook.result.current.handleSubmit())
      expect(hook.result.current.errors.name).toBe('Namn krävs')
      expect(hook.result.current.errors.email).toBe('Ogiltig e-post')

      // Fix name, email error should remain
      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.errors.name).toBeUndefined()
      expect(hook.result.current.errors.email).toBe('Ogiltig e-post')
    })
  })

  // ── Group 3: formSchema validation ───────────────────────────────

  describe('formSchema validation', () => {
    it('handleSubmit with valid data calls onSubmit with transformed payload', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ id: 1 })
      const { hook } = setup({ onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(onSubmit).toHaveBeenCalledWith({
        full_name: 'Anna',
        age_years: 30,
        email: 'anna@example.com',
      })
    })

    it('handleSubmit with invalid formSchema sets errors, does NOT call onSubmit', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ id: 1 })
      const { hook } = setup({
        onSubmit,
        initialData: { name: '', age: -1, email: 'a@b.com' },
      })

      await act(async () => hook.result.current.handleSubmit())

      expect(hook.result.current.errors.name).toBe('Namn krävs')
      expect(hook.result.current.errors.age).toBe('Ålder måste vara positiv')
      expect(hook.result.current.submitError).toBeNull()
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('multiple formSchema errors populate only failing fields', async () => {
      const { hook } = setup({
        initialData: { name: '', age: -1, email: 'bad' },
      })

      await act(async () => hook.result.current.handleSubmit())

      const errors = hook.result.current.errors
      expect(errors.name).toBeDefined()
      expect(errors.age).toBeDefined()
      expect(errors.email).toBeDefined()
      // No other keys beyond the failing ones
      expect(Object.keys(errors)).toHaveLength(3)
    })
  })

  // ── Group 4: payloadSchema validation ────────────────────────────

  describe('payloadSchema validation', () => {
    it('payload failing payloadSchema sets submitError', async () => {
      // Transform that produces invalid payload (negative age)
      const badTransform = (form: TestFormValues): TestPayload => ({
        full_name: form.name,
        age_years: -form.age,
        email: form.email,
      })

      const onSubmit = vi.fn().mockResolvedValue({ id: 1 })
      const { hook } = setup({ transform: badTransform, onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(hook.result.current.submitError).toBe(
        'Internt valideringsfel: payload matchade inte schemat',
      )
      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('valid transform produces payload that matches payloadSchema', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ id: 1 })
      const { hook } = setup({ onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(onSubmit).toHaveBeenCalledWith({
        full_name: 'Anna',
        age_years: 30,
        email: 'anna@example.com',
      })
    })
  })

  // ── Group 5: Submit happy path ───────────────────────────────────

  describe('submit happy path', () => {
    it('isSubmitting is true during submit, false after', async () => {
      let resolveSubmit!: (value: { id: number }) => void
      const onSubmit = vi.fn(
        () => new Promise<{ id: number }>((resolve) => { resolveSubmit = resolve }),
      )
      const { hook } = setup({ onSubmit })

      let submitPromise: Promise<void>
      act(() => {
        submitPromise = hook.result.current.handleSubmit()
      })

      expect(hook.result.current.isSubmitting).toBe(true)

      await act(async () => {
        resolveSubmit({ id: 1 })
        await submitPromise!
      })

      expect(hook.result.current.isSubmitting).toBe(false)
    })

    it('onSuccess is called with result from onSubmit', async () => {
      const onSubmit = vi.fn().mockResolvedValue({ id: 42 })
      const onSuccess = vi.fn()
      const { hook } = setup({ onSubmit, onSuccess })

      await act(async () => hook.result.current.handleSubmit())

      expect(onSuccess).toHaveBeenCalledWith({ id: 42 })
    })
  })

  // ── Group 6: Submit errors — M100 ───────────────────────────────

  describe('submit errors — M100 IpcError mapping', () => {
    it('IpcError with field maps to per-field error', async () => {
      const onSubmit = vi.fn().mockRejectedValue(
        new IpcError('E-post finns redan', 'DUPLICATE_NAME', 'email'),
      )
      const { hook } = setup({ onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(hook.result.current.errors.email).toBe('E-post finns redan')
      expect(hook.result.current.submitError).toBe('E-post finns redan')
    })

    it('IpcError without field sets only submitError', async () => {
      const onSubmit = vi.fn().mockRejectedValue(
        new IpcError('Transaktionsfel', 'TRANSACTION_ERROR'),
      )
      const { hook } = setup({ onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(hook.result.current.submitError).toBe('Transaktionsfel')
      // No field-specific error since no field provided
      expect(Object.keys(hook.result.current.errors)).toHaveLength(0)
    })

    it('generic Error sets submitError, no field errors', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('Nätverksfel'))
      const { hook } = setup({ onSubmit })

      await act(async () => hook.result.current.handleSubmit())

      expect(hook.result.current.submitError).toBe('Nätverksfel')
      expect(Object.keys(hook.result.current.errors)).toHaveLength(0)
      expect(hook.result.current.isSubmitting).toBe(false)
    })
  })

  // ── Group 7: isDirty & M102 ──────────────────────────────────────

  describe('isDirty & M102 sticky dirty', () => {
    it('isDirty false initially, true after setField', () => {
      const { hook } = setup()
      expect(hook.result.current.isDirty).toBe(false)

      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.isDirty).toBe(true)
    })

    it('reset sets isDirty back to false', () => {
      const { hook } = setup()

      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.isDirty).toBe(true)

      act(() => hook.result.current.reset())
      expect(hook.result.current.isDirty).toBe(false)
    })

    it('M102: isDirty does not cause extra re-renders (ref-based)', () => {
      // Track render count to verify isDirty is ref-based per M102.
      // With React 18 batching, setState calls in the same synchronous
      // block are batched. The key observation: setField does 2 setState
      // calls (formData + errors) which batch to 1 re-render. If isDirty
      // were also useState (3 calls), React 18 would STILL batch to 1.
      // So instead we verify the behavioral invariant: isDirty stays
      // true across submit cycles without explicit re-set — the "sticky"
      // property that M102 guarantees via dirtyRef.
      const { hook } = setup()

      act(() => hook.result.current.setField('name', 'Bertil'))
      expect(hook.result.current.isDirty).toBe(true)

      // handleSubmit triggers multiple state changes (isSubmitting,
      // errors, submitError) but isDirty must remain true — it's only
      // reset via explicit reset() call, never by submit lifecycle.
      // This would break if someone refactored isDirty to useState
      // and accidentally reset it in handleSubmit.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      act(() => { hook.result.current.handleSubmit() })
      expect(hook.result.current.isDirty).toBe(true)
    })
  })

  // ── Group 8: Reset ───────────────────────────────────────────────

  describe('reset', () => {
    it('reset() restores defaults+initialData, clears errors and submitError', async () => {
      const onSubmit = vi.fn().mockRejectedValue(new Error('fail'))
      const { hook } = setup({ onSubmit })

      act(() => hook.result.current.setField('name', 'Modified'))
      await act(async () => hook.result.current.handleSubmit())
      expect(hook.result.current.submitError).toBe('fail')

      act(() => hook.result.current.reset())

      expect(hook.result.current.getField('name')).toBe('Anna')
      expect(hook.result.current.getField('age')).toBe(30)
      expect(hook.result.current.errors).toEqual({})
      expect(hook.result.current.submitError).toBeNull()
      expect(hook.result.current.isDirty).toBe(false)
    })

    it('reset({ name: "Carl" }) merges partial data with defaults+initialData', () => {
      const { hook } = setup()

      act(() => hook.result.current.reset({ name: 'Carl' }))

      expect(hook.result.current.getField('name')).toBe('Carl')
      // age and email retain initialData values
      expect(hook.result.current.getField('age')).toBe(30)
      expect(hook.result.current.getField('email')).toBe('anna@example.com')
    })
  })

  // ── Group 9: Integration via FormField ───────────────────────────

  describe('integration with FormField', () => {
    beforeEach(() => {
      setupMockIpc()
    })

    it('user-event typing in FormField updates hook state', async () => {
      const user = userEvent.setup()

      function TestComponent() {
        const form = useEntityForm<TestFormValues, TestPayload, { id: number }>(
          makeOptions(),
        )
        return (
          <div>
            <FormField form={form} formName="test" name="name" label="Namn" />
            <span data-testid="hook-name">{form.getField('name')}</span>
          </div>
        )
      }

      await renderWithProviders(<TestComponent />)

      const input = screen.getByLabelText('Namn')
      await user.clear(input)
      await user.type(input, 'Erik')

      expect(screen.getByTestId('hook-name')).toHaveTextContent('Erik')
    })

    it('submit via button triggers onSubmit with transformed payload', async () => {
      const user = userEvent.setup()
      const onSubmit = vi.fn().mockResolvedValue({ id: 99 })

      function TestComponent() {
        const form = useEntityForm<TestFormValues, TestPayload, { id: number }>(
          makeOptions({ onSubmit }),
        )
        return (
          <div>
            <FormField form={form} formName="test" name="name" label="Namn" />
            <button onClick={() => form.handleSubmit()}>Spara</button>
            {form.submitError && <p data-testid="error">{form.submitError}</p>}
          </div>
        )
      }

      await renderWithProviders(<TestComponent />)
      await user.click(screen.getByRole('button', { name: 'Spara' }))

      expect(onSubmit).toHaveBeenCalledWith({
        full_name: 'Anna',
        age_years: 30,
        email: 'anna@example.com',
      })
    })
  })
})
