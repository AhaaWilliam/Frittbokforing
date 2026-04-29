// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { CommandPalette } from '../../../../src/renderer/components/command-palette/CommandPalette'
import {
  type Command,
  filterCommands,
  filterByMode,
  buildBokforareCommands,
  buildSystemCommands,
  buildRecentItemsCommands,
} from '../../../../src/renderer/components/command-palette/commands'

const AXE_OPTIONS: axe.RunOptions = {
  rules: { 'color-contrast': { enabled: false } },
}

function makeCommands(navigate = vi.fn()): Command[] {
  return [
    {
      id: 'nav.overview',
      label: 'Översikt',
      section: 'navigation',
      keywords: ['hem', 'dashboard'],
      run: () => navigate('/overview'),
    },
    {
      id: 'create.invoice',
      label: 'Ny faktura',
      section: 'create',
      keywords: ['kundfaktura'],
      shortcut: ['⌘', 'N'],
      run: () => navigate('/income/create'),
    },
    {
      id: 'create.expense',
      label: 'Ny kostnad',
      section: 'create',
      run: () => navigate('/expenses/create'),
    },
  ]
}

describe('filterCommands', () => {
  it('returns all when query is empty', () => {
    const cmds = makeCommands()
    expect(filterCommands(cmds, '')).toHaveLength(3)
  })

  it('matches label substring case-insensitively', () => {
    const cmds = makeCommands()
    expect(filterCommands(cmds, 'fakt')).toHaveLength(1)
    expect(filterCommands(cmds, 'FAKT')).toHaveLength(1)
  })

  it('matches keyword', () => {
    const cmds = makeCommands()
    expect(filterCommands(cmds, 'dashboard')).toHaveLength(1)
    expect(filterCommands(cmds, 'kundfaktura')).toHaveLength(1)
  })

  it('returns empty when nothing matches', () => {
    expect(filterCommands(makeCommands(), 'zzz-no-match')).toHaveLength(0)
  })

  it('trims whitespace in query', () => {
    expect(filterCommands(makeCommands(), '  fakt  ')).toHaveLength(1)
  })
})

describe('filterByMode', () => {
  it('returns commands without mode-restriction in any mode', () => {
    const cmds = makeCommands()
    expect(filterByMode(cmds, 'vardag')).toHaveLength(3)
    expect(filterByMode(cmds, 'bokforare')).toHaveLength(3)
  })

  it('respects mode-restriction', () => {
    const cmds: Command[] = [
      ...makeCommands(),
      {
        id: 'system.bokforare-only',
        label: 'Bokförar-grej',
        section: 'system',
        modes: ['bokforare'],
        run: vi.fn(),
      },
      {
        id: 'system.vardag-only',
        label: 'Vardags-grej',
        section: 'system',
        modes: ['vardag'],
        run: vi.fn(),
      },
    ]
    expect(filterByMode(cmds, 'bokforare')).toHaveLength(4)
    expect(filterByMode(cmds, 'vardag')).toHaveLength(4)
    expect(
      filterByMode(cmds, 'bokforare').find(
        (c) => c.id === 'system.vardag-only',
      ),
    ).toBeUndefined()
  })
})

describe('buildBokforareCommands', () => {
  it('returns a non-empty list of commands', () => {
    const cmds = buildBokforareCommands(vi.fn())
    expect(cmds.length).toBeGreaterThan(10)
  })

  it('navigate is called when run() is invoked', () => {
    const navigate = vi.fn()
    const cmds = buildBokforareCommands(navigate)
    const overview = cmds.find((c) => c.id === 'nav.overview')
    expect(overview).toBeDefined()
    overview!.run()
    expect(navigate).toHaveBeenCalledWith('/overview')
  })

  it('all command ids are unique', () => {
    const cmds = buildBokforareCommands(vi.fn())
    const ids = cmds.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('buildSystemCommands', () => {
  it('always includes switch-to-vardag', () => {
    const switchToVardag = vi.fn()
    const cmds = buildSystemCommands({ switchToVardag })
    const cmd = cmds.find((c) => c.id === 'system.switch-to-vardag')
    expect(cmd).toBeDefined()
    expect(cmd!.modes).toContain('bokforare')
    cmd!.run()
    expect(switchToVardag).toHaveBeenCalled()
  })

  it('omits backup-create när callback inte tillhandahålls', () => {
    const cmds = buildSystemCommands({ switchToVardag: vi.fn() })
    expect(cmds.find((c) => c.id === 'system.backup-create')).toBeUndefined()
  })

  it('inkluderar backup-create när callback finns', () => {
    const createBackup = vi.fn()
    const cmds = buildSystemCommands({
      switchToVardag: vi.fn(),
      createBackup,
    })
    const cmd = cmds.find((c) => c.id === 'system.backup-create')
    expect(cmd).toBeDefined()
    cmd!.run()
    expect(createBackup).toHaveBeenCalled()
  })

  it('inkluderar re-transfer-ib när callback finns', () => {
    const reTransfer = vi.fn()
    const cmds = buildSystemCommands({
      switchToVardag: vi.fn(),
      reTransferOpeningBalance: reTransfer,
    })
    const cmd = cmds.find((c) => c.id === 'system.re-transfer-ib')
    expect(cmd).toBeDefined()
    cmd!.run()
    expect(reTransfer).toHaveBeenCalled()
  })
})

describe('buildRecentItemsCommands', () => {
  it('returns one command per item', () => {
    const navigate = vi.fn()
    const cmds = buildRecentItemsCommands(navigate, [
      { id: 'a', label: 'Item A', path: '/a' },
      { id: 'b', label: 'Item B', path: '/b' },
    ])
    expect(cmds).toHaveLength(2)
  })

  it('all returned commands sit in view-section', () => {
    const cmds = buildRecentItemsCommands(vi.fn(), [
      { id: 'x', label: 'X', path: '/x' },
    ])
    expect(cmds[0].section).toBe('view')
  })

  it('run() navigerar till item.path', () => {
    const navigate = vi.fn()
    const cmds = buildRecentItemsCommands(navigate, [
      { id: 'a', label: 'A', path: '/income/edit/42' },
    ])
    cmds[0].run()
    expect(navigate).toHaveBeenCalledWith('/income/edit/42')
  })

  it('preserverar keywords på item-nivå', () => {
    const cmds = buildRecentItemsCommands(vi.fn(), [
      { id: 'a', label: 'A', keywords: ['acme', 'kund'], path: '/x' },
    ])
    expect(cmds[0].keywords).toEqual(['acme', 'kund'])
  })

  it('returnerar tom lista vid tom input', () => {
    expect(buildRecentItemsCommands(vi.fn(), [])).toEqual([])
  })
})

describe('CommandPalette', () => {
  it('renders when open=true', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    expect(screen.getByTestId('command-palette')).toBeInTheDocument()
  })

  it('does not render when open=false', () => {
    render(
      <CommandPalette
        open={false}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument()
  })

  it('focuses input on open', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    await waitFor(() => {
      const input = screen.getByTestId('command-palette-input')
      expect(document.activeElement).toBe(input)
    })
  })

  it('renders all commands grouped by section', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    expect(screen.getByText('Översikt')).toBeInTheDocument()
    expect(screen.getByText('Ny faktura')).toBeInTheDocument()
    expect(screen.getByText('Ny kostnad')).toBeInTheDocument()
    // Section headers
    expect(screen.getByText('Skapa')).toBeInTheDocument()
    expect(screen.getByText('Gå till')).toBeInTheDocument()
  })

  it('filters commands when typing', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    const input = screen.getByTestId('command-palette-input')
    await userEvent.type(input, 'fakt')
    expect(screen.getByText('Ny faktura')).toBeInTheDocument()
    expect(screen.queryByText('Översikt')).not.toBeInTheDocument()
  })

  it('shows empty-state when no matches', async () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    const input = screen.getByTestId('command-palette-input')
    await userEvent.type(input, 'zzz-no-match')
    expect(screen.getByText(/Inga kommandon matchar/)).toBeInTheDocument()
  })

  it('runs command and closes on click', async () => {
    const navigate = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette
        open={true}
        onOpenChange={onOpenChange}
        commands={makeCommands(navigate)}
        mode="bokforare"
      />,
    )
    await userEvent.click(screen.getByText('Ny faktura'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    // Run is queued via queueMicrotask
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/income/create')
    })
  })

  it('uses combobox ARIA roles', () => {
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    const input = screen.getByRole('combobox')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option').length).toBe(3)
  })

  it('navigates with ArrowDown and activates with Enter', async () => {
    const navigate = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <CommandPalette
        open={true}
        onOpenChange={onOpenChange}
        commands={makeCommands(navigate)}
        mode="bokforare"
      />,
    )
    const input = screen.getByTestId('command-palette-input')
    input.focus()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() => {
      expect(navigate).toHaveBeenCalled()
    })
  })

  it('respects mode filter', () => {
    const vardagOnly: Command = {
      id: 'vardag.only',
      label: 'Bara Vardag',
      section: 'system',
      modes: ['vardag'],
      run: vi.fn(),
    }
    render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={[...makeCommands(), vardagOnly]}
        mode="bokforare"
      />,
    )
    expect(screen.queryByText('Bara Vardag')).not.toBeInTheDocument()
  })

  it('passes axe a11y check', async () => {
    const { container } = render(
      <CommandPalette
        open={true}
        onOpenChange={vi.fn()}
        commands={makeCommands()}
        mode="bokforare"
      />,
    )
    const results = await axe.run(container, AXE_OPTIONS)
    expect(results.violations).toEqual([])
  })
})
