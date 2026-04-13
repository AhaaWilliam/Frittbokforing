// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { useTestForm } from '../../../helpers/test-form'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FormSelect } from '../../../../src/renderer/components/ui/FormSelect'

const STRING_OPTIONS = [
  { value: 'red', label: 'Röd' },
  { value: 'green', label: 'Grön' },
  { value: 'blue', label: 'Blå' },
]

const NUMBER_OPTIONS = [
  { value: 1930, label: 'Bank' },
  { value: 2440, label: 'Leverantörsskuld' },
]

interface StringForm {
  color: string
}

interface NumberForm {
  accountId: number
}

function StringHarness(props: { initialColor?: string }) {
  const form = useTestForm<StringForm>({ color: props.initialColor ?? 'red' })
  return (
    <div>
      <FormSelect
        form={form}
        formName="test"
        name="color"
        label="Färg"
        options={STRING_OPTIONS}
      />
      <span data-testid="color-value">{form.getField('color')}</span>
      <span data-testid="color-type">{typeof form.getField('color')}</span>
    </div>
  )
}

function NumberHarness(props: { initialAccount?: number }) {
  const form = useTestForm<NumberForm>({ accountId: props.initialAccount ?? 1930 })
  return (
    <div>
      <FormSelect
        form={form}
        formName="test"
        name="accountId"
        label="Konto"
        options={NUMBER_OPTIONS}
      />
      <span data-testid="account-value">{String(form.getField('accountId'))}</span>
      <span data-testid="account-type">{typeof form.getField('accountId')}</span>
    </div>
  )
}

describe('FormSelect', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('renders all options', async () => {
    await renderWithProviders(<StringHarness />)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('Röd')
    expect(options[1]).toHaveTextContent('Grön')
    expect(options[2]).toHaveTextContent('Blå')
  })

  it('initial value is selected (string variant)', async () => {
    await renderWithProviders(<StringHarness initialColor="green" />)
    expect(screen.getByLabelText('Färg')).toHaveValue('green')
  })

  it('initial value is selected (number variant)', async () => {
    await renderWithProviders(<NumberHarness initialAccount={1930} />)
    // DOM value is always string
    expect(screen.getByLabelText('Konto')).toHaveValue('1930')
    // But form state is number
    expect(screen.getByTestId('account-type')).toHaveTextContent('number')
    expect(screen.getByTestId('account-value')).toHaveTextContent('1930')
  })

  it('onChange round-trips number correctly (M78)', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<NumberHarness initialAccount={1930} />)
    await user.selectOptions(screen.getByLabelText('Konto'), '2440')
    expect(screen.getByTestId('account-value')).toHaveTextContent('2440')
    expect(screen.getByTestId('account-type')).toHaveTextContent('number')
  })

  it('onChange preserves string when options are string-typed', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<StringHarness initialColor="red" />)
    await user.selectOptions(screen.getByLabelText('Färg'), 'blue')
    expect(screen.getByTestId('color-value')).toHaveTextContent('blue')
    expect(screen.getByTestId('color-type')).toHaveTextContent('string')
  })

  it('empty options list does not crash', async () => {
    function EmptyHarness() {
      const form = useTestForm<StringForm>({ color: '' })
      return (
        <FormSelect
          form={form}
          formName="test"
          name="color"
          label="Färg"
          options={[]}
        />
      )
    }
    // Should render without throwing, axe passes
    await renderWithProviders(<EmptyHarness />)
    expect(screen.getByLabelText('Färg')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
