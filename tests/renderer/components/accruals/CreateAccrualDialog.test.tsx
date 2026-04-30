// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CreateAccrualDialog } from '../../../../src/renderer/components/accruals/CreateAccrualDialog'

beforeEach(() => {
  setupMockIpc()
  // useAccounts(K2/K3, undefined, true) — active accounts
  mockIpcResponse('account:list', {
    success: true,
    data: [
      { account_number: '1710', name: 'Förutbetalda kostnader', class_id: 1, is_active: 1 },
      { account_number: '5010', name: 'Lokalhyra', class_id: 5, is_active: 1 },
    ],
  })
})

describe('CreateAccrualDialog', () => {
  it('open=false renderar ingen dialog', async () => {
    await renderWithProviders(
      <CreateAccrualDialog
        open={false}
        onOpenChange={() => {}}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
      { axeCheck: false }, // M133 exempt — ingen markup vid open=false
    )
    expect(
      screen.queryByRole('dialog', { name: /Ny periodisering/ }),
    ).not.toBeInTheDocument()
  })

  it('open=true rendrar form-fält + Avbryt/Skapa', async () => {
    await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={() => {}}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Ny periodisering/ }),
      ).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/Beskrivning/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Typ$/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Balanskonto/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Resultatkonto/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Totalbelopp/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Startperiod/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Antal perioder/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avbryt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skapa' })).toBeInTheDocument()
  })

  it('Avbryt anropar onOpenChange(false)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={onOpenChange}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('konto-namn visas under input när konto är angett', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={() => {}}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
    )
    await user.type(screen.getByLabelText(/Balanskonto/), '1710')
    await waitFor(() => {
      expect(screen.getByText('Förutbetalda kostnader')).toBeInTheDocument()
    })
  })

  it('tomt belopp blockerar submit (HTML5 required)', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={onOpenChange}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
    )
    // Försök submit utan att fylla i fält
    await user.click(screen.getByRole('button', { name: 'Skapa' }))
    // onOpenChange ska INTE ha kallats med false (close-vid-success)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('respekterar periodCount för start-period-options (M161)', async () => {
    await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={() => {}}
        fiscalYearId={1}
        fiscalRule="K2"
        periodCount={6}
      />,
    )
    const startPeriod = (await screen.findByLabelText(
      /Startperiod/,
    )) as HTMLSelectElement
    // 6 perioder → start kan vara P1–P5 (perioder - 1)
    expect(startPeriod.options.length).toBe(5)
    expect(startPeriod.options[startPeriod.options.length - 1]?.value).toBe('5')
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(
      <CreateAccrualDialog
        open
        onOpenChange={() => {}}
        fiscalYearId={1}
        fiscalRule="K2"
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
