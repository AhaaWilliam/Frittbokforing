/**
 * Barrel-export: alla Zod-scheman lever nu i src/shared/ipc-schemas.ts
 * så att både main och renderer kan importera dem.
 *
 * Main-process filer importerar fortfarande från './ipc-schemas' eller '../ipc-schemas'
 * — denna fil vidarebefordrar allt.
 */
export * from '../shared/ipc-schemas'
