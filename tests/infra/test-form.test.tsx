// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../setup/mock-ipc'
import { useTestForm } from '../helpers/test-form'
import { renderWithProviders } from '../helpers/render-with-providers'

interface SimpleForm {
  name: string
  age: number
}

function TestConsumer({ form }: { form: ReturnType<typeof useTestForm<SimpleForm>> }) {
  return (
    <div>
      <span data-testid="name-value">{form.getField('name')}</span>
      <span data-testid="age-value">{form.getField('age')}</span>
      <button onClick={() => form.setField('name', 'updated')}>Set Name</button>
    </div>
  )
}

function TestWrapper(props: { overrides?: Parameters<typeof useTestForm<SimpleForm>>[1] }) {
  const form = useTestForm<SimpleForm>({ name: 'initial', age: 25 }, props.overrides)
  return <TestConsumer form={form} />
}

describe('useTestForm', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('getField returns initial value', async () => {
    await renderWithProviders(<TestWrapper />)
    expect(screen.getByTestId('name-value')).toHaveTextContent('initial')
    expect(screen.getByTestId('age-value')).toHaveTextContent('25')
  })

  it('setField updates value reflected by getField', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<TestWrapper />)
    await user.click(screen.getByRole('button', { name: 'Set Name' }))
    expect(screen.getByTestId('name-value')).toHaveTextContent('updated')
  })

  it('overrides replace specific methods without breaking type safety', async () => {
    const customReset = vi.fn()
    await renderWithProviders(<TestWrapper overrides={{ reset: customReset }} />)
    expect(screen.getByTestId('name-value')).toHaveTextContent('initial')
  })
})
