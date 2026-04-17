// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { Pagination } from '../../../../src/renderer/components/ui/Pagination'

beforeEach(() => {
  setupMockIpc()
})

describe('Pagination (S57 C2a)', () => {
  it('renderar "Visar X–Y av Z {label}" korrekt i mitten', async () => {
    await renderWithProviders(
      <Pagination
        page={1}
        pageSize={50}
        totalItems={127}
        label="fakturor"
        testIdPrefix="pag-test"
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pag-test-summary').textContent).toBe(
      'Visar 51–100 av 127 fakturor',
    )
    expect(screen.getByTestId('pag-test-position').textContent).toBe('Sida 2 / 3')
  })

  it('prev disabled vid page=0, next disabled vid sista sidan', async () => {
    const { unmount } = await renderWithProviders(
      <Pagination
        page={0}
        pageSize={50}
        totalItems={100}
        testIdPrefix="pag-a"
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pag-a-prev')).toBeDisabled()
    expect(screen.getByTestId('pag-a-next')).not.toBeDisabled()
    unmount()

    await renderWithProviders(
      <Pagination
        page={1}
        pageSize={50}
        totalItems={100}
        testIdPrefix="pag-b"
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pag-b-prev')).not.toBeDisabled()
    expect(screen.getByTestId('pag-b-next')).toBeDisabled()
  })

  it('tom lista → "Visar 0–0 av 0", båda knappar disabled', async () => {
    await renderWithProviders(
      <Pagination
        page={0}
        pageSize={50}
        totalItems={0}
        label="fakturor"
        testIdPrefix="pag-empty"
        onPageChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('pag-empty-summary').textContent).toBe(
      'Visar 0–0 av 0 fakturor',
    )
    expect(screen.getByTestId('pag-empty-prev')).toBeDisabled()
    expect(screen.getByTestId('pag-empty-next')).toBeDisabled()
  })

  it('klick på nästa anropar onPageChange(page+1)', async () => {
    const onPageChange = vi.fn()
    await renderWithProviders(
      <Pagination
        page={0}
        pageSize={50}
        totalItems={200}
        testIdPrefix="pag-c"
        onPageChange={onPageChange}
      />,
    )
    await userEvent.click(screen.getByTestId('pag-c-next'))
    expect(onPageChange).toHaveBeenCalledWith(1)
  })
})
