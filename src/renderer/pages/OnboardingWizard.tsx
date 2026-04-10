import { useReducer } from 'react'
import { useCreateCompany } from '../lib/hooks'
import { StepCompany } from '../components/wizard/StepCompany'
import {
  StepFiscalYear,
  computeFiscalYear,
} from '../components/wizard/StepFiscalYear'
import { StepConfirm } from '../components/wizard/StepConfirm'
import type { CreateCompanyInput } from '../../shared/types'

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

export function OnboardingWizard() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const createCompany = useCreateCompany()

  const setField = (field: string, value: string | boolean | number) =>
    dispatch({ type: 'SET_FIELD', field, value })

  const { start, end } = computeFiscalYear(
    state.registration_date,
    state.use_broken_fiscal_year,
    state.fiscal_year_start_month,
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
        <h1 className="mb-2 text-center text-2xl font-bold">Fritt Bokföring</h1>
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Kom igång med din bokföring
        </p>

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  state.step > i + 1
                    ? 'bg-green-100 text-green-700'
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
      </div>
    </div>
  )
}
