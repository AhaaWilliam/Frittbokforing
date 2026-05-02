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
import { Inbox, Trash2, Archive, FileText, ImageIcon } from 'lucide-react'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'
import {
  useReceipts,
  useReceiptCounts,
  useCreateReceipt,
  useArchiveReceipt,
  useBulkArchiveReceipts,
  useDeleteReceipt,
} from '../lib/hooks'
import { Button } from '../components/ui/Button'
import { Callout } from '../components/ui/Callout'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { PageHeader } from '../components/layout/PageHeader'
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

  const { data: receipts = [], isLoading } = useReceipts({ status: tab })
  const { data: counts } = useReceiptCounts()
  const createMutation = useCreateReceipt()
  const archiveMutation = useArchiveReceipt()
  const bulkArchiveMutation = useBulkArchiveReceipts()
  const deleteMutation = useDeleteReceipt()

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

  async function handleDelete(id: number) {
    if (!confirm('Radera kvittot permanent? Filen tas bort från disk.')) return
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

        {/* Tabs */}
        <div
          className="mb-4 flex gap-1 border-b border-[var(--border-default)]"
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
          />
        )}
      </div>
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
}

function ReceiptTable({
  receipts,
  selectedIds,
  allSelected,
  onToggleAll,
  onToggleOne,
  onArchive,
  onDelete,
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
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onArchive(r.id)}
                    title="Arkivera"
                    data-testid={`inbox-row-archive-${r.id}`}
                  >
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
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
