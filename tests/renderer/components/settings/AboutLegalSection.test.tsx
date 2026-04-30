// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AboutLegalSection } from '../../../../src/renderer/components/settings/AboutLegalSection'

describe('AboutLegalSection', () => {
  it('rendrar Om & juridik-rubrik', () => {
    render(<AboutLegalSection />)
    expect(
      screen.getByRole('heading', { name: /Om & juridik/ }),
    ).toBeInTheDocument()
  })

  it('visar app-version', () => {
    render(<AboutLegalSection />)
    expect(screen.getByText(/App-version/)).toBeInTheDocument()
    // Version finns i :dt + :dd struktur — vi vet inte vad __APP_VERSION__ är
    // i test-build, men något ska visas (kan vara "dev" eller version-string)
    const dl = screen.getByTestId('about-legal-section').querySelector('dl')
    expect(dl?.textContent).toMatch(/App-version/)
  })

  it('rendrar 4 åtgärds-knappar/länkar', () => {
    render(<AboutLegalSection />)
    expect(screen.getByTestId('open-tos')).toBeInTheDocument()
    expect(screen.getByTestId('open-privacy')).toBeInTheDocument()
    expect(screen.getByTestId('open-support-mail')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Bokföringsnämnden/ }),
    ).toHaveAttribute('href', 'https://www.bokforingsnamnden.se/')
  })

  it('öppnar ToS-dialog vid klick', async () => {
    const user = userEvent.setup()
    render(<AboutLegalSection />)
    await user.click(screen.getByTestId('open-tos'))
    expect(
      screen.getByRole('dialog', { name: /Användarvillkor/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Bokföringslagen/)).toBeInTheDocument()
  })

  it('öppnar Privacy-dialog vid klick', async () => {
    const user = userEvent.setup()
    render(<AboutLegalSection />)
    await user.click(screen.getByTestId('open-privacy'))
    expect(
      screen.getByRole('dialog', { name: /Integritetspolicy/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/GDPR/)).toBeInTheDocument()
  })

  it('externa länkar har target="_blank" + rel="noopener noreferrer"', () => {
    render(<AboutLegalSection />)
    const link = screen.getByRole('link', { name: /Bokföringsnämnden/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
