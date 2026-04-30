// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { PageHeader } from '../../../../src/renderer/components/layout/PageHeader'

beforeEach(() => {
  setupMockIpc()
})

describe('PageHeader', () => {
  it('rendrar titel som h1 med font-serif', async () => {
    await renderWithProviders(<PageHeader title="Kunder" />)
    const heading = screen.getByRole('heading', { level: 1, name: 'Kunder' })
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveClass('font-serif')
  })

  it('rendrar action när FY är öppen', async () => {
    await renderWithProviders(
      <PageHeader title="x" action={<button>Skapa ny</button>} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skapa ny' })).toBeInTheDocument()
    })
  })

  it('döljer action när FY är stängd (read-only)', async () => {
    await renderWithProviders(
      <PageHeader title="x" action={<button>Skapa ny</button>} />,
      { fiscalYear: { id: 1, label: '2026', is_closed: 1 } },
    )
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Skapa ny' })).not.toBeInTheDocument()
    })
  })

  it('rendrar utan action utan fel', async () => {
    await renderWithProviders(<PageHeader title="Endast titel" />)
    expect(
      screen.getByRole('heading', { name: 'Endast titel' }),
    ).toBeInTheDocument()
  })
})
