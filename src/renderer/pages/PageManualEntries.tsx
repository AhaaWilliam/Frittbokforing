import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useManualEntry } from '../lib/hooks'
import { ManualEntryForm } from '../components/manual-entries/ManualEntryForm'
import { ManualEntryList } from '../components/manual-entries/ManualEntryList'
import { EntityListPage } from '../components/layout/EntityListPage'
import { useSubViewNavigation } from '../lib/use-route-navigation'

function EditView({
  id,
  fiscalYearId,
  onSave,
  onCancel,
}: {
  id: number
  fiscalYearId: number
  onSave: () => void
  onCancel: () => void
}) {
  const { data: entry, isLoading } = useManualEntry(id)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Laddar bokföringsorder...
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Bokföringsorder hittades inte.
      </div>
    )
  }

  return (
    <ManualEntryForm
      initialData={entry}
      fiscalYearId={fiscalYearId}
      onSave={onSave}
      onCancel={onCancel}
    />
  )
}

export function PageManualEntries() {
  const { activeFiscalYear } = useFiscalYearContext()
  const fiscalYearId = activeFiscalYear?.id
  const navigation = useSubViewNavigation('/manual-entries')

  return (
    <EntityListPage
      variant="sub-view"
      title="Bokföringsorder"
      createLabel="Ny bokföringsorder"
      navigation={navigation}
      subViews={{
        list: (nav) => (
          <ManualEntryList
            onCreate={nav.goToCreate}
            onEdit={nav.goToEdit}
          />
        ),
        create: (nav) => (
          <ManualEntryForm
            fiscalYearId={fiscalYearId!}
            onSave={nav.goToList}
            onCancel={nav.goToList}
          />
        ),
        edit: (id, nav) => (
          <EditView
            id={id}
            fiscalYearId={fiscalYearId!}
            onSave={nav.goToList}
            onCancel={nav.goToList}
          />
        ),
      }}
    />
  )
}
