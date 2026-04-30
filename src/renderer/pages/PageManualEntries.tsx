import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useManualEntry, useManualEntries } from '../lib/hooks'
import { ManualEntryForm } from '../components/manual-entries/ManualEntryForm'
import { ManualEntryList } from '../components/manual-entries/ManualEntryList'
import { EntityListPage } from '../components/layout/EntityListPage'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Pill } from '../components/ui/Pill'
import { useSubViewNavigation } from '../lib/use-route-navigation'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/query-keys'
import { formatKr } from '../lib/format'

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

function ViewEntry({
  id,
  fiscalYearId,
  onBack,
}: {
  id: number
  fiscalYearId: number
  onBack: () => void
}) {
  const { isReadOnly } = useFiscalYearContext()
  const { data: entries } = useManualEntries(fiscalYearId)
  const queryClient = useQueryClient()

  const entry = entries?.find((e) => e.id === id)

  const [canCorrect, setCanCorrect] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!entry?.journal_entry_id) return
    window.api
      .canCorrectJournalEntry({ journal_entry_id: entry.journal_entry_id })
      .then((result) => {
        if (result.success) setCanCorrect(result.data.canCorrect)
      })
  }, [entry?.journal_entry_id])

  const handleCorrect = useCallback(async () => {
    if (!entry?.journal_entry_id) return
    setIsSubmitting(true)
    try {
      const result = await window.api.correctJournalEntry({
        journal_entry_id: entry.journal_entry_id,
        fiscal_year_id: fiscalYearId,
      })
      if (result.success) {
        toast.success(
          `Korrigeringsverifikat C${result.data.correction_verification_number} skapat.`,
        )
        queryClient.invalidateQueries({
          queryKey: queryKeys.allManualEntries(),
        })
        onBack()
      } else {
        toast.error(result.error)
      }
    } finally {
      setIsSubmitting(false)
      setShowConfirm(false)
    }
  }, [entry?.journal_entry_id, fiscalYearId, queryClient, onBack])

  if (!entry) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Bokföringsorder hittades inte.
      </div>
    )
  }

  // Get journal entry lines for this entry
  const showCorrectionButton =
    !isReadOnly &&
    canCorrect &&
    entry.je_status === 'booked' &&
    entry.corrected_by_id === null &&
    entry.corrects_entry_id === null

  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-primary hover:underline"
      >
        &larr; Tillbaka till listan
      </button>

      <div className="mb-6 flex items-center gap-3">
        <h2 className="text-lg font-medium">
          Verifikat {entry.verification_series}
          {entry.verification_number}
        </h2>
        {entry.je_status === 'corrected' && (
          <Pill variant="danger">Korrigerad</Pill>
        )}
        {entry.corrects_entry_id != null && (
          <Pill variant="info">Korrigering</Pill>
        )}
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted-foreground">Datum</dt>
          <dd>{entry.entry_date}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Beskrivning</dt>
          <dd>{entry.description || '-'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Belopp</dt>
          <dd>{formatKr(entry.total_amount_ore)}</dd>
        </div>
      </dl>

      {showCorrectionButton && (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isSubmitting}
          className="rounded-md border border-warning-100 bg-warning-100/40 px-4 py-2 text-sm font-medium text-warning-700 hover:bg-warning-100/60 disabled:opacity-50"
        >
          Korrigera
        </button>
      )}

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Korrigera verifikat"
        description="En omvänd bokning skapas som nollställer detta verifikats effekt på alla berörda konton. Verifikatet markeras som korrigerat."
        confirmLabel="Korrigera"
        variant="warning"
        onConfirm={handleCorrect}
      />
    </div>
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
            onView={nav.goToView}
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
        view: (id, nav) => (
          <ViewEntry
            id={id}
            fiscalYearId={fiscalYearId!}
            onBack={nav.goToList}
          />
        ),
      }}
    />
  )
}
