// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { useTestForm } from '../../../helpers/test-form'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { FormTextarea } from '../../../../src/renderer/components/ui/FormTextarea'

interface NoteForm {
  notes: string
}

function Harness(props: { rows?: number; disabled?: boolean }) {
  const form = useTestForm<NoteForm>({ notes: '' })
  return (
    <div>
      <FormTextarea
        form={form}
        formName="test"
        name="notes"
        label="Anteckningar"
        rows={props.rows}
        disabled={props.disabled}
      />
      <span data-testid="notes-value">{form.getField('notes')}</span>
    </div>
  )
}

describe('FormTextarea', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('value updates on user input', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<Harness />)
    const textarea = screen.getByLabelText('Anteckningar')
    await user.type(textarea, 'Hello world')
    expect(screen.getByTestId('notes-value')).toHaveTextContent('Hello world')
  })

  it('rows defaults to 3 and can be overridden', async () => {
    // Default
    const { unmount } = await renderWithProviders(<Harness />)
    expect(screen.getByLabelText('Anteckningar')).toHaveAttribute('rows', '3')
    unmount()

    // Override
    await renderWithProviders(<Harness rows={6} />)
    expect(screen.getByLabelText('Anteckningar')).toHaveAttribute('rows', '6')
  })

  it('disabled prop propagates to textarea', async () => {
    await renderWithProviders(<Harness disabled />)
    expect(screen.getByLabelText('Anteckningar')).toBeDisabled()
  })
})
