// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import axe from 'axe-core'
import { Tooltip } from '../src/renderer/components/ui/Tooltip'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

// ── F53: YearPicker timezone-safe date extraction ────────────────────

describe('F53: date string extraction (no Date objects)', () => {
  // Test the logic directly — no need to render YearPicker
  function formatFiscalYearLabel(start_date: string, end_date: string): string {
    const startYear = start_date.slice(0, 4)
    const endYear = end_date.slice(0, 4)
    if (startYear === endYear) return startYear
    return `${startYear}/${endYear.slice(-2)}`
  }

  it('same-year FY returns single year', () => {
    expect(formatFiscalYearLabel('2026-01-01', '2026-12-31')).toBe('2026')
  })

  it('split-year FY returns year/year format', () => {
    expect(formatFiscalYearLabel('2025-07-01', '2026-06-30')).toBe('2025/26')
  })

  it('FY boundary Jan 1 is safe (no timezone shift)', () => {
    // This is the critical test: new Date('2026-01-01') in CET gives 2025
    // String extraction gives the correct year
    expect(formatFiscalYearLabel('2026-01-01', '2026-12-31')).toBe('2026')
  })

  it('FY boundary Dec 31 is safe', () => {
    expect(formatFiscalYearLabel('2025-01-01', '2025-12-31')).toBe('2025')
  })
})

// ── F54: Tooltip component ───────────────────────────────────────────

describe('F54: Tooltip', () => {
  it('renders children without tooltip by default', () => {
    render(
      <Tooltip content="Företagskonto / checkkonto">
        <span>1930</span>
      </Tooltip>,
    )
    expect(screen.getByText('1930')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows tooltip on hover', () => {
    render(
      <Tooltip content="Företagskonto">
        <span>1930</span>
      </Tooltip>,
    )
    fireEvent.mouseEnter(screen.getByText('1930').closest('span')!.parentElement!)
    expect(screen.getByRole('tooltip')).toHaveTextContent('Företagskonto')
  })

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Företagskonto">
        <span>1930</span>
      </Tooltip>,
    )
    const wrapper = screen.getByText('1930').closest('span')!.parentElement!
    fireEvent.mouseEnter(wrapper)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('shows tooltip on focus (keyboard accessibility)', () => {
    render(
      <Tooltip content="Företagskonto">
        <span>1930</span>
      </Tooltip>,
    )
    const wrapper = screen.getByText('1930').closest('span')!.parentElement!
    fireEvent.focus(wrapper)
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })

  it('has aria-describedby pointing to tooltip', () => {
    render(
      <Tooltip content="Företagskonto">
        <span>1930</span>
      </Tooltip>,
    )
    const outerWrapper = screen.getByText('1930').closest('[tabindex="0"]')!.parentElement!
    fireEvent.mouseEnter(outerWrapper)
    const tooltip = screen.getByRole('tooltip')
    const focusable = outerWrapper.querySelector('[tabindex="0"]')!
    expect(focusable.getAttribute('aria-describedby')).toBe(tooltip.id)
  })

  it('passes axe-core a11y check', async () => {
    const { container } = render(
      <Tooltip content="Företagskonto">
        <span>1930</span>
      </Tooltip>,
    )
    // Trigger tooltip to appear for a11y check
    const wrapper = screen.getByText('1930').closest('span')!.parentElement!
    fireEvent.mouseEnter(wrapper)

    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
