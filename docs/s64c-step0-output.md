# S64c — Steg 0 Output

## 1. S64c-baseline-commit-hash

`aaf17570e314e4e348e9346010b596a8ea4e494c`

## 2. Testantal före

1251 passed (2 skipped).

## 3. use-entity-form.ts verifierad

Utfall A: 157 rader, 3 exports, dirtyRef + initialStateRef finns,
IpcError-hantering vid rad 121–125. Oförändrad sedan audit.

## 4. IpcError full typ-definition

Fil: `src/renderer/lib/ipc-helpers.ts`

```typescript
export class IpcError extends Error {
  code: ErrorCode
  field?: string

  constructor(message: string, code: ErrorCode, field?: string) {
    super(message)
    this.name = 'IpcError'
    this.code = code
    this.field = field
  }
}
```

Konstruktor: `new IpcError(message, code, field?)`. `field` är optional.

## 5. renderHook tillgänglig

Ja. `@testing-library/react@16.3.2`, `renderHook` exporterad.

## 6. Befintlig testfil

`tests/use-entity-form.test.ts` existerar med 12 tester. Följer inte
path-konventionen (`tests/renderer/lib/...`). Supersedes av ny fil.
Justerad räkning: 1251 − 12 + 22 = **1261**.

## 7. git status

Clean.

---
Steg 0 klar.
