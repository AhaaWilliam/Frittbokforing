// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  StepConfirm,
  formatSwedishDate,
} from '../../../../src/renderer/components/wizard/StepConfirm'

const DEFAULT_PROPS = {
  name: 'Testbolaget AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: '50000',
  registration_date: '2020-06-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
  onBack: vi.fn(),
  onSubmit: vi.fn(),
  isPending: false,
  error: null,
}

describe('formatSwedishDate', () => {
  it('formats ISO date to Swedish text', () => {
    expect(formatSwedishDate('2026-01-01')).toBe('1 januari 2026')
    expect(formatSwedishDate('2026-12-31')).toBe('31 december 2026')
    expect(formatSwedishDate('2026-06-15')).toBe('15 juni 2026')
  })

  it('returns input unchanged for invalid format', () => {
    expect(formatSwedishDate('invalid')).toBe('invalid')
  })
})

describe('StepConfirm', () => {
  it('renders summary with company details', () => {
    render(<StepConfirm {...DEFAULT_PROPS} />)
    expect(screen.getByText('Testbolaget AB')).toBeInTheDocument()
    expect(screen.getByText('556036-0793')).toBeInTheDocument()
    expect(screen.getByText(/Förenklad redovisning \(K2\)/)).toBeInTheDocument()
  })

  it('renders fiscal year with formatted dates', () => {
    render(<StepConfirm {...DEFAULT_PROPS} />)
    expect(screen.getByText(/1 januari 2026/)).toBeInTheDocument()
    expect(screen.getByText(/31 december 2026/)).toBeInTheDocument()
  })

  it('isPending=true disables submit button and shows loading text', () => {
    render(<StepConfirm {...DEFAULT_PROPS} isPending={true} />)
    const submitBtn = screen.getByRole('button', { name: /Skapar/ })
    expect(submitBtn).toBeDisabled()
    expect(submitBtn).toHaveTextContent('Skapar...')
  })

  it('isPending=true disables back button', () => {
    render(<StepConfirm {...DEFAULT_PROPS} isPending={true} />)
    const backBtn = screen.getByRole('button', { name: 'Tillbaka' })
    expect(backBtn).toBeDisabled()
  })

  it('shows error message when error prop is set', () => {
    render(
      <StepConfirm
        {...DEFAULT_PROPS}
        error="Ogiltigt organisationsnummer (kontrollsiffran stämmer inte)"
      />,
    )
    expect(screen.getByText(/kontrollsiffran stämmer inte/)).toBeInTheDocument()
  })

  it('axe-check passes', async () => {
    const { container } = render(<StepConfirm {...DEFAULT_PROPS} />)
    const axe = await import('axe-core')
    const results = await axe.default.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
