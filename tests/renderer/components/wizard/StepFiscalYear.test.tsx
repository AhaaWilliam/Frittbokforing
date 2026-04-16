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

  it('shows warning when company registered < 12 months ago', () => {
    // System time is 2026-06-15, registration 6 months ago
    renderStep({ registration_date: '2026-01-01' })
    expect(
      screen.getByText(/räkenskapsår på 12 hela månader/),
    ).toBeInTheDocument()
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
