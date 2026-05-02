import type { RouteDefinition } from './router'

export const routes: RouteDefinition[] = [
  // Simple pages
  { pattern: '/overview', page: 'overview' },
  { pattern: '/accounts', page: 'accounts' },
  { pattern: '/settings', page: 'settings' },
  { pattern: '/export', page: 'export' },
  { pattern: '/import', page: 'import' },
  { pattern: '/reports', page: 'reports' },
  { pattern: '/tax', page: 'tax' },
  { pattern: '/vat', page: 'vat' },
  { pattern: '/account-statement', page: 'account-statement' },
  { pattern: '/aging', page: 'aging' },
  { pattern: '/budget', page: 'budget' },
  { pattern: '/accruals', page: 'accruals' },
  { pattern: '/fixed-assets', page: 'fixed-assets' },
  { pattern: '/bank-statements/:id', page: 'bank-statements' },
  { pattern: '/bank-statements', page: 'bank-statements' },
  { pattern: '/sepa-dd', page: 'sepa-dd' },

  // Master-detail pages (specific before generic)
  { pattern: '/customers/create', page: 'customers' },
  { pattern: '/customers/:id/edit', page: 'customers' },
  { pattern: '/customers/:id', page: 'customers' },
  { pattern: '/customers', page: 'customers' },

  { pattern: '/suppliers/create', page: 'suppliers' },
  { pattern: '/suppliers/:id/edit', page: 'suppliers' },
  { pattern: '/suppliers/:id', page: 'suppliers' },
  { pattern: '/suppliers', page: 'suppliers' },

  { pattern: '/products/create', page: 'products' },
  { pattern: '/products/:id/edit', page: 'products' },
  { pattern: '/products/:id', page: 'products' },
  { pattern: '/products', page: 'products' },

  // Sub-view pages (specific before generic)
  { pattern: '/income/create', page: 'income' },
  { pattern: '/income/edit/:id', page: 'income' },
  { pattern: '/income/view/:id', page: 'income' },
  { pattern: '/income', page: 'income' },

  { pattern: '/expenses/create', page: 'expenses' },
  { pattern: '/expenses/edit/:id', page: 'expenses' },
  { pattern: '/expenses/view/:id', page: 'expenses' },
  { pattern: '/expenses', page: 'expenses' },

  { pattern: '/manual-entries/create', page: 'manual-entries' },
  { pattern: '/manual-entries/edit/:id', page: 'manual-entries' },
  { pattern: '/manual-entries/view/:id', page: 'manual-entries' },
  { pattern: '/manual-entries', page: 'manual-entries' },

  { pattern: '/imported-entries', page: 'imported-entries' },

  // Sprint VS-110 — Inkorgen (kvitto-kö före bokföring)
  { pattern: '/inbox', page: 'inbox' },
]
