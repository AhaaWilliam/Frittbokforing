// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  StepFiscalYear,
  computeFiscalYear,
} from '../../../../src/renderer/components/wizard/StepFiscalYear'

// ── computeFiscalYear unit tests (no rendering) ──────────────────────

describe('computeFiscalYear', () => {
  it('standard year: jan-dec based on registration year', () => {
    const result = computeFiscalYear('2026-03-15', false, 1)
    expect(result).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('short first FY (BFL 3:3): start = registreringsdatum, slut = 31 dec', () => {
    const result = computeFiscalYear('2026-04-22', false, 1, true)
    expect(result).toEqual({ start: '2026-04-22', end: '2026-12-31' })
  })

  it('short first FY + brutet: ignoreras, faller tillbaka till standard brutet', () => {
    // Kortat + brutet stöds ej (kan överskrida 13 perioder)
    const result = computeFiscalYear('2026-04-22', true, 7, true)
    expect(result).toEqual({ start: '2026-07-01', end: '2027-06-30' })
  })

  it('extended first FY: reg 2026-12-15 → 2027-12-31', () => {
    const result = computeFiscalYear('2026-12-15', false, 1, false, true)
    expect(result).toEqual({ start: '2026-12-15', end: '2027-12-31' })
  })

  it('extended first FY + brutet: ignoreras, faller tillbaka till standard brutet', () => {
    const result = computeFiscalYear('2026-04-22', true, 7, false, true)
    expect(result).toEqual({ start: '2026-07-01', end: '2027-06-30' })
  })

  it('broken FY start_month=7: jul → jun next year', () => {
    const result = computeFiscalYear('2026-01-01', true, 7)
    expect(result).toEqual({ start: '2026-07-01', end: '2027-06-30' })
  })

  it('broken FY start_month=5: may → apr next year', () => {
    const result = computeFiscalYear('2026-01-01', true, 5)
    expect(result).toEqual({ start: '2026-05-01', end: '2027-04-30' })
  })

  it('broken FY start_month=1: identical to standard year', () => {
    const result = computeFiscalYear('2026-01-01', true, 1)
    expect(result).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('leap year: start_month=3, 2024 → end feb 2025 (not leap)', () => {
    const result = computeFiscalYear('2024-01-01', true, 3)
    expect(result.end).toBe('2025-02-28')
  })

  it('leap year: start_month=3, 2023 → end feb 2024 (leap year)', () => {
    const result = computeFiscalYear('2023-01-01', true, 3)
    expect(result.end).toBe('2024-02-29')
  })
})

// ── Rendering tests ──────────────────────────────────────────────────

const DEFAULT_PROPS = {
  registration_date: '2026-01-01',
  use_broken_fiscal_year: false,
  fiscal_year_start_month: 1,
  use_short_first_fy: false,
  use_extended_first_fy: false,
  onChange: vi.fn(),
  onNext: vi.fn(),
  onBack: vi.fn(),
}

beforeEach(() => {
  vi.setSystemTime(new Date('2026-06-15T12:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

function renderStep(overrides?: Partial<typeof DEFAULT_PROPS>) {
  const props = { ...DEFAULT_PROPS, onChange: vi.fn(), onNext: vi.fn(), onBack: vi.fn(), ...overrides }
  return { ...render(<StepFiscalYear {...props} />), props }
}

describe('StepFiscalYear', () => {
  it('renders fiscal year preview', () => {
    renderStep()
    expect(screen.getByText(/Ditt första bokföringsår/)).toBeInTheDocument()
    // Standard year: "1 januari 2026 — 31 december 2026"
    expect(screen.getByText(/1 januari 2026/)).toBeInTheDocument()
    expect(screen.getByText(/31 december 2026/)).toBeInTheDocument()
  })

  it('checkbox toggles broken fiscal year month picker', async () => {
    const { props } = renderStep()
    expect(screen.queryByLabelText(/Startmånad/)).not.toBeInTheDocument()

    const checkbox = screen.getByLabelText(/brutet räkenskapsår/)
    await userEvent.click(checkbox)
    expect(props.onChange).toHaveBeenCalledWith('use_broken_fiscal_year', true)
  })

  it('shows month picker when broken FY enabled', () => {
    renderStep({ use_broken_fiscal_year: true })
    expect(screen.getByText('Startmånad')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('shows info about short first FY when company registered < 12 months ago', () => {
    // System time is 2026-06-15, registration 6 months ago
    renderStep({ registration_date: '2026-01-01' })
    expect(
      screen.getByText(/kortat första\s*räkenskapsår/i),
    ).toBeInTheDocument()
  })

  it('shows short-FY checkbox when registration_date is mid-month', () => {
    renderStep({ registration_date: '2026-04-22' })
    expect(screen.getByTestId('wizard-short-fy-toggle')).toBeInTheDocument()
  })

  it('hides short-FY checkbox when registration_date is Jan 1 calendar-year', () => {
    renderStep({ registration_date: '2026-01-01' })
    expect(
      screen.queryByTestId('wizard-short-fy-toggle'),
    ).not.toBeInTheDocument()
  })

  it('short-FY toggle updates state via onChange', async () => {
    const { props } = renderStep({ registration_date: '2026-04-22' })
    await userEvent.click(screen.getByTestId('wizard-short-fy-toggle'))
    expect(props.onChange).toHaveBeenCalledWith('use_short_first_fy', true)
  })

  it('shows extended-FY checkbox when reg is mid-month, not broken', () => {
    renderStep({ registration_date: '2026-12-15' })
    expect(screen.getByTestId('wizard-extended-fy-toggle')).toBeInTheDocument()
  })

  it('short + extended are mutually exclusive (disables other)', () => {
    renderStep({
      registration_date: '2026-04-22',
      use_short_first_fy: true,
    })
    expect(screen.getByTestId('wizard-extended-fy-toggle')).toBeDisabled()
  })

  it('axe-check passes', async () => {
    const { container } = render(<StepFiscalYear {...DEFAULT_PROPS} />)
    const axe = await import('axe-core')
    const results = await axe.default.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
