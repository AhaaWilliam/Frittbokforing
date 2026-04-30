// @vitest-environment jsdom
/**
 * Sprint 43 — FieldError unit-tester (Sprint 32-skydd).
 *
 * FieldError är M133-kontraktsbärare för fält-fel i form-komponenter.
 * Sprint 39 migrerade alla 15 callsites till denna primitive — testerna
 * skyddar mot framtida regression i kontraktet:
 *   - role="alert" alltid satt (M133)
 *   - id forwardas (för aria-describedby på input-elementet)
 *   - data-testid forwardas (för E2E-selectors)
 *   - children renderas
 *   - className mergas med default-styling
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { FieldError } from '../../../../src/renderer/components/ui/FieldError'

describe('FieldError', () => {
  it('renderar children med role="alert"', () => {
    render(<FieldError>Krävs</FieldError>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Krävs')
  })

  it('forwardar id (för aria-describedby på input-elementet)', () => {
    render(<FieldError id="my-error-id">Felmeddelande</FieldError>)
    const alert = screen.getByRole('alert')
    expect(alert.id).toBe('my-error-id')
  })

  it('forwardar data-testid för E2E-selectors', () => {
    render(<FieldError data-testid="amount-error">Fel</FieldError>)
    const alert = screen.getByTestId('amount-error')
    expect(alert).toBeInTheDocument()
  })

  it('default-styling: text-danger-500 + text-xs + mt-1', () => {
    render(<FieldError>X</FieldError>)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('text-danger-500')
    expect(alert.className).toContain('text-xs')
    expect(alert.className).toContain('mt-1')
  })

  it('mergar custom className med default', () => {
    render(<FieldError className="custom-class">X</FieldError>)
    const alert = screen.getByRole('alert')
    expect(alert.className).toContain('text-danger-500')
    expect(alert.className).toContain('custom-class')
  })

  it('passerar axe a11y check', async () => {
    const { container } = render(
      <FieldError id="err-id">Ett valideringsfel</FieldError>,
    )
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })

  it('renderar ReactNode children, inte bara strings', () => {
    render(
      <FieldError>
        <strong>Viktigt:</strong> Krävs
      </FieldError>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toContainHTML('<strong>Viktigt:</strong>')
  })
})
