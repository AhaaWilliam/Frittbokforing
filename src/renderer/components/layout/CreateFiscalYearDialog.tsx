import { useState, useEffect } from 'react'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useNetResult, useCreateNewFiscalYear } from '../../lib/hooks'
import { addOneDay, addMonthsMinusOneDay } from '../../../shared/date-utils'
import { Callout } from '../ui/Callout'

function formatKronor(ore: number): string {
  const kr = ore / 100
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(kr)
}

interface Props {
  open: boolean
  onClose: () => void
}

export function CreateFiscalYearDialog({ open, onClose }: Props) {
  const { activeFiscalYear, setActiveFiscalYear } = useFiscalYearContext()
  const [step, setStep] = useState(0)
  const [userChoseBook, setUserChoseBook] = useState(false)
  const [showSkipWarning, setShowSkipWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultData, setResultData] = useState<{
    accountCount: number
    startDate: string
    endDate: string
  } | null>(null)

  const { data: netResultData, isLoading: loadingNetResult } = useNetResult(
    open ? activeFiscalYear?.id : undefined,
  )
  const createMutation = useCreateNewFiscalYear()

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(0)
      setUserChoseBook(false)
      setShowSkipWarning(false)
      setError(null)
      setResultData(null)
    }
  }, [open])

  // Auto-advance from step 0 (loading) to step 1 (result disposition)
  useEffect(() => {
    if (step === 0 && netResultData && !loadingNetResult) {
      if (netResultData.isAlreadyBooked || netResultData.netResultOre === 0) {
        setStep(2) // Skip straight to confirmation
      } else {
        setStep(1) // Show result disposition
      }
    }
  }, [step, netResultData, loadingNetResult])

  if (!open || !activeFiscalYear) return null

  const prevEndDate = activeFiscalYear.end_date
  const newStartDate = addOneDay(prevEndDate)
  const newEndDate = addMonthsMinusOneDay(newStartDate, 12)

  async function handleBookAndContinue() {
    setUserChoseBook(true)
    setStep(2)
  }

  async function handleSkipBooking() {
    setShowSkipWarning(true)
  }

  async function handleCreate(confirmBookResult: boolean) {
    setError(null)
    try {
      const data = await createMutation.mutateAsync({
        confirmBookResult,
        netResultOre: netResultData?.netResultOre,
      })
      setResultData({
        accountCount: 0, // We don't have this info easily, approximate
        startDate: newStartDate,
        endDate: newEndDate,
      })
      // Switch to the new FY
      if (data?.fiscalYear) {
        setActiveFiscalYear(data.fiscalYear)
      }
      setStep(3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-fy-title"
        className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl"
      >
        <h2 id="create-fy-title" className="mb-4 text-lg font-semibold">
          Skapa nytt räkenskapsår
        </h2>

        {error && (
          <div className="mb-4">
            <Callout variant="danger" data-testid="create-fy-error">
              {error}
            </Callout>
          </div>
        )}

        {/* Step 0: Loading */}
        {step === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            Beräknar nettoresultat...
          </div>
        )}

        {/* Step 1: Result disposition */}
        {step === 1 && netResultData && (
          <div>
            <p className="mb-3 text-sm">
              Årets resultat:{' '}
              <span className="font-semibold">
                {formatKronor(netResultData.netResultOre)}
              </span>{' '}
              ({netResultData.netResultOre > 0 ? 'vinst' : 'förlust'})
            </p>

            <div className="mb-4 rounded border bg-muted/30 p-3 text-sm">
              <p className="mb-1 font-medium">Verifikation som skapas:</p>
              {netResultData.netResultOre > 0 ? (
                <>
                  <p>
                    Debet 8999 Årets resultat:{' '}
                    {formatKronor(netResultData.netResultOre)}
                  </p>
                  <p>
                    Kredit 2099 Årets resultat:{' '}
                    {formatKronor(netResultData.netResultOre)}
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Debet 2099 Årets resultat:{' '}
                    {formatKronor(Math.abs(netResultData.netResultOre))}
                  </p>
                  <p>
                    Kredit 8999 Årets resultat:{' '}
                    {formatKronor(Math.abs(netResultData.netResultOre))}
                  </p>
                </>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                Datum: {prevEndDate}
              </p>
            </div>

            {showSkipWarning ? (
              <div className="mb-4 rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="mb-2 font-medium">
                  Utan resultatbokning kan ingående balanser bli felaktiga.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setUserChoseBook(false)
                      setShowSkipWarning(false)
                      setStep(2)
                    }}
                    className="rounded bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
                  >
                    Fortsätt ändå
                  </button>
                  <button
                    onClick={() => setShowSkipWarning(false)}
                    className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleBookAndContinue}
                  className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Bokför & fortsätt
                </button>
                <button
                  onClick={handleSkipBooking}
                  className="rounded border px-4 py-2 text-sm hover:bg-muted"
                >
                  Hoppa över
                </button>
                <button
                  onClick={onClose}
                  className="rounded border px-4 py-2 text-sm hover:bg-muted"
                >
                  Avbryt
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Confirmation */}
        {step === 2 && (
          <div>
            <div className="mb-4 space-y-2 text-sm">
              <p className="font-medium">
                Nytt räkenskapsår: {newStartDate} – {newEndDate}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Alla perioder i {activeFiscalYear.year_label} stängs</li>
                <li>Räkenskapsåret markeras som stängt</li>
                <li>IB-verifikation (O1) skapas i nya året</li>
              </ul>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  handleCreate(userChoseBook)
                }}
                disabled={createMutation.isPending}
                className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Skapar...' : 'Skapa räkenskapsår'}
              </button>
              <button
                onClick={onClose}
                className="rounded border px-4 py-2 text-sm hover:bg-muted"
              >
                Avbryt
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && resultData && (
          <div>
            <div className="mb-4 space-y-2 text-sm">
              <p className="text-green-700">Räkenskapsår skapat</p>
              <p className="text-green-700">Ingående balans skapad</p>
              <p className="text-green-700">Bytt till nytt räkenskapsår</p>
            </div>

            <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              Ingående balanser har överförts. Konto 2099 (Årets resultat) har
              automatiskt omförts till 2091 (Balanserat resultat).
            </div>

            <button
              onClick={onClose}
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Klar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
