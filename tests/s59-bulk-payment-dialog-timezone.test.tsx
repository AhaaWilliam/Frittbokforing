// @vitest-environment jsdom
// Force Stockholm timezone so the test proves the bug regardless of host TZ
process.env.TZ = 'Europe/Stockholm'

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BulkPaymentDialog } from '../src/renderer/components/ui/BulkPaymentDialog'

describe('S59 F9 — timezone regression: BulkPaymentDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 2026-04-12T22:30:00Z = 2026-04-13T00:30:00 CEST (Stockholm)
    vi.setSystemTime(new Date('2026-04-12T22:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const baseProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Bulk-betalning',
    rows: [
      { id: 1, label: 'F-001', counterparty: 'Acme', remaining: 10000 },
    ],
    onSubmit: vi.fn(),
    isLoading: false,
  }

  it('paymentDate uses local date on open, not UTC', () => {
    render(<BulkPaymentDialog {...baseProps} />)
    const dateInput = screen.getByDisplayValue('2026-04-13') as HTMLInputElement
    expect(dateInput.value).toBe('2026-04-13')
  })

  it('re-open resets to local date', () => {
    const { rerender } = render(<BulkPaymentDialog {...baseProps} open={false} />)
    rerender(<BulkPaymentDialog {...baseProps} open={true} />)
    const dateInput = screen.getByDisplayValue('2026-04-13') as HTMLInputElement
    expect(dateInput.value).toBe('2026-04-13')
  })
})
