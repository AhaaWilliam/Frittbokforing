/**
 * PageInbox — Inkorgen (Sprint VS-110).
 *
 * Kvitto-kö före bokföring. Användaren släpper PDF/bild i drop-zone,
 * raden hamnar i status='inbox'. Tre flikar: Inkorgen / Bokförda /
 * Arkiverade. Bulk-actions (markera flera, arkivera).
 *
 * Bokföring från inkorgen sker via "Bokför"-knappen på raden — öppnar
 * Vardag-sheet (om aktivt mode) eller bokförare-formulär. Den länkningen
 * implementeras i VS-111. För VS-110 fokus: upload, lista, arkivera.
 */
import { useMemo, useState } from 'react'
import {
  Inbox,
  Trash2,
  Archive,
  FileText,
  ImageIcon,
  Send,
  Download,
  StickyNote,
  Eye,
} from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'
import {
  useReceipts,
  useReceiptCounts,
  useCreateReceipt,
  useArchiveReceipt,
  useBulkArchiveReceipts,
  useDeleteReceipt,
  useExportReceiptsCsv,
  useExportReceiptsZipBundle,
  useUpdateReceiptNotes,
} from '../lib/hooks'
import { Button } from '../components/ui/Button'
import { Callout } from '../components/ui/Callout'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { PageHeader } from '../components/layout/PageHeader'
import { BokforKostnadSheet } from '../modes/vardag/BokforKostnadSheet'
import { ReceiptPreviewPane } from '../components/receipts/ReceiptPreviewPane'
import { toast } from 'sonner'
import type { Receipt, ReceiptStatus } from '../../shared/types'

const TAB_LABEL: Record<ReceiptStatus, string> = {
  inbox: 'Inkorgen',
  booked: 'Bokförda',
  archived: 'Arkiverade',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('sv-SE') +
    ' ' +
    d.toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  )
}

function ReceiptIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith('image/'))
    return <ImageIcon className="h-4 w-4" aria-hidden="true" />
  return <FileText className="h-4 w-4" aria-hidden="true" />
}

export function PageInbox() {
  const { activeCompany } = useActiveCompany()
  const [tab, setTab] = useState<ReceiptStatus>('inbox')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [bokforReceipt, setBokforReceipt] = useState<Receipt | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  // VS-126: notes-editor dialog
  const [notesTarget, setNotesTarget] = useState<Receipt | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  // VS-143: inline-preview-modal för kvitto-rad.
  const [previewTarget, setPreviewTarget] = useState<Receipt | null>(null)

  const { data: receipts = [], isLoading } = useReceipts({ status: tab })
  const { data: counts } = useReceiptCounts()
  const createMutation = useCreateReceipt()
  const archiveMutation = useArchiveReceipt()
  const bulkArchiveMutation = useBulkArchiveReceipts()
  const deleteMutation = useDeleteReceipt()
  const exportCsvMutation = useExportReceiptsCsv()
  const exportZipBundleMutation = useExportReceiptsZipBundle()
  const updateNotesMutation = useUpdateReceiptNotes()

  function openNotesEditor(r: Receipt) {
    setNotesTarget(r)
    setNotesDraft(r.notes ?? '')
  }

  async function saveNotes() {
    if (!notesTarget) return
    const id = notesTarget.id
    const trimmed = notesDraft.trim()
    setNotesTarget(null)
    try {
      await updateNotesMutation.mutateAsync({
        id,
        notes: trimmed.length > 0 ? trimmed : null,
      })
      toast.success('Anteckning sparad')
    } catch (err) {
      toast.error(extractErrorMessage(err))
    }
  }

  async function handleExportCsv() {
    try {
      const r = await exportCsvMutation.mutateAsync()
      if (r.cancelled) return
      toast.success(`Kvittolista exporterad till ${r.filePath}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export misslyckades')
    }
  }

  // VS-141: ZIP-bundle (CSV + alla fysiska kvittofiler), BFL 7 kap.
  async function handleExportZipBundle() {
    try {
      const r = await exportZipBundleMutation.mutateAsync()
      if (r.cancelled) return
      toast.success(`Kvittoarkiv exporterat till ${r.filePath}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export misslyckades')
    }
  }

  const selectableIds = useMemo(
    () => receipts.filter((r) => r.status !== 'booked').map((r) => r.id),
    [receipts],
  )
  const allSelected =
    selectableIds.length > 0 && selectedIds.size === selectableIds.length

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(selectableIds))
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function extractPath(file: File): string | null {
    if (typeof window.api?.getPathForFile === 'function') {
      const p = window.api.getPathForFile(file)
      if (p) return p
    }
    const f = file as File & { path?: string }
    return typeof f.path === 'string' && f.path.length > 0 ? f.path : null
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!activeCompany) return
    setUploading(true)
    let success = 0
    let dup = 0
    let failed = 0
    for (const file of Array.from(files)) {
      const sourcePath = extractPath(file)
      if (!sourcePath) {
        failed++
        continue
      }
      try {
        await createMutation.mutateAsync({
          source_path: sourcePath,
          original_filename: file.name,
        })
        success++
      } catch (err: unknown) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code?: string }).code
            : undefined
        if (code === 'RECEIPT_DUPLICATE_HASH') dup++
        else failed++
      }
    }
    setUploading(false)
    if (success > 0) toast.success(`${success} kvitto laddades upp`)
    if (dup > 0) toast.warning(`${dup} dubblett(er) hoppades över`)
    if (failed > 0) toast.error(`${failed} fil(er) kunde inte laddas upp`)
  }

  async function handlePickFiles() {
    const r = await window.api.selectReceiptFile()
    if (!r.success || !r.data || !r.data.filePath) return
    // selectReceiptFile returnerar en fil. Vi har ingen multi-select-dialog
    // än — användaren får dra in flera filer istället för att klicka.
    const fakeFile = {
      name: r.data.filePath.split('/').pop() ?? 'kvitto',
    } as File
    Object.defineProperty(fakeFile, 'path', { value: r.data.filePath })
    await uploadFiles([fakeFile])
  }

  async function handleArchiveOne(id: number) {
    try {
      await archiveMutation.mutateAsync({ id })
      toast.success('Kvitto arkiverat')
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err))
    }
  }

  async function handleBulkArchive() {
    if (selectedIds.size === 0) return
    try {
      const data = await bulkArchiveMutation.mutateAsync({
        ids: Array.from(selectedIds),
      })
      if (data.succeeded.length > 0)
        toast.success(`${data.succeeded.length} kvitto arkiverade`)
      if (data.failed.length > 0)
        toast.error(`${data.failed.length} kunde inte arkiveras`)
      setSelectedIds(new Set())
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err))
    }
  }

  function handleDelete(id: number) {
    // VS-124: Radix AlertDialog ersätter native confirm() (M156).
    setPendingDeleteId(id)
  }

  async function performDelete() {
    if (pendingDeleteId === null) return
    const id = pendingDeleteId
    setPendingDeleteId(null)
    try {
      await deleteMutation.mutateAsync({ id })
      toast.success('Kvitto raderat')
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err))
    }
  }

  function extractErrorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message)
    }
    return 'Något gick fel'
  }

  if (!activeCompany) {
    return (
      <div className="p-8">
        <Callout variant="info">Välj ett bolag för att se inkorgen.</Callout>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Inkorgen" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Drop-zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            if (!dragActive) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files.length > 0)
              uploadFiles(e.dataTransfer.files)
          }}
          className={`mb-6 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
            dragActive
              ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/10'
              : 'border-[var(--border-strong)] bg-[var(--surface-secondary)]/40'
          }`}
          data-testid="inbox-dropzone"
        >
          <Inbox
            className="mb-3 h-10 w-10 text-[var(--text-faint)]"
            aria-hidden="true"
          />
          <p className="font-serif text-lg">Släpp kvitton här</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            PDF, PNG, JPG, HEIC eller WebP — flera filer i taget
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePickFiles}
            isLoading={uploading}
            className="mt-4"
            data-testid="inbox-pick-file"
          >
            …eller välj fil
          </Button>
        </div>

        {/* Tabs + export */}
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-default)]">
          <div
            className="flex gap-1"
            role="tablist"
            aria-label="Filtrera kvitton"
          >
            {(['inbox', 'booked', 'archived'] as ReceiptStatus[]).map((t) => {
              const count = counts?.[t] ?? 0
              const isActive = tab === t
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setTab(t)
                    setSelectedIds(new Set())
                  }}
                  className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? 'border-[var(--color-primary)] font-medium text-[var(--text-primary)]'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  data-testid={`inbox-tab-${t}`}
                >
                  {TAB_LABEL[t]}{' '}
                  <span className="ml-1 text-[var(--text-faint)]">{count}</span>
                </button>
              )
            })}
          </div>
          {/* VS-123/VS-141: CSV och ZIP-export (BFL 7 kap arkivkrav). */}
          <div className="mb-2 flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              isLoading={exportCsvMutation.isPending}
              data-testid="inbox-export-csv"
            >
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Exportera CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportZipBundle}
              isLoading={exportZipBundleMutation.isPending}
              data-testid="inbox-export-zip-bundle"
            >
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Exportera ZIP
            </Button>
          </div>
        </div>

        {/* Bulk-toolbar */}
        {selectedIds.size > 0 && (
          <div
            id="bulk-actions"
            className="mb-3 flex items-center gap-3 rounded-md bg-[var(--surface-secondary)] px-3 py-2"
          >
            <span className="text-sm">{selectedIds.size} markerade</span>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Archive className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={handleBulkArchive}
              isLoading={bulkArchiveMutation.isPending}
              data-testid="inbox-bulk-archive"
            >
              Arkivera markerade
            </Button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-[var(--text-faint)] underline hover:text-[var(--text-primary)]"
            >
              Avmarkera alla
            </button>
          </div>
        )}

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : receipts.length === 0 ? (
          <Callout variant="info">
            {tab === 'inbox'
              ? 'Inga kvitton i inkorgen. Släpp filer ovan eller välj manuellt.'
              : tab === 'booked'
                ? 'Inga bokförda kvitton än.'
                : 'Inga arkiverade kvitton.'}
          </Callout>
        ) : (
          <ReceiptTable
            receipts={receipts}
            selectedIds={selectedIds}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            onToggleOne={toggleOne}
            onArchive={handleArchiveOne}
            onDelete={handleDelete}
            onBokfor={(r) => setBokforReceipt(r)}
            onEditNotes={openNotesEditor}
            onPreview={(r) => setPreviewTarget(r)}
          />
        )}
      </div>
      <BokforKostnadSheet
        open={bokforReceipt !== null}
        onClose={() => setBokforReceipt(null)}
        prefilledReceipt={
          bokforReceipt
            ? {
                receipt_id: bokforReceipt.id,
                file_path: bokforReceipt.file_path,
                original_filename: bokforReceipt.original_filename,
              }
            : undefined
        }
      />
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null)
        }}
        title="Radera kvitto?"
        description="Kvittot raderas permanent och filen tas bort från disk. Detta går inte att ångra."
        confirmLabel="Radera"
        variant="danger"
        onConfirm={performDelete}
      />
      <Dialog.Root
        open={notesTarget !== null}
        onOpenChange={(o) => {
          if (!o) setNotesTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-elevated)] p-6 shadow-xl focus:outline-none"
            data-testid="receipt-notes-dialog"
          >
            <Dialog.Title className="font-serif text-lg">
              Anteckning
            </Dialog.Title>
            <Dialog.Description className="mt-0.5 text-sm text-[var(--text-secondary)]">
              {notesTarget?.original_filename}
            </Dialog.Description>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              maxLength={500}
              rows={5}
              className="mt-4 w-full rounded-md border border-input bg-background p-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Frivillig anteckning (max 500 tecken)…"
              data-testid="receipt-notes-textarea"
            />
            <div className="mt-1 text-right text-xs text-[var(--text-faint)]">
              {notesDraft.length}/500
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNotesTarget(null)}>
                Avbryt
              </Button>
              <Button
                variant="primary"
                onClick={saveNotes}
                isLoading={updateNotesMutation.isPending}
                data-testid="receipt-notes-save"
              >
                Spara
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={previewTarget !== null}
        onOpenChange={(o) => {
          if (!o) setPreviewTarget(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-[90vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg bg-[var(--surface-elevated)] p-4 shadow-xl focus:outline-none"
            data-testid="receipt-preview-dialog"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-serif text-lg">
                  Förhandsgranska kvitto
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {previewTarget?.original_filename}
                </Dialog.Description>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPreviewTarget(null)}
              >
                Stäng
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              <ReceiptPreviewPane
                receiptPath={previewTarget?.file_path ?? null}
              />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}

interface ReceiptTableProps {
  receipts: Receipt[]
  selectedIds: Set<number>
  allSelected: boolean
  onToggleAll: () => void
  onToggleOne: (id: number) => void
  onArchive: (id: number) => void
  onDelete: (id: number) => void
  onBokfor: (r: Receipt) => void
  onEditNotes: (r: Receipt) => void
  onPreview: (r: Receipt) => void
}

function ReceiptTable({
  receipts,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleOne,
  onArchive,
  onDelete,
  onBokfor,
  onEditNotes,
  onPreview,
}: ReceiptTableProps) {
  return (
    <table className="w-full text-sm" data-testid="inbox-list">
      <thead>
        <tr className="border-b border-[var(--border-default)] text-left text-xs uppercase tracking-wide text-[var(--text-faint)]">
          <th className="w-10 py-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={onToggleAll}
              aria-label="Markera alla"
            />
          </th>
          <th className="py-2">Filnamn</th>
          <th className="py-2">Storlek</th>
          <th className="py-2">Uppladdad</th>
          <th className="w-32 py-2 text-right">Åtgärder</th>
        </tr>
      </thead>
      <tbody>
        {receipts.map((r) => {
          const isBooked = r.status === 'booked'
          return (
            <tr
              key={r.id}
              className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)]/40"
            >
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => onToggleOne(r.id)}
                  disabled={isBooked}
                  aria-label={`Markera ${r.original_filename}`}
                />
              </td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <ReceiptIcon mimeType={r.mime_type} />
                  <span className="truncate" title={r.original_filename}>
                    {r.original_filename}
                  </span>
                </div>
              </td>
              <td className="py-2 text-[var(--text-secondary)]">
                {formatBytes(r.file_size_bytes)}
              </td>
              <td className="py-2 text-[var(--text-secondary)]">
                {formatDate(r.uploaded_at)}
              </td>
              <td className="py-2 text-right">
                {!isBooked && r.status === 'inbox' && (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onBokfor(r)}
                      leftIcon={
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                      }
                      data-testid={`inbox-row-bokfor-${r.id}`}
                    >
                      Bokför
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onArchive(r.id)}
                      title="Arkivera"
                      data-testid={`inbox-row-archive-${r.id}`}
                    >
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreview(r)}
                  title="Förhandsgranska"
                  data-testid={`inbox-row-preview-${r.id}`}
                  aria-label={`Förhandsgranska ${r.original_filename}`}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onEditNotes(r)}
                  title={
                    r.notes ? `Anteckning: ${r.notes}` : 'Lägg till anteckning'
                  }
                  data-testid={`inbox-row-notes-${r.id}`}
                  aria-label={
                    r.notes
                      ? `Redigera anteckning för ${r.original_filename}`
                      : `Lägg till anteckning för ${r.original_filename}`
                  }
                >
                  <StickyNote
                    className={`h-3.5 w-3.5 ${
                      r.notes ? 'text-[var(--color-warning-600)]' : ''
                    }`}
                    aria-hidden="true"
                  />
                </Button>
                {!isBooked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(r.id)}
                    title="Radera"
                    data-testid={`inbox-row-delete-${r.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
