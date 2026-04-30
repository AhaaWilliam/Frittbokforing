// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { DisposeDialog } from '../../../../src/renderer/components/fixed-assets/DisposeDialog'

beforeEach(() => {
  setupMockIpc()
  // useAllAccounts(true) — list of active accounts
  mockIpcResponse('account:list-all', {
    success: true,
    data: [
      { account_number: '1930', name: 'Företagskonto', class_id: 1 },
      { account_number: '1510', name: 'Kundfordringar', class_id: 1 },
      { account_number: '2440', name: 'Leverantörsskulder', class_id: 2 },
      { account_number: '3000', name: 'Försäljning', class_id: 3 },
    ],
  })
})

describe('DisposeDialog', () => {
  it('rendrar header med assetName', async () => {
    await renderWithProviders(
      <DisposeDialog
        assetName="Dator 2024"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    expect(
      screen.getByRole('heading', { name: /Avyttra Dator 2024/ }),
    ).toBeInTheDocument()
  })

  it('default state: generate-entry checked, datum=today', async () => {
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    expect(screen.getByTestId('dispose-generate-entry')).toBeChecked()
    expect(screen.getByTestId('dispose-sale-price')).toBeInTheDocument()
  })

  it('uncheck generate-entry döljer pris- och konto-fält', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await user.click(screen.getByTestId('dispose-generate-entry'))
    expect(screen.queryByTestId('dispose-sale-price')).not.toBeInTheDocument()
  })

  it('konto-dropdown visas bara när sale_price > 0', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    expect(
      screen.queryByTestId('dispose-proceeds-account'),
    ).not.toBeInTheDocument()
    await user.type(screen.getByTestId('dispose-sale-price'), '5000')
    await waitFor(() => {
      expect(screen.getByTestId('dispose-proceeds-account')).toBeInTheDocument()
    })
  })

  it('konto-dropdown filtrerar 1xxx + 2xxx (BR-konton)', async () => {
    const user = userEvent.setup()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await user.type(screen.getByTestId('dispose-sale-price'), '5000')
    await waitFor(() => {
      const dropdown = screen.getByTestId('dispose-proceeds-account')
      // 1930, 1510, 2440 ska finnas; 3000 ska INTE finnas
      expect(dropdown.textContent).toContain('1930')
      expect(dropdown.textContent).toContain('1510')
      expect(dropdown.textContent).toContain('2440')
      expect(dropdown.textContent).not.toContain('3000')
    })
  })

  it('Avbryt anropar onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await user.click(screen.getByRole('button', { name: 'Avbryt' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Avyttra utan pris → sale_price_ore=0, proceeds_account=null', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await user.click(screen.getByTestId('dispose-submit'))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        sale_price_ore: 0,
        proceeds_account: null,
        generate_journal_entry: true,
      }),
    )
  })

  it('Avyttra med pris → sale_price_ore i ören + proceeds_account', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
      { axeCheck: false }, // M133 exempt — dedicated axe test below
    )
    await user.type(screen.getByTestId('dispose-sale-price'), '500.50')
    await user.click(screen.getByTestId('dispose-submit'))
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        sale_price_ore: 50050,
        proceeds_account: '1930', // BANK_FORETAGSKONTO default
      }),
    )
  })

  it('passes axe a11y check', async () => {
    const { axeResults } = await renderWithProviders(
      <DisposeDialog
        assetName="X"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
