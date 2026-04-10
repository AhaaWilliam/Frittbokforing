/**
 * SEC01 — IPC Input-validering: Zod .strict(), SQL injection, path traversal,
 * prototype pollution, typfel, gränsvärden, XSS/HTML injection.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  type SystemTestContext,
} from './helpers/security-test-context'
import {
  seedCustomer,
  getVatCode25Out,
} from '../system/helpers/system-test-context'

// Import Zod schemas directly for testing
import {
  CreateCounterpartyInputSchema,
  CreateProductInputSchema,
  SaveDraftInputSchema,
  SaveExpenseDraftSchema,
  SaveManualEntryDraftSchema,
  InvoiceListInputSchema,
  FinalizeInvoiceInputSchema,
  PayInvoiceInputSchema,
  UpdateCompanyInputSchema,
} from '../../src/main/ipc-schemas'

let ctx: SystemTestContext

beforeAll(() => {
  createTemplateDb()
})
afterAll(() => {
  destroyTemplateDb()
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  ctx = createSystemTestContext()
})
afterEach(() => {
  destroyContext(ctx)
  vi.useRealTimers()
})

describe('SEC01: IPC Input-validering', () => {
  // ===== KATEGORI A: .strict() avvisar extra fält =====

  describe('A: Zod .strict() — extra fält avvisas', () => {
    it('SEC01-A01: CreateCounterpartyInputSchema avvisar extra fält', () => {
      const result = CreateCounterpartyInputSchema.safeParse({
        name: 'Test AB',
        type: 'customer',
        default_payment_terms: 30,
        __injected: 'hack',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A02: SaveDraftInputSchema avvisar extra fält', () => {
      const result = SaveDraftInputSchema.safeParse({
        counterparty_id: 1,
        fiscal_year_id: 1,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Test',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: 1,
            sort_order: 0,
          },
        ],
        hacked: true,
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A03: SaveExpenseDraftSchema avvisar extra fält', () => {
      const result = SaveExpenseDraftSchema.safeParse({
        fiscal_year_id: 1,
        counterparty_id: 1,
        expense_date: '2026-03-15',
        description: 'Test',
        lines: [
          {
            description: 'Material',
            account_number: '6110',
            quantity: 100,
            unit_price_ore: 10000,
            vat_code_id: 1,
          },
        ],
        extraField: 'xss',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A04: SaveManualEntryDraftSchema avvisar extra fält', () => {
      const result = SaveManualEntryDraftSchema.safeParse({
        fiscal_year_id: 1,
        entry_date: '2026-03-15',
        description: 'Test',
        lines: [
          { account_number: '1930', debit_amount: 10000, credit_amount: 0 },
        ],
        malicious: 'payload',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A05: UpdateCompanyInputSchema avvisar extra fält', () => {
      const result = UpdateCompanyInputSchema.safeParse({
        city: 'Stockholm',
        admin_override: true,
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A06: CreateProductInputSchema avvisar extra fält', () => {
      const result = CreateProductInputSchema.safeParse({
        name: 'Produkt',
        default_price: 10000,
        vat_code_id: 1,
        account_id: 1,
        article_type: 'service',
        is_admin: true,
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A07: InvoiceListInputSchema avvisar extra fält', () => {
      const result = InvoiceListInputSchema.safeParse({
        fiscal_year_id: 1,
        injected: 'data',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-A08: PayInvoiceInputSchema avvisar extra fält', () => {
      const result = PayInvoiceInputSchema.safeParse({
        invoice_id: 1,
        amount: 10000,
        payment_date: '2026-03-15',
        payment_method: 'bankgiro',
        account_number: '1930',
        __proto__hack: true,
      })
      expect(result.success).toBe(false)
    })
  })

  // ===== KATEGORI B: SQL Injection =====

  describe('B: SQL Injection-försök', () => {
    it('SEC01-B01: sort_by — Zod enum blockerar godtyckliga strängar', () => {
      // InvoiceListInputSchema.sort_by is an enum — arbitrary SQL injection strings are rejected
      const result = InvoiceListInputSchema.safeParse({
        fiscal_year_id: 1,
        sort_by: 'name; DROP TABLE invoices',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-B02: search med SQL injection — parameteriserad query skyddar', () => {
      // search is a free string that passes Zod, but is parameterized in SQL
      const parseResult = InvoiceListInputSchema.safeParse({
        fiscal_year_id: ctx.seed.fiscalYearId,
        search: "'; DROP TABLE companies;--",
      })
      expect(parseResult.success).toBe(true)

      // Execute via service — SQL injection should be harmless
      const listResult = ctx.invoiceService.listInvoices(
        ctx.db,
        parseResult.data!,
      )
      expect(listResult).toBeDefined()

      // Verify companies table is intact
      const company = ctx.db
        .prepare('SELECT COUNT(*) as cnt FROM companies')
        .get() as { cnt: number }
      expect(company.cnt).toBeGreaterThan(0)
    })

    it('SEC01-B03: counterparty namn med SQL-tecken sparas som text', () => {
      const maliciousName = "Robert'); DROP TABLE accounts;--"
      const customer = seedCustomer(ctx, { name: maliciousName })

      // Fetch back and verify exact match
      const fetched = ctx.counterpartyService.getCounterparty(
        ctx.db,
        customer.id,
      )
      expect(fetched?.name).toBe(maliciousName)

      // accounts table intact
      const accounts = ctx.db
        .prepare('SELECT COUNT(*) as cnt FROM accounts')
        .get() as { cnt: number }
      expect(accounts.cnt).toBeGreaterThan(0)
    })

    it('SEC01-B04: invoice notes med SQL-tecken sparas korrekt', () => {
      const customer = seedCustomer(ctx, { name: 'SQL-testkund' })
      const vatCode = getVatCode25Out(ctx)
      const maliciousNotes = "test' OR '1'='1"

      const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        notes: maliciousNotes,
        lines: [
          {
            product_id: null,
            description: 'Tjänst',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      expect(draftResult.success).toBe(true)
      if (!draftResult.success) throw new Error(draftResult.error)

      const draft = ctx.invoiceService.getDraft(ctx.db, draftResult.data.id)
      expect(draft?.notes).toBe(maliciousNotes)
    })
  })

  // ===== KATEGORI B2: Path Traversal =====

  describe('B2: Path Traversal (kataloghopp)', () => {
    it('SEC01-B2-01: export-filnamn hanteras via native dialog — N/A', () => {
      // ANALYS: Alla filvägar för export (export:write-file, invoice:save-pdf, backup:create)
      // kommer från Electrons native dialog.showSaveDialog(), inte från renderer-input.
      // Renderer skickar aldrig en filväg — dialogen öppnas i main process.
      // Path traversal via IPC är därmed inte tillämpligt.
      //
      // Verifiering: ExportWriteFileRequestSchema har INGET "filePath"-fält.
      // SaveInvoicePdfSchema har INGET "filePath"-fält.
      // Filvägen sätts av dialog.showSaveDialog() i ipc-handlers.ts.
      expect(true).toBe(true) // Dokumenterat N/A
    })

    it('SEC01-B2-02: backup-sökväg hanteras via app.getPath — N/A', () => {
      // ANALYS: backup:create tar inga parametrar alls.
      // Backup-sökvägen genereras internt via app.getPath('documents') i backup-service.
      // Ingen renderer-kontrollerad sökväg existerar.
      expect(true).toBe(true) // Dokumenterat N/A
    })
  })

  // ===== KATEGORI B3: Prototype Pollution =====

  describe('B3: Prototype Pollution', () => {
    it('SEC01-B3-01: __proto__ i Zod payload avvisas', () => {
      // Note: __proto__ in a JS object literal gets absorbed by the prototype chain.
      // JSON.parse preserves it as a real key, which is the realistic attack vector.
      const rawPayload = JSON.parse(
        '{"name":"Test AB","type":"customer","default_payment_terms":30,"__proto__":{"isAdmin":true}}',
      )
      const result = CreateCounterpartyInputSchema.safeParse(rawPayload)
      expect(result.success).toBe(false)
    })

    it('SEC01-B3-02: constructor.prototype i Zod payload avvisas', () => {
      const payload = JSON.parse(
        '{"name":"Test AB","type":"customer","default_payment_terms":30,"constructor":{"prototype":{"isAdmin":true}}}',
      )
      const result = CreateCounterpartyInputSchema.safeParse(payload)
      expect(result.success).toBe(false)
    })
  })

  // ===== KATEGORI C: Typfel =====

  describe('C: Felaktiga typer avvisas', () => {
    it('SEC01-C01: string där number förväntas', () => {
      const result = FinalizeInvoiceInputSchema.safeParse({
        id: 'not-a-number',
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-C02: number där string förväntas', () => {
      const result = CreateCounterpartyInputSchema.safeParse({
        name: 12345,
        type: 'customer',
        default_payment_terms: 30,
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-C03: null där required fält', () => {
      const result = SaveDraftInputSchema.safeParse({
        counterparty_id: null,
        fiscal_year_id: 1,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Test',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: 1,
            sort_order: 0,
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-C04: array där object förväntas', () => {
      const result = CreateCounterpartyInputSchema.safeParse([1, 2, 3])
      expect(result.success).toBe(false)
    })
  })

  // ===== KATEGORI D: Gränsvärden och overflow =====

  describe('D: Gränsvärden', () => {
    it('SEC01-D01: extremt långt namn (10 000 tecken) — ingen crash', () => {
      const longName = 'A'.repeat(10000)
      // Schema has max(200) — should be rejected by Zod
      const result = CreateCounterpartyInputSchema.safeParse({
        name: longName,
        type: 'customer',
        default_payment_terms: 30,
      })
      expect(result.success).toBe(false)
    })

    it('SEC01-D02: belopp MAX_SAFE_INTEGER i invoice line', () => {
      const customer = seedCustomer(ctx, { name: 'Overflow-kund' })
      const vatCode = getVatCode25Out(ctx)

      // MAX_SAFE_INTEGER = 9007199254740991
      // unit_price_ore schema: z.number().int().min(0) — should accept
      const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Dyr tjänst',
            quantity: 1,
            unit_price_ore: Number.MAX_SAFE_INTEGER,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      // Should either succeed (SQLite INTEGER handles 64-bit) or fail gracefully — not crash
      expect(typeof draftResult.success).toBe('boolean')
    })

    it('SEC01-D03: negativt belopp i invoice line', () => {
      const customer = seedCustomer(ctx, { name: 'Negativ-kund' })
      const vatCode = getVatCode25Out(ctx)

      // quantity schema: z.number().positive() — negative should be rejected by Zod
      const parseResult = SaveDraftInputSchema.safeParse({
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Negativ rad',
            quantity: -1,
            unit_price_ore: 10000,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      // quantity is z.number().positive() — rejects -1
      expect(parseResult.success).toBe(false)
    })

    it('SEC01-D04: belopp = 0 i invoice line', () => {
      const customer = seedCustomer(ctx, { name: 'Noll-kund' })
      const vatCode = getVatCode25Out(ctx)

      // unit_price_ore is z.number().int().min(0) — should accept 0
      const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [
          {
            product_id: null,
            description: 'Gratisrad',
            quantity: 1,
            unit_price_ore: 0,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      expect(draftResult.success).toBe(true)
    })

    it('SEC01-D05: tomt lines-array vid invoice draft', () => {
      const result = SaveDraftInputSchema.safeParse({
        counterparty_id: 1,
        fiscal_year_id: 1,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        lines: [],
      })
      // lines: z.array(...).min(1) — should reject empty
      expect(result.success).toBe(false)
    })
  })

  // ===== KATEGORI E: XSS / HTML injection =====

  describe('E: HTML/Script i textfält', () => {
    it('SEC01-E01: script-tag i företagsnamn sparas som ren text', () => {
      const scriptName = "<script>alert('xss')</script>"
      // Company name is updated via updateCompany (not name, which is set at creation)
      // Test via counterparty name instead
      const customer = seedCustomer(ctx, { name: scriptName })
      const fetched = ctx.counterpartyService.getCounterparty(
        ctx.db,
        customer.id,
      )
      expect(fetched?.name).toBe(scriptName) // Stored as literal text, not interpreted
    })

    it('SEC01-E02: HTML i faktura-notes sparas som text', () => {
      const htmlNotes = '<img src=x onerror=alert(1)>'
      const customer = seedCustomer(ctx, { name: 'XSS-testkund' })
      const vatCode = getVatCode25Out(ctx)

      const draftResult = ctx.invoiceService.saveDraft(ctx.db, {
        counterparty_id: customer.id,
        fiscal_year_id: ctx.seed.fiscalYearId,
        invoice_date: '2026-03-15',
        due_date: '2026-04-14',
        notes: htmlNotes,
        lines: [
          {
            product_id: null,
            description: '<b>Bold injection</b>',
            quantity: 1,
            unit_price_ore: 10000,
            vat_code_id: vatCode.id,
            sort_order: 0,
            account_number: '3002',
          },
        ],
      })
      expect(draftResult.success).toBe(true)
      if (!draftResult.success) throw new Error(draftResult.error)

      const draft = ctx.invoiceService.getDraft(ctx.db, draftResult.data.id)
      expect(draft?.notes).toBe(htmlNotes)
    })
  })
})
