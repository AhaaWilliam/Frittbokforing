// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { Field } from '../../../../src/renderer/components/ui/Field'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('Field', () => {
  it('renders label and child input', () => {
    render(
      <Field label="Datum">
        <input type="text" />
      </Field>,
    )
    expect(screen.getByText('Datum')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders hint when no error', () => {
    render(
      <Field label="X" hint="ÅÅÅÅ-MM-DD">
        <input />
      </Field>,
    )
    expect(screen.getByText('ÅÅÅÅ-MM-DD')).toBeInTheDocument()
  })

  it('renders error with role=alert and hides hint when error present', () => {
    render(
      <Field label="X" hint="hint-text" error="Felaktigt format">
        <input />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Felaktigt format')
    expect(screen.queryByText('hint-text')).not.toBeInTheDocument()
  })

  it('honors span=2 with col-span-2 class', () => {
    const { container } = render(
      <Field label="X" span={2}>
        <input />
      </Field>,
    )
    expect(container.firstChild).toHaveClass('col-span-2')
  })

  it('default span=1 uses col-span-1', () => {
    const { container } = render(
      <Field label="X">
        <input />
      </Field>,
    )
    expect(container.firstChild).toHaveClass('col-span-1')
  })

  it('passes axe with error', async () => {
    const { container } = render(
      <Field label="Datum" error="Felaktigt">
        <input aria-label="Datum" type="text" />
      </Field>,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
