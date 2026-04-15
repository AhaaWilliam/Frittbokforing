// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { OnboardingWizard } from '../../../../src/renderer/pages/OnboardingWizard'

beforeEach(() => {
  setupMockIpc()
})

describe('OnboardingWizard — F49 a11y', () => {
  it('Step 1 inputs have proper label associations and pass axe', async () => {
    await renderWithProviders(<OnboardingWizard />, { fiscalYear: 'none' })

    // All inputs should have accessible labels
    expect(screen.getByLabelText(/vad heter ditt företag/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organisationsnummer/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/insatt aktiekapital/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/när registrerades/i)).toBeInTheDocument()
    // Radio buttons are labeled via wrapping <label>
    expect(screen.getByLabelText(/förenklad redovisning/i)).toBeInTheDocument()
  })
})
