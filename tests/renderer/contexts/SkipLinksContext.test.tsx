// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  SkipLinksProvider,
  useSkipLinks,
} from '../../../src/renderer/contexts/SkipLinksContext'

function TestConsumer() {
  const { bulkActionsActive, setBulkActionsActive } = useSkipLinks()
  return (
    <div>
      <span data-testid="state">{bulkActionsActive ? 'on' : 'off'}</span>
      <button onClick={() => setBulkActionsActive(true)}>activate</button>
      <button onClick={() => setBulkActionsActive(false)}>deactivate</button>
    </div>
  )
}

describe('SkipLinksContext', () => {
  it('provider default-state är false', () => {
    render(
      <SkipLinksProvider>
        <TestConsumer />
      </SkipLinksProvider>,
    )
    expect(screen.getByTestId('state')).toHaveTextContent('off')
  })

  it('setBulkActionsActive(true) uppdaterar state', () => {
    render(
      <SkipLinksProvider>
        <TestConsumer />
      </SkipLinksProvider>,
    )
    act(() => {
      screen.getByText('activate').click()
    })
    expect(screen.getByTestId('state')).toHaveTextContent('on')
  })

  it('setBulkActionsActive(false) återställer', () => {
    render(
      <SkipLinksProvider>
        <TestConsumer />
      </SkipLinksProvider>,
    )
    act(() => {
      screen.getByText('activate').click()
    })
    act(() => {
      screen.getByText('deactivate').click()
    })
    expect(screen.getByTestId('state')).toHaveTextContent('off')
  })

  it('useSkipLinks utan provider kastar fel', () => {
    // Suppress React error boundary noise
    const originalError = console.error
    console.error = () => {}
    try {
      expect(() => render(<TestConsumer />)).toThrow(
        /useSkipLinks måste användas inom SkipLinksProvider/,
      )
    } finally {
      console.error = originalError
    }
  })
})
