// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { LoadingSpinner } from '../../../../src/renderer/components/ui/LoadingSpinner'

describe('F49 — LoadingSpinner a11y', () => {
  beforeEach(() => {
    setupMockIpc()
  })

  it('has role="status", aria-live, and sr-only loading text', async () => {
    await renderWithProviders(<LoadingSpinner />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('Laddar')
  })
})
