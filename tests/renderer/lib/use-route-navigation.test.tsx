// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  HashRouter,
  type RouteDefinition,
} from '../../../src/renderer/lib/router'
import {
  useSubViewNavigation,
  useMasterDetailNavigation,
} from '../../../src/renderer/lib/use-route-navigation'

const routes: RouteDefinition[] = [
  { pattern: '/income/create', page: 'income' },
  { pattern: '/income/edit/:id', page: 'income' },
  { pattern: '/income/view/:id', page: 'income' },
  { pattern: '/income', page: 'income' },
  { pattern: '/customers/create', page: 'customers' },
  { pattern: '/customers/:id/edit', page: 'customers' },
  { pattern: '/customers/:id', page: 'customers' },
  { pattern: '/customers', page: 'customers' },
]

beforeEach(() => {
  window.location.hash = '#/'
})

afterEach(() => {
  window.location.hash = '#/'
})

function SubViewProbe({ basePath }: { basePath: string }) {
  const nav = useSubViewNavigation(basePath)
  return (
    <div>
      <span data-testid="view">{nav.currentView}</span>
      <span data-testid="entity-id">{String(nav.entityId ?? '')}</span>
      <button onClick={nav.goToList}>list</button>
      <button onClick={nav.goToCreate}>create</button>
      <button onClick={() => nav.goToEdit(7)}>edit-7</button>
      <button onClick={() => nav.goToView(8)}>view-8</button>
    </div>
  )
}

function MasterDetailProbe({ basePath }: { basePath: string }) {
  const nav = useMasterDetailNavigation(basePath)
  return (
    <div>
      <span data-testid="mode">{String(nav.mode ?? '')}</span>
      <span data-testid="selected-id">{String(nav.selectedId ?? '')}</span>
      <button onClick={nav.goToList}>list</button>
      <button onClick={nav.goToCreate}>create</button>
      <button onClick={() => nav.goToView(11)}>view</button>
      <button onClick={() => nav.goToEdit(12)}>edit</button>
    </div>
  )
}

describe('useSubViewNavigation', () => {
  it('default /income → currentView=list', () => {
    window.location.hash = '#/income'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    expect(screen.getByTestId('view')).toHaveTextContent('list')
    expect(screen.getByTestId('entity-id')).toHaveTextContent('')
  })

  it('/income/create → currentView=create', () => {
    window.location.hash = '#/income/create'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    expect(screen.getByTestId('view')).toHaveTextContent('create')
  })

  it('/income/edit/42 → currentView=edit, entityId=42', () => {
    window.location.hash = '#/income/edit/42'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    expect(screen.getByTestId('view')).toHaveTextContent('edit')
    expect(screen.getByTestId('entity-id')).toHaveTextContent('42')
  })

  it('/income/view/9 → currentView=view, entityId=9', () => {
    window.location.hash = '#/income/view/9'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    expect(screen.getByTestId('view')).toHaveTextContent('view')
    expect(screen.getByTestId('entity-id')).toHaveTextContent('9')
  })

  it('goToCreate navigerar till /income/create', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/income'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    await user.click(screen.getByText('create'))
    expect(screen.getByTestId('view')).toHaveTextContent('create')
  })

  it('goToEdit(7) navigerar till /income/edit/7', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/income'
    render(
      <HashRouter routes={routes}>
        <SubViewProbe basePath="/income" />
      </HashRouter>,
    )
    await user.click(screen.getByText('edit-7'))
    expect(screen.getByTestId('view')).toHaveTextContent('edit')
    expect(screen.getByTestId('entity-id')).toHaveTextContent('7')
  })
})

describe('useMasterDetailNavigation', () => {
  it('default /customers → mode=null', () => {
    window.location.hash = '#/customers'
    render(
      <HashRouter routes={routes}>
        <MasterDetailProbe basePath="/customers" />
      </HashRouter>,
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('')
  })

  it('/customers/create → mode=create', () => {
    window.location.hash = '#/customers/create'
    render(
      <HashRouter routes={routes}>
        <MasterDetailProbe basePath="/customers" />
      </HashRouter>,
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('create')
  })

  it('/customers/5 → mode=view, selectedId=5', () => {
    window.location.hash = '#/customers/5'
    render(
      <HashRouter routes={routes}>
        <MasterDetailProbe basePath="/customers" />
      </HashRouter>,
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('view')
    expect(screen.getByTestId('selected-id')).toHaveTextContent('5')
  })

  it('/customers/3/edit → mode=edit, selectedId=3', () => {
    window.location.hash = '#/customers/3/edit'
    render(
      <HashRouter routes={routes}>
        <MasterDetailProbe basePath="/customers" />
      </HashRouter>,
    )
    expect(screen.getByTestId('mode')).toHaveTextContent('edit')
    expect(screen.getByTestId('selected-id')).toHaveTextContent('3')
  })

  it('goToView(11) navigerar till /customers/11', async () => {
    const user = userEvent.setup()
    window.location.hash = '#/customers'
    render(
      <HashRouter routes={routes}>
        <MasterDetailProbe basePath="/customers" />
      </HashRouter>,
    )
    await user.click(screen.getByText('view'))
    expect(screen.getByTestId('mode')).toHaveTextContent('view')
    expect(screen.getByTestId('selected-id')).toHaveTextContent('11')
  })
})
