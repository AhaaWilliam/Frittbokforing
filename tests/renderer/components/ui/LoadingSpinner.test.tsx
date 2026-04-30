// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../../../../src/renderer/components/ui/LoadingSpinner'

describe('LoadingSpinner', () => {
  it('rendrar role="status" för screen readers', () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('har aria-live="polite" så SR annonserar utan att avbryta', () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })

  it('innehåller sr-only "Laddar…"-text för screen readers', () => {
    render(<LoadingSpinner />)
    expect(screen.getByText('Laddar…')).toBeInTheDocument()
  })

  it('respekterar className-prop', () => {
    const { container } = render(<LoadingSpinner className="custom-x" />)
    expect(container.firstChild).toHaveClass('custom-x')
  })

  it('default-className saknar custom när className är undefined', () => {
    const { container } = render(<LoadingSpinner />)
    expect((container.firstChild as HTMLElement).className).not.toContain(
      'undefined',
    )
  })
})
