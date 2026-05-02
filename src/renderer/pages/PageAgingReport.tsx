import { useState } from 'react'
import { Printer } from 'lucide-react'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useAgingReceivables, useAgingPayables } from '../lib/hooks'
import { PageHeader } from '../components/layout/PageHeader'
import type {
  AgingReport,
  AgingBucket,
  AgingItem,
} from '../../main/services/aging-service'

function formatKr(ore: number): string {
  return (ore / 100).toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function BucketTable({ bucket }: { bucket: AgingBucket }) {
  if (bucket.items.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-semibold">
        {bucket.label}{' '}
        <span className="font-normal text-muted-foreground">
          ({bucket.items.length} st, {formatKr(bucket.totalRemainingOre)} kr)
        </span>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3">Nr</th>
            <th className="py-1 pr-3">Motpart</th>
            <th className="py-1 pr-3 text-right">Belopp</th>
            <th className="py-1 pr-3 text-right">Betalt</th>
            <th className="py-1 pr-3 text-right">Kvar</th>
            <th className="py-1 pr-3">Förfallodag</th>
            <th className="py-1 text-right">Dagar</th>
          </tr>
        </thead>
        <tbody>
          {bucket.items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-1.5 pr-3">{item.identifier}</td>
              <td className="py-1.5 pr-3">{item.counterpartyName}</td>
              <td className="py-1.5 pr-3 text-right">
                {formatKr(item.totalAmountOre)}
              </td>
              <td className="py-1.5 pr-3 text-right">
                {formatKr(item.paidAmountOre)}
              </td>
              <td className="py-1.5 pr-3 text-right font-medium">
                {formatKr(item.remainingOre)}
              </td>
              <td className="py-1.5 pr-3">{item.dueDate}</td>
              <td className="py-1.5 text-right">{item.daysOverdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NoDueDateTable({ items }: { items: AgingItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="mb-1 text-sm font-semibold">
        Inget förfallodatum{' '}
        <span className="font-normal text-muted-foreground">
          ({items.length} st)
        </span>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-1 pr-3">Nr</th>
            <th className="py-1 pr-3">Motpart</th>
            <th className="py-1 pr-3 text-right">Belopp</th>
            <th className="py-1 pr-3 text-right">Betalt</th>
            <th className="py-1 text-right">Kvar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="py-1.5 pr-3">{item.identifier}</td>
              <td className="py-1.5 pr-3">{item.counterpartyName}</td>
              <td className="py-1.5 pr-3 text-right">
                {formatKr(item.totalAmountOre)}
              </td>
              <td className="py-1.5 pr-3 text-right">
                {formatKr(item.paidAmountOre)}
              </td>
              <td className="py-1.5 text-right font-medium">
                {formatKr(item.remainingOre)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AgingReportView({ report }: { report: AgingReport }) {
  const hasBucketItems = report.buckets.some((b) => b.items.length > 0)
  const hasNoDueDate = (report.itemsWithoutDueDate?.length ?? 0) > 0

  if (!hasBucketItems && !hasNoDueDate) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Inga utestående poster.
      </div>
    )
  }

  return (
    <div>
      {report.buckets.map((bucket) => (
        <BucketTable key={bucket.label} bucket={bucket} />
      ))}
      {report.itemsWithoutDueDate && (
        <NoDueDateTable items={report.itemsWithoutDueDate} />
      )}
      <div className="mt-4 border-t pt-3 text-sm font-semibold">
        Totalt utestående: {formatKr(report.totalRemainingOre)} kr
      </div>
    </div>
  )
}

export function PageAgingReport() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [activeTab, setActiveTab] = useState<'receivables' | 'payables'>(
    'receivables',
  )

  const { data: receivables } = useAgingReceivables(activeFiscalYear?.id)
  const { data: payables } = useAgingPayables(activeFiscalYear?.id)

  const currentReport = activeTab === 'receivables' ? receivables : payables

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader
        title="Åldersanalys"
        action={
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted print:hidden"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Skriv ut
          </button>
        }
      />

      <div className="px-6 pb-6">
        {/* Tabs */}
        <div className="mb-4 flex gap-1 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('receivables')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === 'receivables'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Kundfordringar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payables')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              activeTab === 'payables'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Leverantörsskulder
          </button>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          Per datum: {currentReport?.asOfDate ?? '–'}. Visar utestående
          fakturor/skulder — retroaktivt betalda poster exkluderas.
        </p>

        {currentReport ? (
          <AgingReportView report={currentReport} />
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Laddar...
          </div>
        )}
      </div>
    </div>
  )
}
