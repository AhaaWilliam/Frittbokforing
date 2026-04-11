// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { FormField } from '../src/renderer/components/ui/FormField'
import { FormSelect } from '../src/renderer/components/ui/FormSelect'
import { FormTextarea } from '../src/renderer/components/ui/FormTextarea'
import type { UseEntityFormReturn } from '../src/renderer/lib/use-entity-form'

// Minimal mock of UseEntityFormReturn for rendering tests
function mockForm(
  values: Record<string, unknown> = {},
): UseEntityFormReturn<Record<string, unknown>> {
  return {
    getField: (name) => values[name as string] ?? '',
    setField: vi.fn(),
    handleSubmit: vi.fn(),
    isDirty: false,
    isSubmitting: false,
    errors: {},
    submitError: null,
    reset: vi.fn(),
  }
}

describe('FormField data-testid', () => {
  it('sets data-testid as formName-name', () => {
    const form = mockForm({ email: 'a@b.se' })
    render(
      FormField({ form, formName: 'customer', name: 'email', label: 'E-post' }),
    )
    const input = screen.getByTestId('customer-email')
    expect(input).toBeDefined()
    expect(input.tagName).toBe('INPUT')
  })

  it('strips leading underscore from name in testid', () => {
    const form = mockForm({ _priceKr: '100' })
    render(
      FormField({ form, formName: 'product', name: '_priceKr', label: 'Pris' }),
    )
    const input = screen.getByTestId('product-priceKr')
    expect(input).toBeDefined()
    // Verify underscore is NOT in testid
    expect(() => screen.getByTestId('product-_priceKr')).toThrow()
  })

  it('preserves id={name} for a11y (label htmlFor)', () => {
    const form = mockForm({ _priceKr: '100' })
    render(
      FormField({ form, formName: 'product', name: '_priceKr', label: 'Pris' }),
    )
    const input = screen.getByTestId('product-priceKr')
    // id should be the raw name, including underscore
    expect(input.getAttribute('id')).toBe('_priceKr')
    // Label's htmlFor should match the id
    const label = input.closest('div')?.querySelector('label')
    expect(label?.getAttribute('for')).toBe('_priceKr')
  })

  it('different formNames produce different testids for same field name', () => {
    const form = mockForm({ name: 'Test' })
    const { unmount } = render(
      FormField({ form, formName: 'customer', name: 'name', label: 'Namn' }),
    )
    expect(screen.getByTestId('customer-name')).toBeDefined()
    unmount()

    render(
      FormField({ form, formName: 'product', name: 'name', label: 'Namn' }),
    )
    expect(screen.getByTestId('product-name')).toBeDefined()
  })
})

describe('FormSelect data-testid', () => {
  it('sets data-testid as formName-name', () => {
    const form = mockForm({ type: 'customer' })
    render(
      FormSelect({
        form,
        formName: 'customer',
        name: 'type',
        label: 'Typ',
        options: [{ value: 'customer', label: 'Kund' }],
      }),
    )
    const select = screen.getByTestId('customer-type')
    expect(select.tagName).toBe('SELECT')
    expect(select.getAttribute('id')).toBe('type')
  })
})

describe('FormTextarea data-testid', () => {
  it('sets data-testid as formName-name', () => {
    const form = mockForm({ description: '' })
    render(
      FormTextarea({
        form,
        formName: 'product',
        name: 'description',
        label: 'Beskrivning',
      }),
    )
    const textarea = screen.getByTestId('product-description')
    expect(textarea.tagName).toBe('TEXTAREA')
    expect(textarea.getAttribute('id')).toBe('description')
  })
})
