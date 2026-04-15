// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { ConfirmFinalizeDialog } from '../../../../src/renderer/components/ui/ConfirmFinalizeDialog'
import { PaymentDialog } from '../../../../src/renderer/components/ui/PaymentDialog'
import { BulkPaymentResultDialog } from '../../../../src/renderer/components/ui/BulkPaymentResultDialog'

beforeEach(() => {
  setupMockIpc()
})

describe('F49 — Dialog a11y', () => {
  it('all dialogs have role="dialog", aria-modal, and aria-labelledby', () => {
    const { unmount: u1 } = render(
      <ConfirmFinalizeDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Bekräfta"
        description="Test"
        onConfirm={vi.fn()}
        isLoading={false}
      />,
    )
    let dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-finalize-title')
    u1()

    const { unmount: u2 } = render(
      <PaymentDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Betalning"
        totalAmount={10000}
        paidAmount={0}
        documentDate="2026-01-01"
        fiscalYearEnd="2026-12-31"
        onSubmit={vi.fn()}
        isLoading={false}
      />,
    )
    dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'payment-dialog-title')

    // PaymentDialog inputs have labels
    expect(screen.getByLabelText(/belopp/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/datum/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bankavgift/i)).toBeInTheDocument()
    u2()

    render(
      <BulkPaymentResultDialog
        open={true}
        onOpenChange={vi.fn()}
        result={{
          status: 'completed',
          batch_id: 1,
          succeeded: [{ id: 1, journal_entry_id: 10 }],
          failed: [],
          bank_fee_journal_entry_id: null,
        }}
      />,
    )
    dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'bulk-result-title')
  })
})
