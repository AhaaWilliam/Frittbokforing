// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { FirstRunImport } from '../../../src/renderer/pages/FirstRunImport'

beforeEach(() => {
  setupMockIpc()
})

describe('FirstRunImport', () => {
  it('rendrar select-fas + Tillbaka-knapp default', async () => {
    const onBack = vi.fn()
    await renderWithProviders(<FirstRunImport onBack={onBack} />, {
      fiscalYear: 'none',
    })
    expect(screen.getByTestId('first-run-import')).toBeInTheDocument()
    expect(screen.getByTestId('first-run-import-back')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Importera SIE-fil/ }),
    ).toBeInTheDocument()
  })

  it('Tillbaka-knapp anropar onBack', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()
    await renderWithProviders(<FirstRunImport onBack={onBack} />, {
      fiscalYear: 'none',
    })
    await user.click(screen.getByTestId('first-run-import-back'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('visar info-Callout om att importen skapar nytt bolag', async () => {
    await renderWithProviders(<FirstRunImport onBack={() => {}} />, {
      fiscalYear: 'none',
    })
    expect(
      screen.getByText(/skapar ett nytt bolag/i),
    ).toBeInTheDocument()
  })

  it('SIE4 default-format', async () => {
    await renderWithProviders(<FirstRunImport onBack={() => {}} />, {
      fiscalYear: 'none',
    })
    expect(screen.getByText(/Välj SIE4-fil/)).toBeInTheDocument()
  })

  it('byter till SIE5 → text uppdateras', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<FirstRunImport onBack={() => {}} />, {
      fiscalYear: 'none',
    })
    await user.click(screen.getByTestId('import-format-sie5'))
    expect(screen.getByText(/Välj SIE5-fil/)).toBeInTheDocument()
  })
})
