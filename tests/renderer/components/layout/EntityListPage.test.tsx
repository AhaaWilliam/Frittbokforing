// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { EntityListPage } from '../../../../src/renderer/components/layout/EntityListPage'
import type { SubViewNavigation, MasterDetailNavigation } from '../../../../src/renderer/lib/use-route-navigation'

// ── Stub components for render props ─────────────────────────────────
const StubList = () => <div data-testid="list">List content</div>
const StubDetail = ({ id }: { id: number }) => <div data-testid="detail">Detail {id}</div>
const StubForm = () => <div data-testid="form">Form content</div>

function makeSubViewNav(overrides?: Partial<SubViewNavigation>): SubViewNavigation {
  return {
    currentView: 'list',
    entityId: undefined,
    goToList: vi.fn(),
    goToCreate: vi.fn(),
    goToEdit: vi.fn(),
    goToView: vi.fn(),
    ...overrides,
  }
}

function makeMasterDetailNav(overrides?: Partial<MasterDetailNavigation>): MasterDetailNavigation {
  return {
    selectedId: null,
    mode: null,
    goToList: vi.fn(),
    goToCreate: vi.fn(),
    goToView: vi.fn(),
    goToEdit: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  setupMockIpc()
})

describe('EntityListPage — sub-view', () => {
  it('list view renders title and list content', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Kostnader"
        createLabel="Ny kostnad"
        navigation={makeSubViewNav({ currentView: 'list' })}
        subViews={{
          list: () => <StubList />,
          create: () => <StubForm />,
          edit: () => <StubForm />,
        }}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByText('Kostnader')).toBeInTheDocument()
    })
    expect(screen.getByTestId('list')).toBeInTheDocument()
  })

  it('create view renders form and back button', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Kostnader"
        createLabel="Ny kostnad"
        navigation={makeSubViewNav({ currentView: 'create' })}
        subViews={{
          list: () => <StubList />,
          create: () => <StubForm />,
          edit: () => <StubForm />,
        }}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByTestId('form')).toBeInTheDocument()
    })
    expect(screen.getByText(/Tillbaka/)).toBeInTheDocument()
  })

  it('edit view renders form with entity id', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Kostnader"
        createLabel="Ny kostnad"
        navigation={makeSubViewNav({ currentView: 'edit', entityId: 42 })}
        subViews={{
          list: () => <StubList />,
          create: () => <StubForm />,
          edit: (id) => <div data-testid="edit-form">Edit {id}</div>,
        }}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByTestId('edit-form')).toBeInTheDocument()
    })
    expect(screen.getByText('Edit 42')).toBeInTheDocument()
  })

  it('isReadOnly hides create button', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Kostnader"
        createLabel="Ny kostnad"
        navigation={makeSubViewNav({ currentView: 'list' })}
        subViews={{
          list: () => <StubList />,
          create: () => <StubForm />,
          edit: () => <StubForm />,
        }}
      />,
      {
        fiscalYear: { id: 1, label: '2026', is_closed: 1 },
        axeCheck: false,
      },
    )

    await waitFor(() => {
      expect(screen.getByText('Kostnader')).toBeInTheDocument()
    })
    expect(screen.queryByText('+ Ny kostnad')).toBeNull()
  })

  it('view subView renders when provided', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Kostnader"
        createLabel="Ny kostnad"
        navigation={makeSubViewNav({ currentView: 'view', entityId: 7 })}
        subViews={{
          list: () => <StubList />,
          create: () => <StubForm />,
          edit: () => <StubForm />,
          view: (id) => <div data-testid="view-detail">View {id}</div>,
        }}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByTestId('view-detail')).toBeInTheDocument()
    })
    expect(screen.getByText('View 7')).toBeInTheDocument()
  })

  it('passes axe a11y check (sub-view)', async () => {
    const { axeResults } = await renderWithProviders(
      <EntityListPage
        variant="sub-view"
        title="Fakturor"
        createLabel="Ny faktura"
        navigation={makeSubViewNav({ currentView: 'list' })}
        subViews={{
          list: () => <div>List</div>,
          create: () => <div>Create</div>,
          edit: () => <div>Edit</div>,
        }}
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})

describe('EntityListPage — master-detail', () => {
  it('renders left panel with list and empty state', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="master-detail"
        title="Kunder"
        createLabel="Ny kund"
        searchPlaceholder="Sök kunder..."
        emptyStateMessage="Välj en kund"
        navigation={makeMasterDetailNav()}
        renderList={() => <StubList />}
        renderDetail={({ id }) => <StubDetail id={id} />}
        renderForm={() => <StubForm />}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByText('Kunder')).toBeInTheDocument()
    })
    expect(screen.getByTestId('list')).toBeInTheDocument()
    expect(screen.getByText('Välj en kund')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Sök kunder...')).toBeInTheDocument()
  })

  it('view mode renders detail panel', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="master-detail"
        title="Kunder"
        createLabel="Ny kund"
        searchPlaceholder="Sök kunder..."
        emptyStateMessage="Välj en kund"
        navigation={makeMasterDetailNav({ selectedId: 5, mode: 'view' })}
        renderList={() => <StubList />}
        renderDetail={({ id }) => <StubDetail id={id} />}
        renderForm={() => <StubForm />}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByTestId('detail')).toBeInTheDocument()
    })
    expect(screen.getByText('Detail 5')).toBeInTheDocument()
  })

  it('create mode renders form panel', async () => {
    await renderWithProviders(
      <EntityListPage
        variant="master-detail"
        title="Kunder"
        createLabel="Ny kund"
        searchPlaceholder="Sök kunder..."
        emptyStateMessage="Välj en kund"
        navigation={makeMasterDetailNav({ mode: 'create' })}
        renderList={() => <StubList />}
        renderDetail={({ id }) => <StubDetail id={id} />}
        renderForm={() => <StubForm />}
      />,
      { axeCheck: false },
    )

    await waitFor(() => {
      expect(screen.getByTestId('form')).toBeInTheDocument()
    })
  })

  it('passes axe a11y check (master-detail)', async () => {
    const { axeResults } = await renderWithProviders(
      <EntityListPage
        variant="master-detail"
        title="Kunder"
        createLabel="Ny kund"
        searchPlaceholder="Sök kunder..."
        emptyStateMessage="Välj en kund"
        navigation={makeMasterDetailNav()}
        renderList={() => <div>List</div>}
        renderDetail={({ id }) => <div>Detail {id}</div>}
        renderForm={() => <div>Form</div>}
      />,
    )
    expect(axeResults?.violations).toEqual([])
  })
})
