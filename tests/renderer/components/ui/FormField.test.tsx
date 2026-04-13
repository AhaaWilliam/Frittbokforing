// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { useTestForm } from '../../../helpers/test-form'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FormField } from '../../../../src/renderer/components/ui/FormField'

interface TestForm {
  _name: string
  email: string
  count: number
}

function Harness(props: { type?: 'text' | 'number'; required?: boolean; disabled?: boolean }) {
  const form = useTestForm<TestForm>({ _name: 'Alice', email: '', count: 0 })
  return (
    <FormField
      form={form}
      formName="test"
      name="_name"
      label="Namn"
      type={props.type}
      required={props.required}
      disabled={props.disabled}
    />
  )
}

describe('FormField', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('label is coupled to input via htmlFor/id', async () => {
    await renderWithProviders(<Harness />)
    const input = screen.getByLabelText('Namn')
    expect(input).toBeDefined()
    expect(input.id).toBe('_name')
    // Verify label htmlFor matches input id
    const label = input.closest('div')!.querySelector('label')!
    expect(label.htmlFor).toBe('_name')
  })

  it('required indicator shows asterisk when required: true', async () => {
    await renderWithProviders(<Harness required />)
    const label = screen.getByText('Namn').closest('label')!
    expect(label.textContent).toContain('*')
  })

  it('disabled prop propagates to input', async () => {
    await renderWithProviders(<Harness disabled />)
    expect((screen.getByLabelText('Namn') as HTMLInputElement).disabled).toBe(true)
  })

  it('type=number sets input type and onChange sends value', async () => {
    const user = userEvent.setup()

    function NumberHarness() {
      const form = useTestForm<TestForm>({ _name: '', email: '', count: 0 })
      return (
        <div>
          <FormField form={form} formName="test" name="_name" label="Namn" type="number" />
          <span data-testid="value">{String(form.getField('_name'))}</span>
        </div>
      )
    }

    await renderWithProviders(<NumberHarness />)
    const input = screen.getByLabelText('Namn')
    expect((input as HTMLInputElement).type).toBe('number')

    await user.clear(input)
    await user.type(input, '42')
    // FormField always sends string via e.target.value (no Number conversion)
    expect(screen.getByTestId('value').textContent).toBe('42')
  })
})
