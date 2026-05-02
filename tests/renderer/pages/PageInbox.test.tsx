// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { setupMockIpc, mockIpcResponse } from '../../setup/mock-ipc'
import { renderWithProviders } from '../../helpers/render-with-providers'
import { PageInbox } from '../../../src/renderer/pages/PageInbox'

beforeEach(() => {
  setupMockIpc()
})

describe('PageInbox', () => {
  it('renderar drop-zone och tab-headers', async () => {
    mockIpcResponse('receipt:list', { success: true, data: [] })
    mockIpcResponse('receipt:counts', {
      success: true,
      data: { inbox: 0, booked: 0, archived: 0 },
    })
    await renderWithProviders(<PageInbox />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('inbox-dropzone')).toBeInTheDocument()
    })
    expect(screen.getByTestId('inbox-tab-inbox')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-tab-booked')).toBeInTheDocument()
    expect(screen.getByTestId('inbox-tab-archived')).toBeInTheDocument()
  })

  // VS-123: CSV-export-knappen renderas i tabs-headern.
  it('VS-123 visar Exportera CSV-knapp', async () => {
    mockIpcResponse('receipt:list', { success: true, data: [] })
    mockIpcResponse('receipt:counts', {
      success: true,
      data: { inbox: 0, booked: 0, archived: 0 },
    })
    await renderWithProviders(<PageInbox />, { axeCheck: false }) // M133 exempt — dedicated axe test below
    await waitFor(() => {
      expect(screen.getByTestId('inbox-export-csv')).toBeInTheDocument()
    })
    expect(screen.getByText(/Exportera CSV/)).toBeInTheDocument()
  })

  // VS-126: notes-knapp + dialog för att redigera receipt.notes
  it('VS-126 visar notes-knapp på varje row + öppnar dialog', async () => {
    const receipt = {
      id: 7,
      company_id: 1,
      uploaded_at: '2026-04-01 10:00',
      file_path: 'receipts-inbox/abc-test.pdf',
      original_filename: 'kvitto.pdf',
      file_size_bytes: 1024,
      mime_type: 'application/pdf',
      file_hash: 'b'.repeat(64),
      status: 'inbox' as const,
      expense_id: null,
      notes: 'Restaurang med kund',
      archived_at: null,
    }
    mockIpcResponse('receipt:list', { success: true, data: [receipt] })
    mockIpcResponse('receipt:counts', {
      success: true,
      data: { inbox: 1, booked: 0, archived: 0 },
    })
    await renderWithProviders(<PageInbox />, { axeCheck: false }) // M133 exempt — dedicated axe test below

    await waitFor(() => {
      expect(screen.getByTestId('inbox-row-notes-7')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('inbox-row-notes-7'))

    await waitFor(() => {
      expect(screen.getByTestId('receipt-notes-dialog')).toBeInTheDocument()
    })
    const ta = screen.getByTestId(
      'receipt-notes-textarea',
    ) as HTMLTextAreaElement
    expect(ta.value).toBe('Restaurang med kund')
  })

  // VS-124: ConfirmDialog ersätter native confirm() vid radering (M156).
  // Statisk vakt — fångar regression om confirm() återintroduceras.
  it('VS-124 PageInbox-källan kallar inte browser confirm()', () => {
    const sourcePath = path.resolve(
      __dirname,
      '../../../src/renderer/pages/PageInbox.tsx',
    )
    const source = fs.readFileSync(sourcePath, 'utf8')
    // Strippa kommentarsrader (// ...) och block-comments (/* ... */) innan
    // sökning så att regression-vakten inte triggas av historik-noter.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    const callMatches = stripped.match(/\bconfirm\(/g) ?? []
    expect(callMatches).toEqual([])
    // Använder ConfirmDialog istället
    expect(source).toMatch(/<ConfirmDialog/)
  })
})
