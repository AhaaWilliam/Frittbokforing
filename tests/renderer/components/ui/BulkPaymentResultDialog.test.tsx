// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BulkPaymentResultDialog } from '../../../../src/renderer/components/ui/BulkPaymentResultDialog'
import type { BulkPaymentResult } from '../../../../src/shared/types'

function makeResult(overrides?: Partial<BulkPaymentResult>): BulkPaymentResult {
  return {
    batch_id: 1,
    status: 'completed',
    succeeded: [
      { id: 1, payment_id: 10, journal_entry_id: 100 },
      { id: 2, payment_id: 11, journal_entry_id: 101 },
    ],
    failed: [
      { id: 3, error: 'Beloppet överstiger kvarstående', code: 'VALIDATION_ERROR' },
    ],
    bank_fee_journal_entry_id: null,
    ...overrides,
  }
}

const DEFAULT_PROPS = {
  open: true,
  onOpenChange: vi.fn(),
  result: makeResult(),
}

describe('BulkPaymentResultDialog', () => {
  it('renders succeeded count', () => {
    render(<BulkPaymentResultDialog {...DEFAULT_PROPS} />)
    expect(screen.getByText(/2 av 3 genomförda/)).toBeInTheDocument()
  })

  it('shows failed list with error messages', () => {
    render(<BulkPaymentResultDialog {...DEFAULT_PROPS} />)
    expect(screen.getByText(/Misslyckades/)).toBeInTheDocument()
    expect(screen.getByText(/Beloppet överstiger kvarstående/)).toBeInTheDocument()
  })

  it('hides failed section when all succeed', () => {
    render(
      <BulkPaymentResultDialog
        {...DEFAULT_PROPS}
        result={makeResult({ failed: [] })}
      />,
    )
    expect(screen.queryByText(/Misslyckades/)).not.toBeInTheDocument()
  })

  it('shows "avbruten" for cancelled status', () => {
    render(
      <BulkPaymentResultDialog
        {...DEFAULT_PROPS}
        result={makeResult({ status: 'cancelled', succeeded: [], failed: [{ id: 1, error: 'err', code: 'ERR' }] })}
      />,
    )
    expect(screen.getByText(/avbruten/)).toBeInTheDocument()
  })

  it('shows bank fee journal entry when present', () => {
    render(
      <BulkPaymentResultDialog
        {...DEFAULT_PROPS}
        result={makeResult({ bank_fee_journal_entry_id: 42 })}
      />,
    )
    expect(screen.getByText(/verifikat #42/)).toBeInTheDocument()
  })

  it('renders nothing when open=false', () => {
    render(
      <BulkPaymentResultDialog {...DEFAULT_PROPS} open={false} />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('axe-check passes', async () => {
    const { container } = render(
      <BulkPaymentResultDialog {...DEFAULT_PROPS} />,
    )
    const axe = await import('axe-core')
    const results = await axe.default.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
