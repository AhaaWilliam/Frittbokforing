// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ZoneCons } from '../../../../src/renderer/components/layout/ZoneCons'

describe('ZoneCons', () => {
  it('renders default "Konsekvens"-label', () => {
    render(<ZoneCons />)
    expect(screen.getByText('Konsekvens')).toBeInTheDocument()
  })

  it('renders custom label', () => {
    render(<ZoneCons label="Konsekvens · live" />)
    expect(screen.getByText('Konsekvens · live')).toBeInTheDocument()
  })

  it('renders pulse-indicator when pulse=true', () => {
    const { container } = render(<ZoneCons pulse />)
    // pulse-pricken har background = mint-500
    const pulseDots = container.querySelectorAll('span[aria-hidden="true"]')
    const hasMintDot = Array.from(pulseDots).some((el) =>
      el.getAttribute('style')?.includes('var(--color-mint-500)'),
    )
    expect(hasMintDot).toBe(true)
  })

  it('renders default placeholder when no children', () => {
    render(<ZoneCons />)
    expect(screen.getByText(/fylls i Sprint H\+G-7/)).toBeInTheDocument()
  })

  it('renders children when provided (skipping placeholder)', () => {
    render(
      <ZoneCons>
        <p>Anpassat innehåll</p>
      </ZoneCons>,
    )
    expect(screen.getByText('Anpassat innehåll')).toBeInTheDocument()
    expect(screen.queryByText(/fylls i Sprint H\+G-7/)).not.toBeInTheDocument()
  })

  it('uses aside-element + aria-label', () => {
    render(<ZoneCons label="Påverkan" />)
    const aside = screen.getByRole('complementary')
    expect(aside).toBeInTheDocument()
    expect(aside.getAttribute('aria-label')).toBe('Påverkan')
  })
})
