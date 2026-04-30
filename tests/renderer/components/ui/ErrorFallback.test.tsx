// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorFallback } from '../../../../src/renderer/components/ui/ErrorFallback'

describe('ErrorFallback', () => {
  it('visar Error.message', () => {
    render(
      <ErrorFallback
        error={new Error('Diskutrymme slut')}
        resetErrorBoundary={() => {}}
      />,
    )
    expect(screen.getByText('Diskutrymme slut')).toBeInTheDocument()
  })

  it('visar fallback-text vid icke-Error-typ', () => {
    render(
      <ErrorFallback
        error={'string-fel' as unknown as Error}
        resetErrorBoundary={() => {}}
      />,
    )
    expect(screen.getByText(/Ett oväntat fel inträffade/)).toBeInTheDocument()
  })

  it('renderar "Något gick fel"-rubrik', () => {
    render(
      <ErrorFallback error={new Error('x')} resetErrorBoundary={() => {}} />,
    )
    expect(
      screen.getByRole('heading', { name: /Något gick fel/ }),
    ).toBeInTheDocument()
  })

  it('Försök igen-knapp anropar resetErrorBoundary', async () => {
    const reset = vi.fn()
    const user = userEvent.setup()
    render(<ErrorFallback error={new Error('x')} resetErrorBoundary={reset} />)
    await user.click(screen.getByRole('button', { name: /Försök igen/ }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
