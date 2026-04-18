// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import {
  SkipLinksProvider,
  useSkipLinks,
} from '../../../../src/renderer/contexts/SkipLinksContext'
import { SkipLinks } from '../../../../src/renderer/components/layout/SkipLinks'

function Targets() {
  return (
    <>
      <main id="main-content">Main</main>
      <nav id="primary-nav">Nav</nav>
    </>
  )
}

function BulkTarget() {
  return (
    <div id="bulk-actions" role="region" aria-label="Massåtgärder">
      Bulk
    </div>
  )
}

function BulkToggle() {
  const { bulkActionsActive, setBulkActionsActive } = useSkipLinks()
  return (
    <button
      type="button"
      onClick={() => setBulkActionsActive(!bulkActionsActive)}
      data-testid="toggle-bulk"
    >
      Toggle
    </button>
  )
}

describe('SkipLinks', () => {
  beforeEach(() => {
    // Reset body so previous test's elements don't leak
    document.body.innerHTML = ''
  })

  it('visar main + nav skip-links när bulk är inaktiv', () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    expect(screen.getByTestId('skip-to-main')).toBeDefined()
    expect(screen.getByTestId('skip-to-nav')).toBeDefined()
    expect(screen.queryByTestId('skip-to-bulk')).toBeNull()
  })

  it('visar bulk skip-link när bulkActionsActive=true', async () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <BulkToggle />
        <Targets />
        <BulkTarget />
      </SkipLinksProvider>,
    )
    expect(screen.queryByTestId('skip-to-bulk')).toBeNull()
    await userEvent.click(screen.getByTestId('toggle-bulk'))
    expect(screen.getByTestId('skip-to-bulk')).toBeDefined()
  })

  it('bulk skip-link i mitten av DOM-ordning (main → bulk → nav)', async () => {
    const { container } = render(
      <SkipLinksProvider>
        <SkipLinks />
        <BulkToggle />
        <Targets />
        <BulkTarget />
      </SkipLinksProvider>,
    )
    await userEvent.click(screen.getByTestId('toggle-bulk'))
    const links = container.querySelectorAll('a[data-testid^="skip-to"]')
    expect(links.length).toBe(3)
    expect(links[0]?.getAttribute('data-testid')).toBe('skip-to-main')
    expect(links[1]?.getAttribute('data-testid')).toBe('skip-to-bulk')
    expect(links[2]?.getAttribute('data-testid')).toBe('skip-to-nav')
  })

  it('click på skip-to-main fokuserar #main-content', async () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    const link = screen.getByTestId('skip-to-main')
    await userEvent.click(link)
    expect(document.activeElement?.id).toBe('main-content')
  })

  it('click på skip-to-nav fokuserar #primary-nav', async () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    const link = screen.getByTestId('skip-to-nav')
    await userEvent.click(link)
    expect(document.activeElement?.id).toBe('primary-nav')
  })

  it('click på skip-to-bulk fokuserar #bulk-actions', async () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <BulkToggle />
        <Targets />
        <BulkTarget />
      </SkipLinksProvider>,
    )
    await userEvent.click(screen.getByTestId('toggle-bulk'))
    const link = screen.getByTestId('skip-to-bulk')
    await userEvent.click(link)
    expect(document.activeElement?.id).toBe('bulk-actions')
  })

  it('click preventDefault stoppar hash-ändring', async () => {
    const originalHash = window.location.hash
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    await userEvent.click(screen.getByTestId('skip-to-main'))
    expect(window.location.hash).toBe(originalHash)
  })

  it('skip-links har sr-only-klass (visuellt dolda)', () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    const link = screen.getByTestId('skip-to-main')
    expect(link.className).toContain('sr-only')
    expect(link.className).toContain('focus:not-sr-only')
  })

  it('Enter-tangent på fokuserad skip-link triggar navigering', async () => {
    render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    const link = screen.getByTestId('skip-to-nav')
    act(() => {
      link.focus()
    })
    expect(document.activeElement).toBe(link)
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement?.id).toBe('primary-nav')
  })

  it('saknat target är no-op (kastar inte)', async () => {
    // Rendera SkipLinks utan targets - click ska inte krascha
    render(
      <SkipLinksProvider>
        <SkipLinks />
      </SkipLinksProvider>,
    )
    const link = screen.getByTestId('skip-to-main')
    await userEvent.click(link)
    // Inget target att fokusera, men inget fel heller
    expect(document.activeElement).not.toBe(null)
  })

  it('useSkipLinks utanför Provider kastar fel', () => {
    const originalError = console.error
    console.error = () => {}
    try {
      expect(() =>
        render(
          <div>
            <BulkToggle />
          </div>,
        ),
      ).toThrow(/SkipLinksProvider/)
    } finally {
      console.error = originalError
    }
  })

  it('axe: ingen a11y-violation med main + nav renderade', async () => {
    const { container } = render(
      <SkipLinksProvider>
        <SkipLinks />
        <Targets />
      </SkipLinksProvider>,
    )
    const results = await axe.run(container, {
      rules: { 'color-contrast': { enabled: false } },
    })
    expect(results.violations).toEqual([])
  })
})
