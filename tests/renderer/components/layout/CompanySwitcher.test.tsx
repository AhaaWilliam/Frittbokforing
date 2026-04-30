// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc, mockIpcResponse } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { CompanySwitcher } from '../../../../src/renderer/components/layout/CompanySwitcher'

beforeEach(() => {
  setupMockIpc()
})

describe('CompanySwitcher', () => {
  it('rendrar aktivt bolag som trigger', async () => {
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    expect(screen.getByText('Test AB')).toBeInTheDocument()
  })

  it('default: dropdown stängd', async () => {
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('company-switcher-menu'),
    ).not.toBeInTheDocument()
  })

  it('klick på trigger öppnar listbox', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('company-switcher'))
    expect(screen.getByTestId('company-switcher-menu')).toBeInTheDocument()
  })

  it('aria-expanded reflekterar dropdown-status', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    const trigger = screen.getByTestId('company-switcher')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('aria-haspopup="listbox"', async () => {
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toHaveAttribute(
        'aria-haspopup',
        'listbox',
      )
    })
  })

  it('listbox har 1 option per bolag + separator + add-knapp', async () => {
    const user = userEvent.setup()
    mockIpcResponse('company:list', {
      success: true,
      data: [
        {
          id: 1,
          name: 'Test AB',
          org_number: '556036-0793',
          fiscal_rule: 'K2',
          share_capital: 2_500_000,
          base_currency: 'SEK',
          registration_date: '2025-01-01',
          vat_number: null,
          email: null,
          phone: null,
          address_line1: null,
          address_line2: null,
          postal_code: null,
          city: null,
          country: 'SE',
          bankgiro: null,
          plusgiro: null,
          website: null,
          board_members: null,
          approved_for_f_tax: 0,
          created_at: '2025-01-01 00:00:00',
        },
      ],
    })
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('company-switcher'))
    // Den enda option är aktivt bolag → ha aria-selected=true
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThanOrEqual(1)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    // Add-knapp finns alltid
    expect(screen.getByTestId('company-switcher-add')).toBeInTheDocument()
  })

  it('Lägg till bolag-knapp öppnar OnboardingWizard-dialog', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<CompanySwitcher />)
    await waitFor(() => {
      expect(screen.getByTestId('company-switcher')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('company-switcher'))
    await user.click(screen.getByTestId('company-switcher-add'))
    expect(screen.getByTestId('add-company-dialog')).toBeInTheDocument()
  })
})
