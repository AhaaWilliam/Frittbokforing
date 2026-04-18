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

/**
 * Sprint P (ADR 003): Dialog-implementation migrerad till Radix.
 * Radix applicerar inte aria-modal på dialog-elementet utan hanterar
 * modalitet via inert/aria-hidden på utanför-innehåll. Radix auto-
 * genererar aria-labelledby-IDs. Detta test verifierar beteende
 * (title är associerat till dialog) snarare än specifika attributvärden.
 */

function assertDialogTitleAssociation(
  dialog: HTMLElement,
  expectedTitleText: string,
) {
  const labelledBy = dialog.getAttribute('aria-labelledby')
  expect(labelledBy).not.toBeNull()
  const titleEl = document.getElementById(labelledBy!)
  expect(titleEl).not.toBeNull()
  expect(titleEl).toHaveTextContent(expectedTitleText)
}

describe('F49 — Dialog a11y', () => {
  it('ConfirmFinalizeDialog har alertdialog-role + associerad title', () => {
    render(
      <ConfirmFinalizeDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Bekräfta"
        description="Test"
        onConfirm={vi.fn()}
        isLoading={false}
      />,
    )
    const dialog = screen.getByRole('alertdialog')
    assertDialogTitleAssociation(dialog, 'Bekräfta')
  })

  it('PaymentDialog har dialog-role + associerad title + labels på inputs', () => {
    render(
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
    const dialog = screen.getByRole('dialog')
    assertDialogTitleAssociation(dialog, 'Betalning')

    expect(screen.getByLabelText(/belopp/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/datum/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/bankavgift/i)).toBeInTheDocument()
  })

  it('BulkPaymentResultDialog har dialog-role + associerad title', () => {
    render(
      <BulkPaymentResultDialog
        open={true}
        onOpenChange={vi.fn()}
        result={{
          status: 'completed',
          batch_id: 1,
          succeeded: [{ id: 1, payment_id: 1, journal_entry_id: 10 }],
          failed: [],
          bank_fee_journal_entry_id: null,
        }}
      />,
    )
    const dialog = screen.getByRole('dialog')
    assertDialogTitleAssociation(dialog, 'Bulk-betalning klar')
  })
})
