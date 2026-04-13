// @vitest-environment jsdom
// Force Stockholm timezone so the test proves the bug regardless of host TZ
process.env.TZ = 'Europe/Stockholm'

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaymentDialog } from '../src/renderer/components/ui/PaymentDialog'
import { todayLocal } from '../src/shared/date-utils'

describe('S59 F9 — timezone regression: PaymentDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2026-04-12T22:30:00Z = 2026-04-13T00:30:00 CEST (Stockholm)
    // todayLocal() → '2026-04-13' (correct, local date)
    // new Date().toISOString().slice(0,10) → '2026-04-12' (BUGG — "igår")
    vi.setSystemTime(new Date('2026-04-12T22:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Betala faktura',
    totalAmount: 10000,
    paidAmount: 0,
    documentDate: '2026-04-01',
    fiscalYearEnd: '2026-12-31',
    onSubmit: vi.fn(),
    isLoading: false,
  }

  it('initial paymentDate uses local date, not UTC (rad 32)', () => {
    render(<PaymentDialog {...baseProps} />)
    const dateInput = screen.getByDisplayValue('2026-04-13') as HTMLInputElement
    expect(dateInput.value).toBe('2026-04-13')
  })

  it('re-open resets to local date, not UTC (rad 40)', () => {
    const { rerender } = render(<PaymentDialog {...baseProps} open={false} />)
    rerender(<PaymentDialog {...baseProps} open={true} />)
    const dateInput = screen.getByDisplayValue('2026-04-13') as HTMLInputElement
    expect(dateInput.value).toBe('2026-04-13')
  })

  it('validate accepts local today as not-future (rad 62)', () => {
    const onSubmit = vi.fn()
    render(<PaymentDialog {...baseProps} onSubmit={onSubmit} />)
    // paymentDate is '2026-04-13' (local today) — should be accepted
    screen.getByText('Registrera').click()
    expect(onSubmit).toHaveBeenCalled()
  })

  it('todayLocal returns local date, not UTC date, after midnight CEST', () => {
    // Direct proof of the underlying bug pattern
    expect(todayLocal()).toBe('2026-04-13')
    // The old bug pattern returns "yesterday" (UTC date)
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-04-12')
  })
})
