// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { useTestForm } from '../../../helpers/test-form'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FormField } from '../../../../src/renderer/components/ui/FormField'
import { FormSelect } from '../../../../src/renderer/components/ui/FormSelect'
import { FormTextarea } from '../../../../src/renderer/components/ui/FormTextarea'

interface TestForm {
  name: string
  color: string
  notes: string
}

const SELECT_OPTIONS = [
  { value: 'red', label: 'Röd' },
  { value: 'blue', label: 'Blå' },
]

describe('F49 — FormField a11y', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('FormField with error has role="alert" and aria-describedby (not aria-errormessage)', async () => {
    function Harness() {
      const form = useTestForm<TestForm>(
        { name: '', color: 'red', notes: '' },
        { errors: { name: 'Namn krävs' } },
      )
      return <FormField form={form} formName="test" name="name" label="Namn" />
    }

    const { container } = await renderWithProviders(<Harness />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Namn krävs')
    expect(alert).toHaveAttribute('id', 'test-name-error')

    const input = container.querySelector('input')!
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'test-name-error')
    // Explicit negation — aria-errormessage not used (VoiceOver compat)
    expect(input).not.toHaveAttribute('aria-errormessage')
  })

  it('FormSelect with error has role="alert" and aria-describedby', async () => {
    function Harness() {
      const form = useTestForm<TestForm>(
        { name: '', color: 'red', notes: '' },
        { errors: { color: 'Välj en färg' } },
      )
      return (
        <FormSelect
          form={form}
          formName="test"
          name="color"
          label="Färg"
          options={SELECT_OPTIONS}
        />
      )
    }

    const { container } = await renderWithProviders(<Harness />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Välj en färg')
    expect(alert).toHaveAttribute('id', 'test-color-error')

    const select = container.querySelector('select')!
    expect(select).toHaveAttribute('aria-invalid', 'true')
    expect(select).toHaveAttribute('aria-describedby', 'test-color-error')
    expect(select).not.toHaveAttribute('aria-errormessage')
  })

  it('FormTextarea with error has role="alert" and aria-describedby', async () => {
    function Harness() {
      const form = useTestForm<TestForm>(
        { name: '', color: 'red', notes: '' },
        { errors: { notes: 'Anteckning saknas' } },
      )
      return <FormTextarea form={form} formName="test" name="notes" label="Anteckningar" />
    }

    const { container } = await renderWithProviders(<Harness />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Anteckning saknas')
    expect(alert).toHaveAttribute('id', 'test-notes-error')

    const textarea = container.querySelector('textarea')!
    expect(textarea).toHaveAttribute('aria-invalid', 'true')
    expect(textarea).toHaveAttribute('aria-describedby', 'test-notes-error')
    expect(textarea).not.toHaveAttribute('aria-errormessage')
  })
})
