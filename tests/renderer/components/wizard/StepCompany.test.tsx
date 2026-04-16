// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StepCompany } from '../../../../src/renderer/components/wizard/StepCompany'

const DEFAULT_PROPS = {
  name: '',
  org_number: '',
  fiscal_rule: 'K2' as const,
  share_capital: '25000',
  registration_date: '',
  onChange: vi.fn(),
  onNext: vi.fn(),
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

function renderStep(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, onChange: vi.fn(), onNext: vi.fn(), ...overrides }
  return { ...render(<StepCompany {...props} />), props }
}

function validProps(): Partial<typeof DEFAULT_PROPS> {
  return {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: '50000',
    registration_date: '2020-01-15',
  }
}

describe('StepCompany', () => {
  it('renders all form fields', () => {
    renderStep()
    expect(screen.getByLabelText(/Vad heter ditt företag/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Organisationsnummer/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Förenklad redovisning/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Fullständig redovisning/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Insatt aktiekapital/)).toBeInTheDocument()
    expect(screen.getByLabelText(/När registrerades bolaget/)).toBeInTheDocument()
  })

  it('calls onChange with formatted org number on input', async () => {
    // StepCompany is controlled — each keystroke fires handleOrgChange which
    // calls onChange('org_number', formatOrgNumber(e.target.value)).
    // Since the mock doesn't re-render with the new value, each keystroke
    // sees only its own character. We verify that onChange is called with
    // 'org_number' on each keystroke.
    const { props } = renderStep()
    const input = screen.getByLabelText(/Organisationsnummer/)
    await userEvent.type(input, '5')
    const orgCalls = props.onChange.mock.calls.filter(
      (c: unknown[]) => c[0] === 'org_number',
    )
    expect(orgCalls.length).toBe(1)
    expect(orgCalls[0][1]).toBe('5') // single digit, no hyphen yet
  })

  it('has K2 selected as default', () => {
    renderStep()
    const k2Radio = screen.getByLabelText(/Förenklad redovisning/)
    expect(k2Radio).toBeChecked()
  })

  it('next button disabled with empty data', () => {
    renderStep()
    const btn = screen.getByRole('button', { name: 'Nästa' })
    expect(btn).toBeDisabled()
  })

  it('next button enabled with valid data and calls onNext', async () => {
    const { props } = renderStep(validProps())
    const btn = screen.getByRole('button', { name: 'Nästa' })
    expect(btn).not.toBeDisabled()
    await userEvent.click(btn)
    expect(props.onNext).toHaveBeenCalledOnce()
  })

  it('next button disabled when share_capital < 25000', () => {
    renderStep({ ...validProps(), share_capital: '24999' })
    const btn = screen.getByRole('button', { name: 'Nästa' })
    expect(btn).toBeDisabled()
  })

  it('next button disabled when registration_date is in the future', () => {
    // System time is 2026-06-15
    renderStep({ ...validProps(), registration_date: '2026-07-01' })
    const btn = screen.getByRole('button', { name: 'Nästa' })
    expect(btn).toBeDisabled()
  })

  it('axe-check passes', async () => {
    const { container } = render(<StepCompany {...DEFAULT_PROPS} {...validProps()} />)
    const axe = await import('axe-core')
    const results = await axe.default.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
