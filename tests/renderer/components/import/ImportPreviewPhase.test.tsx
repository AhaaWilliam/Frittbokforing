// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useState } from 'react'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupMockIpc } from '../../../setup/mock-ipc'
import { renderWithProviders } from '../../../helpers/render-with-providers'
import { ImportPreviewPhase } from '../../../../src/renderer/components/import/ImportPreviewPhase'
import type {
  AccountConflict,
  ConflictResolution,
  ValidationResult,
} from '../../../../src/renderer/components/import/import-types'

function makeValidation(conflicts: AccountConflict[] = []): ValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    conflicts,
    summary: {
      accounts: 10,
      entries: 5,
      lines: 20,
      fiscalYears: 1,
      sieType: 4,
      programName: 'Test',
      companyName: 'ACME AB',
      orgNumber: '556111-2222',
    },
  }
}

/** Wrapper som håller resolutions-state så radio-klick kan "ta effekt". */
function Wrapper({
  conflicts,
  initialResolutions = {},
  strategy = 'merge',
}: {
  conflicts: AccountConflict[]
  initialResolutions?: Record<string, ConflictResolution>
  strategy?: 'new' | 'merge'
}) {
  const [resolutions, setResolutions] =
    useState<Record<string, ConflictResolution>>(initialResolutions)
  return (
    <ImportPreviewPhase
      validation={makeValidation(conflicts)}
      strategy={strategy}
      onStrategyChange={vi.fn()}
      onImport={vi.fn()}
      onCancel={vi.fn()}
      conflictResolutions={resolutions}
      onConflictResolutionChange={(acc, r) =>
        setResolutions((p) => ({ ...p, [acc]: r }))
      }
    />
  )
}

beforeEach(() => {
  setupMockIpc()
})

describe('ImportPreviewPhase konflikt-sektion (S57 B3b)', () => {
  it('inga conflicts → ingen konflikt-sektion renderas', async () => {
    await renderWithProviders(<Wrapper conflicts={[]} />)
    expect(screen.queryByTestId('sie4-conflicts-section')).toBeNull()
    // Importera-knappen är aktiv
    expect(screen.getByTestId('sie4-import-btn')).not.toBeDisabled()
  })

  it('1 conflict + default → radio "Behåll" är checked', async () => {
    await renderWithProviders(
      <Wrapper
        conflicts={[
          {
            account_number: '1930',
            existing_name: 'Bank',
            new_name: 'Företagskonto',
            referenced_by_entries: 0,
          },
        ]}
      />,
    )
    expect(screen.getByTestId('sie4-conflicts-section')).toBeDefined()
    const keepRadio = screen.getByTestId('conflict-1930-keep') as HTMLInputElement
    expect(keepRadio.checked).toBe(true)
    expect(screen.getByTestId('sie4-import-btn')).not.toBeDisabled()
  })

  it('skip på used-account → varningstext + Importera disabled', async () => {
    await renderWithProviders(
      <Wrapper
        conflicts={[
          {
            account_number: '1930',
            existing_name: 'Bank',
            new_name: 'Företagskonto',
            referenced_by_entries: 47,
          },
        ]}
      />,
    )
    await userEvent.click(screen.getByTestId('conflict-1930-skip'))
    expect(screen.getByTestId('conflict-1930-invalid-skip')).toBeDefined()
    expect(screen.getByTestId('sie4-import-btn')).toBeDisabled()
  })

  it('skip på unused-account → ingen varning, knapp aktiv', async () => {
    await renderWithProviders(
      <Wrapper
        conflicts={[
          {
            account_number: '9999',
            existing_name: 'Gamla kontot',
            new_name: 'Nya kontot',
            referenced_by_entries: 0,
          },
        ]}
      />,
    )
    await userEvent.click(screen.getByTestId('conflict-9999-skip'))
    expect(screen.queryByTestId('conflict-9999-invalid-skip')).toBeNull()
    expect(screen.getByTestId('sie4-import-btn')).not.toBeDisabled()
  })
})
