import { useEffect, useReducer } from 'react'
import { useCreateCompany } from '../lib/hooks'
import { StepCompany } from '../components/wizard/StepCompany'
import {
  StepFiscalYear,
  computeFiscalYear,
} from '../components/wizard/StepFiscalYear'
import { StepConfirm } from '../components/wizard/StepConfirm'
import type { Company, CreateCompanyInput } from '../../shared/types'

type WizardStep = 1 | 2 | 3

interface WizardState {
  step: WizardStep
  name: string
  org_number: string
  fiscal_rule: 'K2' | 'K3'
  share_capital: string
  registration_date: string
  use_broken_fiscal_year: boolean
  fiscal_year_start_month: number
  /** Kortat första FY per BFL 3:3 — start = registreringsdatum. */
  use_short_first_fy: boolean
  /** Förlängt första FY per BFL 3:3 — upp till 13 månader framåt. */
  use_extended_first_fy: boolean
}

type WizardAction =
  | { type: 'SET_FIELD'; field: string; value: string | boolean | number }
  | { type: 'SET_STEP'; step: WizardStep }

const initialState: WizardState = {
  step: 1,
  name: '',
  org_number: '',
  fiscal_rule: 'K2',
  share_capital: '25000',
  registration_date: '',
  use_broken_fiscal_year: false,
  fiscal_year_start_month: 1,
  use_short_first_fy: false,
  use_extended_first_fy: false,
}

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value }
    case 'SET_STEP':
      return { ...state, step: action.step }
  }
}

const STEPS = ['Företagsuppgifter', 'Bokföringsår', 'Bekräfta']

interface OnboardingWizardProps {
  /** Triggas när wizarden ska stängas utan att skapa bolag (add-company-modal). */
  onCancel?: () => void
  /** Triggas efter framgångsrikt skapat bolag (add-company-modal). */
  onSuccess?: (company: Company) => void
  /** Triggas när användaren väljer SIE-import istället (endast first-run). */
  onImportInstead?: () => void
}

export function OnboardingWizard({
  onCancel,
  onSuccess,
  onImportInstead,
}: OnboardingWizardProps = {}) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const createCompany = useCreateCompany()

  // Anropa onSuccess efter att mutationen lyckats. useEffect undviker
  // setState-i-render genom att vänta tills reactQuery rapporterat success.
  useEffect(() => {
    if (createCompany.isSuccess && createCompany.data && onSuccess) {
      onSuccess(createCompany.data)
    }
  }, [createCompany.isSuccess, createCompany.data, onSuccess])

  const setField = (field: string, value: string | boolean | number) =>
    dispatch({ type: 'SET_FIELD', field, value })

  const { start, end } = computeFiscalYear(
    state.registration_date,
    state.use_broken_fiscal_year,
    state.fiscal_year_start_month,
    state.use_short_first_fy,
    state.use_extended_first_fy,
  )

  const handleSubmit = (data: CreateCompanyInput) => {
    createCompany.mutate(data)
  }

  const lastError = createCompany.error?.message ?? null

  return (
    <div
      className="flex min-h-screen items-center justify-center p-8"
      data-testid="wizard"
    >
      <div className="w-full max-w-lg">
        <h1 className="mb-2 text-center font-serif text-2xl font-normal">
          {onCancel ? (
            'Lägg till bolag'
          ) : (
            <>
              <span className="font-serif-italic">Fritt</span> Bokföring
            </>
          )}
        </h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          {onCancel
            ? 'Skapa ett nytt bolag'
            : 'Bokföring för svenska aktiebolag'}
        </p>
        {onCancel && (
          <div className="mb-4 text-center">
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-muted-foreground underline"
              data-testid="wizard-cancel"
            >
              Avbryt
            </button>
          </div>
        )}

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  state.step > i + 1
                    ? 'bg-success-100 text-success-700'
                    : state.step === i + 1
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {state.step > i + 1 ? '\u2713' : i + 1}
              </div>
              <span
                className={`text-xs ${state.step === i + 1 ? 'font-medium' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div className="mx-1 h-px w-6 bg-border" />
              )}
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          {state.step === 1 && (
            <StepCompany
              name={state.name}
              org_number={state.org_number}
              fiscal_rule={state.fiscal_rule}
              share_capital={state.share_capital}
              registration_date={state.registration_date}
              onChange={setField}
              onNext={() => dispatch({ type: 'SET_STEP', step: 2 })}
            />
          )}
          {state.step === 2 && (
            <StepFiscalYear
              registration_date={state.registration_date}
              use_broken_fiscal_year={state.use_broken_fiscal_year}
              fiscal_year_start_month={state.fiscal_year_start_month}
              use_short_first_fy={state.use_short_first_fy}
              use_extended_first_fy={state.use_extended_first_fy}
              onChange={setField}
              onNext={() => dispatch({ type: 'SET_STEP', step: 3 })}
              onBack={() => dispatch({ type: 'SET_STEP', step: 1 })}
            />
          )}
          {state.step === 3 && (
            <StepConfirm
              name={state.name}
              org_number={state.org_number}
              fiscal_rule={state.fiscal_rule}
              share_capital={state.share_capital}
              registration_date={state.registration_date}
              fiscal_year_start={start}
              fiscal_year_end={end}
              onBack={() => dispatch({ type: 'SET_STEP', step: 2 })}
              onSubmit={handleSubmit}
              isPending={createCompany.isPending}
              error={lastError}
            />
          )}
        </div>

        {onImportInstead && state.step === 1 && (
          <div className="mt-6 text-center text-sm">
            <p className="text-muted-foreground">
              Har du en SIE-fil från ditt gamla bokföringssystem?
            </p>
            <button
              type="button"
              onClick={onImportInstead}
              className="mt-1 text-primary underline hover:no-underline"
              data-testid="wizard-import-instead"
            >
              Importera från SIE-fil istället
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
