import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import { useDebouncedSearch } from '../../lib/use-debounced-search'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import type { SubViewNavigation } from '../../lib/use-route-navigation'
import type { MasterDetailNavigation } from '../../lib/use-route-navigation'

// ── Master-detail types ─────────────────────────────────────────────

interface MasterDetailProps {
  variant: 'master-detail'
  title: string
  createLabel: string
  searchPlaceholder: string
  emptyStateMessage: string
  navigation: MasterDetailNavigation
  renderList: (props: {
    debouncedSearch: string
    selectedId: number | null
    onSelect: (id: number) => void
  }) => ReactNode
  renderDetail: (props: { id: number; onEdit: () => void }) => ReactNode
  renderForm: (props: {
    editId: number | null
    onClose: () => void
    onSaved: (id: number) => void
  }) => ReactNode
  extraFilters?: ReactNode
}

// ── Sub-view types ──────────────────────────────────────────────────

export interface SubViewNav {
  goToList: () => void
  goToCreate: () => void
  goToEdit: (id: number) => void
  goToView: (id: number) => void
}

interface SubViewProps {
  variant: 'sub-view'
  title: string
  createLabel: string
  createShortcut?: boolean
  createTitle?: string
  editTitle?: string
  navigation: SubViewNavigation
  subViews: {
    list: (nav: SubViewNav) => ReactNode
    create: (nav: SubViewNav) => ReactNode
    edit: (id: number, nav: SubViewNav) => ReactNode
    view?: (id: number, nav: SubViewNav) => ReactNode
  }
}

type EntityListPageProps = MasterDetailProps | SubViewProps

// ── Component ───────────────────────────────────────────────────────

export function EntityListPage(props: EntityListPageProps) {
  if (props.variant === 'master-detail') {
    return <MasterDetailLayout {...props} />
  }
  return <SubViewLayout {...props} />
}

// ── Master-detail layout ────────────────────────────────────────────

function MasterDetailLayout({
  title,
  createLabel,
  searchPlaceholder,
  emptyStateMessage,
  navigation,
  renderList,
  renderDetail,
  renderForm,
  extraFilters,
}: MasterDetailProps) {
  const { search, debouncedSearch, setSearch } = useDebouncedSearch()
  const { selectedId, mode, goToList, goToCreate, goToView, goToEdit } =
    navigation

  function handleSelect(id: number) {
    goToView(id)
  }

  function handleEdit() {
    if (selectedId !== null) goToEdit(selectedId)
  }

  function handleFormClose() {
    goToList()
  }

  function handleSaved(id: number) {
    goToView(id)
  }

  const showForm = mode === 'create' || mode === 'edit'

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left panel */}
      <div className="flex w-[300px] flex-col border-r">
        <PageHeader
          title={title}
          action={
            <button
              type="button"
              onClick={goToCreate}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + {createLabel}
            </button>
          }
        />
        {extraFilters}
        <div className="border-b px-4 py-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex-1 overflow-auto">
          {renderList({ debouncedSearch, selectedId, onSelect: handleSelect })}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {showForm ? (
          renderForm({
            editId: mode === 'edit' ? selectedId : null,
            onClose: handleFormClose,
            onSaved: handleSaved,
          })
        ) : selectedId !== null ? (
          renderDetail({ id: selectedId, onEdit: handleEdit })
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {emptyStateMessage}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-view layout ─────────────────────────────────────────────────

function SubViewLayout({
  title,
  createLabel,
  createShortcut = true,
  createTitle,
  editTitle,
  navigation,
  subViews,
}: SubViewProps) {
  const { isReadOnly } = useFiscalYearContext()
  const { currentView, entityId, goToList, goToCreate, goToEdit, goToView } =
    navigation

  const nav: SubViewNav = { goToList, goToCreate, goToEdit, goToView }

  useKeyboardShortcuts(
    createShortcut
      ? {
          'mod+n': () => {
            if (!isReadOnly && currentView === 'list') goToCreate()
          },
        }
      : {},
  )

  if (currentView === 'create') {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader
          title={createTitle ?? `Ny ${title.toLowerCase()}`}
          action={
            <button
              type="button"
              onClick={goToList}
              className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              &larr; Tillbaka
            </button>
          }
        />
        {subViews.create(nav)}
      </div>
    )
  }

  if (currentView === 'edit' && entityId !== undefined) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader
          title={editTitle ?? 'Redigera utkast'}
          action={
            <button
              type="button"
              onClick={goToList}
              className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              &larr; Tillbaka
            </button>
          }
        />
        {subViews.edit(entityId, nav)}
      </div>
    )
  }

  if (currentView === 'view' && entityId !== undefined && subViews.view) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        {subViews.view(entityId, nav)}
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader
        title={title}
        action={
          !isReadOnly ? (
            <button
              type="button"
              onClick={goToCreate}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + {createLabel}
            </button>
          ) : undefined
        }
      />
      {subViews.list(nav)}
    </div>
  )
}
