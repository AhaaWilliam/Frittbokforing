// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { WorkspaceLayout } from '../../../../src/renderer/modes/bokforare/WorkspaceLayout'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

describe('WorkspaceLayout', () => {
  it('renders centerZone (required)', () => {
    render(
      <WorkspaceLayout pageName="test" centerZone={<p>Center content</p>} />,
    )
    expect(screen.getByText('Center content')).toBeInTheDocument()
  })

  it('renders leftZone when provided', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        leftZone={<p>Inkorg</p>}
        centerZone={<p>Center</p>}
      />,
    )
    expect(screen.getByText('Inkorg')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-left')).toBeInTheDocument()
  })

  it('omits leftZone aside when not provided', () => {
    render(<WorkspaceLayout pageName="test" centerZone={<p>Center</p>} />)
    expect(screen.queryByTestId('workspace-left')).not.toBeInTheDocument()
  })

  it('renders rightZone when provided', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        centerZone={<p>Center</p>}
        rightZone={<p>Konsekvens</p>}
      />,
    )
    expect(screen.getByText('Konsekvens')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-right')).toBeInTheDocument()
  })

  it('degrades gracefully without rightZone', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        leftZone={<p>L</p>}
        centerZone={<p>C</p>}
      />,
    )
    expect(screen.queryByTestId('workspace-right')).not.toBeInTheDocument()
    // Center and left still present
    expect(screen.getByTestId('workspace-center')).toBeInTheDocument()
    expect(screen.getByTestId('workspace-left')).toBeInTheDocument()
  })

  it('renders header when provided', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        header={<h1>Verifikat A12</h1>}
        centerZone={<p>x</p>}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'Verifikat A12' }),
    ).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        footer={<button type="button">Bokför</button>}
        centerZone={<p>x</p>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Bokför' })).toBeInTheDocument()
  })

  it('uses semantic landmarks', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        leftZone={<p>L</p>}
        centerZone={<p>C</p>}
        rightZone={<p>R</p>}
        header={<p>H</p>}
        footer={<p>F</p>}
      />,
    )
    // <main>, <header>, <footer>, two <aside> with aria-labels
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument() // header
    expect(screen.getByRole('contentinfo')).toBeInTheDocument() // footer
    const asides = screen.getAllByRole('complementary')
    expect(asides).toHaveLength(2)
  })

  it('aside aria-labels are descriptive', () => {
    render(
      <WorkspaceLayout
        pageName="test"
        leftZone={<p>L</p>}
        centerZone={<p>C</p>}
        rightZone={<p>R</p>}
      />,
    )
    expect(
      screen.getByRole('complementary', { name: 'Inkorg' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Konsekvens' }),
    ).toBeInTheDocument()
  })

  it('main has descriptive aria-label', () => {
    render(<WorkspaceLayout pageName="test" centerZone={<p>x</p>} />)
    expect(screen.getByRole('main', { name: 'Arbetsyta' })).toBeInTheDocument()
  })

  it('sets data-page and data-testid from pageName', () => {
    const { container } = render(
      <WorkspaceLayout pageName="verifikat-detail" centerZone={<p>x</p>} />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.getAttribute('data-page')).toBe('verifikat-detail')
    expect(root.getAttribute('data-testid')).toBe('page-verifikat-detail')
  })

  it('passes className through', () => {
    const { container } = render(
      <WorkspaceLayout
        pageName="test"
        className="custom-x"
        centerZone={<p>x</p>}
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('custom-x')
  })

  it('passes axe a11y check (full layout)', async () => {
    const { container } = render(
      <WorkspaceLayout
        pageName="test"
        header={<h1>Page header</h1>}
        leftZone={
          <nav>
            <ul>
              <li>
                <a href="#a">Item A</a>
              </li>
              <li>
                <a href="#b">Item B</a>
              </li>
            </ul>
          </nav>
        }
        centerZone={
          <form>
            <label htmlFor="x">Name</label>
            <input id="x" type="text" />
          </form>
        }
        rightZone={<p>Status: balanced</p>}
        footer={<button type="button">Save</button>}
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })

  it('passes axe a11y check (minimal — center only)', async () => {
    const { container } = render(
      <WorkspaceLayout pageName="test" centerZone={<p>Hello</p>} />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
