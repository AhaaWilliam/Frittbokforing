import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { Callout } from '../components/ui/Callout'
import { useVatReport } from '../lib/hooks'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'
import { formatKr } from '../lib/format'
import { formatFiscalYearLabel } from '../components/layout/YearPicker'
import type { VatQuarterReport, VatReport } from '../../shared/types'

function Cell({
  ore,
  hasData,
  bold,
  muted,
  colorNet,
}: {
  ore: number
  hasData: boolean
  bold?: boolean
  muted?: boolean
  colorNet?: boolean
}) {
  if (!hasData) {
    return (
      <td className="px-3 py-2 text-right text-muted-foreground">{'\u2013'}</td>
    )
  }

  let colorClass = ''
  if (colorNet) {
    if (ore > 0) colorClass = 'text-danger-600'
    else if (ore < 0) colorClass = 'text-success-600'
  }

  return (
    <td
      className={`px-3 py-2 text-right tabular-nums ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''} ${colorClass}`}
    >
      {formatKr(ore)}
    </td>
  )
}

interface RowProps {
  label: string
  field: keyof VatQuarterReport
  quarters: VatQuarterReport[]
  yearTotal: VatQuarterReport
  bold?: boolean
  muted?: boolean
  indent?: boolean
  colorNet?: boolean
}

function ReportRow({
  label,
  field,
  quarters,
  yearTotal,
  bold,
  muted,
  indent,
  colorNet,
}: RowProps) {
  return (
    <tr className={bold ? 'bg-muted/30' : ''}>
      <td
        className={`px-4 py-2 text-sm ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''} ${indent ? 'pl-8' : ''}`}
      >
        {label}
      </td>
      {quarters.map((q) => (
        <Cell
          key={q.quarterIndex}
          ore={q[field] as number}
          hasData={q.hasData}
          bold={bold}
          muted={muted}
          colorNet={colorNet}
        />
      ))}
      <Cell
        ore={yearTotal[field] as number}
        hasData={yearTotal.hasData}
        bold={bold}
        muted={muted}
        colorNet={colorNet}
      />
    </tr>
  )
}

function oreToKrFlat(ore: number): string {
  // Helår-summa som heltal (SKV accepterar heltal kronor i e-tjänsten)
  return Math.round(ore / 100).toString()
}

function formatReportForClipboard(report: VatReport): string {
  const y = report.yearTotal
  const lines = [
    'Momsdeklaration — sammanställning (helår)',
    '',
    'Momspliktig försäljning (underlag):',
    `  Rad 05  25 %:             ${oreToKrFlat(y.taxableBase25Ore)} kr`,
    `  Rad 06  12 %:             ${oreToKrFlat(y.taxableBase12Ore)} kr`,
    `  Rad 07   6 %:             ${oreToKrFlat(y.taxableBase6Ore)} kr`,
    '',
    'Utgående moms:',
    `  Rad 10  25 %:             ${oreToKrFlat(y.vatOut25Ore)} kr`,
    `  Rad 11  12 %:             ${oreToKrFlat(y.vatOut12Ore)} kr`,
    `  Rad 12   6 %:             ${oreToKrFlat(y.vatOut6Ore)} kr`,
    `  Summa utgående:           ${oreToKrFlat(y.vatOutTotalOre)} kr`,
    '',
    `Rad 48  Ingående moms:      ${oreToKrFlat(y.vatInOre)} kr`,
    '',
    `Rad 49  ${y.vatNetOre >= 0 ? 'Att betala:              ' : 'Att få tillbaka:         '}${oreToKrFlat(Math.abs(y.vatNetOre))} kr`,
    '',
    '---',
    'Avser inrikes transaktioner. Export/omvänd skattskyldighet ingår ej.',
    'Radnumreringen följer SKV:s Momsdeklaration (blankett SKV 4700).',
    'Verifiera alltid rad-nummer mot aktuell version i SKV e-tjänst.',
  ]
  return lines.join('\n')
}

export function PageVat() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { activeCompany } = useActiveCompany()
  const { data: report, isLoading, error } = useVatReport(activeFiscalYear?.id)
  const [copied, setCopied] = useState(false)

  const allEmpty = report && !report.quarters.some((q) => q.hasData)

  async function handleCopy() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(formatReportForClipboard(report))
      setCopied(true)
      toast.success('Momsdeklaration kopierad till urklipp')
      setTimeout(() => setCopied(false), 2500)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte kopiera till urklipp',
      )
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto print:overflow-visible">
      <div className="print:hidden">
        <PageHeader
          title="Momsrapport"
          action={
            report && !allEmpty ? (
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
                data-testid="vat-copy-clipboard"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-success-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? 'Kopierat' : 'Kopiera deklaration'}
              </button>
            ) : null
          }
        />
      </div>

      {/* Print-only header */}
      <div
        className="hidden print:block print:px-[15mm] print:pt-[15mm]"
        data-testid="vat-print-header"
      >
        <h1 className="text-lg font-semibold">Momsrapport</h1>
        {activeCompany && (
          <p className="text-sm">
            {activeCompany.name}
            {activeCompany.org_number ? ` · ${activeCompany.org_number}` : ''}
            {activeFiscalYear
              ? ` · ${formatFiscalYearLabel(activeFiscalYear)}`
              : ''}
          </p>
        )}
      </div>

      <div className="space-y-6 p-8 print:space-y-3 print:p-[15mm] print:text-[10pt]">
        <Callout variant="info" data-testid="vat-info" className="print:hidden">
          Visar utgående och ingående moms per kvartal baserat på bokförda
          verifikationer. Avser inrikes transaktioner — export och omvänd
          skattskyldighet stöds inte i denna version. Underlagen för 12% och 6%
          moms är approximationer (±1 öres avrundning). Rapporten visar moms
          aggregerad per kvartal som översikt. Din faktiska redovisningsperiod
          hos Skatteverket kan vara månadsvis eller årsvis. Använd "Kopiera
          deklaration" för att klistra in helårssumman i SKV e-tjänsten —
          verifiera alltid att box-nummer matchar aktuellt formulär.
        </Callout>

        {error && (
          <Callout variant="danger" data-testid="vat-error">
            Kunde inte generera momsrapport.
          </Callout>
        )}

        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Laddar...
          </div>
        )}

        {report && allEmpty && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Inga momstransaktioner har bokförts för detta räkenskapsår.
          </div>
        )}

        {report && !allEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3 text-left">Rad</th>
                  {report.quarters.map((q) => (
                    <th key={q.quarterIndex} className="px-3 py-3 text-right">
                      {q.quarterLabel}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold">
                    {report.yearTotal.quarterLabel}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <ReportRow
                  label="Utgående moms 25%"
                  field="vatOut25Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                />
                <ReportRow
                  label="Momspliktigt underlag 25%"
                  field="taxableBase25Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  muted
                  indent
                />
                <ReportRow
                  label="Utgående moms 12%"
                  field="vatOut12Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                />
                <ReportRow
                  label="Momspliktigt underlag 12%"
                  field="taxableBase12Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  muted
                  indent
                />
                <ReportRow
                  label="Utgående moms 6%"
                  field="vatOut6Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                />
                <ReportRow
                  label="Momspliktigt underlag 6%"
                  field="taxableBase6Ore"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  muted
                  indent
                />
                <ReportRow
                  label="Summa utgående moms"
                  field="vatOutTotalOre"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                />
                <tr>
                  <td
                    colSpan={6}
                    className="border-t-2 border-muted-foreground/20"
                  />
                </tr>
                <ReportRow
                  label="Ingående moms"
                  field="vatInOre"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                />
                <tr>
                  <td
                    colSpan={6}
                    className="border-t-2 border-muted-foreground/20"
                  />
                </tr>
                <ReportRow
                  label="Moms att betala (+) / fordran (\u2212)"
                  field="vatNetOre"
                  quarters={report.quarters}
                  yearTotal={report.yearTotal}
                  bold
                  colorNet
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
