// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { OnboardingWizard } from '../../../src/renderer/pages/OnboardingWizard'

beforeEach(() => {
  setupMockIpc()
})

describe('OnboardingWizard — flöde och struktur', () => {
  it('rendrar 3-stegs stepper med Företagsuppgifter aktiv default', async () => {
    await renderWithProviders(<OnboardingWizard />, { fiscalYear: 'none' })
    expect(screen.getByText('Företagsuppgifter')).toBeInTheDocument()
    expect(screen.getByText('Bokföringsår')).toBeInTheDocument()
    expect(screen.getByText('Bekräfta')).toBeInTheDocument()
  })

  it('default-titel utan onCancel: "Fritt Bokföring" + tagline', async () => {
    await renderWithProviders(<OnboardingWizard />, { fiscalYear: 'none' })
    expect(
      screen.getByText(/Bokföring för svenska aktiebolag/),
    ).toBeInTheDocument()
  })

  it('onCancel-prop ger "Lägg till bolag"-titel + Avbryt-knapp', async () => {
    const onCancel = vi.fn()
    await renderWithProviders(<OnboardingWizard onCancel={onCancel} />, {
      fiscalYear: 'none',
    })
    expect(
      screen.getByRole('heading', { name: 'Lägg till bolag' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('wizard-cancel')).toBeInTheDocument()
  })

  it('Avbryt-klick anropar onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    await renderWithProviders(<OnboardingWizard onCancel={onCancel} />, {
      fiscalYear: 'none',
    })
    await user.click(screen.getByTestId('wizard-cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('onImportInstead syns endast på step 1', async () => {
    const onImportInstead = vi.fn()
    await renderWithProviders(
      <OnboardingWizard onImportInstead={onImportInstead} />,
      { fiscalYear: 'none' },
    )
    expect(screen.getByTestId('wizard-import-instead')).toBeInTheDocument()
  })

  it('onImportInstead-klick kallar callback', async () => {
    const user = userEvent.setup()
    const onImportInstead = vi.fn()
    await renderWithProviders(
      <OnboardingWizard onImportInstead={onImportInstead} />,
      { fiscalYear: 'none' },
    )
    await user.click(screen.getByTestId('wizard-import-instead'))
    expect(onImportInstead).toHaveBeenCalledOnce()
  })

  it('utan onImportInstead syns ingen import-knapp', async () => {
    await renderWithProviders(<OnboardingWizard />, { fiscalYear: 'none' })
    expect(
      screen.queryByTestId('wizard-import-instead'),
    ).not.toBeInTheDocument()
  })

  it('default-titel innehåller italic Fritt-brand', async () => {
    const { container } = await renderWithProviders(<OnboardingWizard />, {
      fiscalYear: 'none',
    })
    const italicSpan = container.querySelector('.font-serif-italic')
    expect(italicSpan?.textContent).toBe('Fritt')
  })

  it('wizard-testid finns på root', async () => {
    await renderWithProviders(<OnboardingWizard />, { fiscalYear: 'none' })
    expect(screen.getByTestId('wizard')).toBeInTheDocument()
  })
})
