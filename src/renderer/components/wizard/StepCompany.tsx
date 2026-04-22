import type { ChangeEvent } from 'react'

import { todayLocal } from '../../lib/format'
import { parseDecimal } from '../../../shared/money'
import { luhnCheck } from '../../../shared/ipc-schemas'

interface StepCompanyProps {
  name: string
  org_number: string
  fiscal_rule: 'K2' | 'K3'
  share_capital: string
  registration_date: string
  onChange: (field: string, value: string) => void
  onNext: () => void
}

function formatOrgNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10)
  if (digits.length > 6) {
    return digits.slice(0, 6) + '-' + digits.slice(6)
  }
  return digits
}

export function StepCompany({
  name,
  org_number,
  fiscal_rule,
  share_capital,
  registration_date,
  onChange,
  onNext,
}: StepCompanyProps) {
  const handleOrgChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange('org_number', formatOrgNumber(e.target.value))
  }

  const orgFormatValid = /^[5-9]\d{5}-\d{4}$/.test(org_number)
  const orgLuhnValid = orgFormatValid && luhnCheck(org_number)
  const orgNumberValid = orgFormatValid && orgLuhnValid
  const shareCapitalNum = parseDecimal(share_capital)
  const shareCapitalValid = !isNaN(shareCapitalNum) && shareCapitalNum >= 25000
  const registrationDateValid =
    registration_date !== '' && registration_date <= todayLocal()

  const isValid =
    name.length >= 2 &&
    orgNumberValid &&
    shareCapitalValid &&
    registrationDateValid

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="wizard-name" className="mb-1 block text-sm font-medium">
          Vad heter ditt företag?
        </label>
        <input
          id="wizard-name"
          type="text"
          value={name}
          onChange={(e) => onChange('name', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="AB Företaget"
        />
        {name.length > 0 && name.length < 2 && (
          <p className="mt-1 text-xs text-red-500">Minst 2 tecken</p>
        )}
      </div>

      <div>
        <label
          htmlFor="wizard-org-number"
          className="mb-1 block text-sm font-medium"
        >
          Organisationsnummer
        </label>
        <input
          id="wizard-org-number"
          type="text"
          value={org_number}
          onChange={handleOrgChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="NNNNNN-NNNN"
        />
        {org_number.length > 0 && !orgFormatValid ? (
          <p className="mt-1 text-xs text-red-500" role="alert">
            Måste ha 10 siffror och börja med 5–9 (aktiebolag)
          </p>
        ) : org_number.length > 0 && !orgLuhnValid ? (
          <p className="mt-1 text-xs text-red-500" role="alert">
            Kontrollsiffran stämmer inte — dubbelkolla numret
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Hittar du på Bolagsverket eller i registreringsbeviset
          </p>
        )}
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">
          Vilken redovisningsregel använder du?
        </legend>
        <div className="mt-2 space-y-2">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- radio-input är sibling, tillhörande text finns i nested div (tillgänglig via label-textContent för screen readers) */}
          <label
            htmlFor="fiscal-rule-k2"
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50"
          >
            <input
              id="fiscal-rule-k2"
              type="radio"
              name="fiscal_rule"
              value="K2"
              checked={fiscal_rule === 'K2'}
              onChange={(e) => onChange('fiscal_rule', e.target.value)}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium">
                Förenklad redovisning (K2)
              </div>
              <div className="text-xs text-muted-foreground">
                För mindre bolag som vill ha enklare regler. Standardvalet.
              </div>
            </div>
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control -- radio-input är sibling, tillhörande text finns i nested div (tillgänglig via label-textContent för screen readers) */}
          <label
            htmlFor="fiscal-rule-k3"
            className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50"
          >
            <input
              id="fiscal-rule-k3"
              type="radio"
              name="fiscal_rule"
              value="K3"
              checked={fiscal_rule === 'K3'}
              onChange={(e) => onChange('fiscal_rule', e.target.value)}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium">
                Fullständig redovisning (K3)
              </div>
              <div className="text-xs text-muted-foreground">
                För bolag som växer, äger fastigheter, har komplexa tillgångar,
                eller ingår i en koncern.
              </div>
            </div>
          </label>
        </div>
      </fieldset>

      <div>
        <label
          htmlFor="wizard-share-capital"
          className="mb-1 block text-sm font-medium"
        >
          Insatt aktiekapital vid registrering
        </label>
        <div className="relative">
          <input
            id="wizard-share-capital"
            type="number"
            value={share_capital}
            onChange={(e) => onChange('share_capital', e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="25000"
            min="25000"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            kr
          </span>
        </div>
        {share_capital.length > 0 && !shareCapitalValid ? (
          <p className="mt-1 text-xs text-red-500" role="alert">
            Minst 25 000 kr krävs för aktiebolag
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Beloppet du satte in när bolaget startades. Minst 25 000 kr.
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="wizard-registration-date"
          className="mb-1 block text-sm font-medium"
        >
          När registrerades bolaget?
        </label>
        <input
          id="wizard-registration-date"
          type="date"
          value={registration_date}
          onChange={(e) => onChange('registration_date', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          max={todayLocal()}
        />
        {registration_date !== '' && registration_date > todayLocal() ? (
          <p className="mt-1 text-xs text-red-500" role="alert">
            Registreringsdatum kan inte vara i framtiden
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            Står i registreringsbeviset
          </p>
        )}
      </div>

      <button
        onClick={onNext}
        disabled={!isValid}
        className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Nästa
      </button>
    </div>
  )
}
