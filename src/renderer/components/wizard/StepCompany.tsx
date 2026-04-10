import type { ChangeEvent } from 'react'

import { todayLocal } from '../../lib/format'

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

  const isValid =
    name.length >= 2 &&
    /^[5-9]\d{5}-\d{4}$/.test(org_number) &&
    parseFloat(share_capital) >= 25000 &&
    registration_date !== '' &&
    registration_date <= todayLocal()

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium">
          Vad heter ditt företag?
        </label>
        <input
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
        <label className="mb-1 block text-sm font-medium">
          Organisationsnummer
        </label>
        <input
          type="text"
          value={org_number}
          onChange={handleOrgChange}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          placeholder="NNNNNN-NNNN"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Hittar du på Bolagsverket eller i registreringsbeviset
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Vilken redovisningsregel använder du?
        </label>
        <div className="mt-2 space-y-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
            <input
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
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50">
            <input
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
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Insatt aktiekapital vid registrering
        </label>
        <div className="relative">
          <input
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
        <p className="mt-1 text-xs text-muted-foreground">
          Beloppet du satte in när bolaget startades. Minst 25 000 kr.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          När registrerades bolaget?
        </label>
        <input
          type="date"
          value={registration_date}
          onChange={(e) => onChange('registration_date', e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          max={todayLocal()}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Står i registreringsbeviset
        </p>
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
