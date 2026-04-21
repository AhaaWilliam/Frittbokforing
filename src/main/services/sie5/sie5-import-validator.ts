/**
 * SIE5 import validator.
 *
 * Spegling av SIE4-validatorn — återanvänder
 * `validateSieParseResult` och `detectAccountConflicts` eftersom
 * `parseSie5` returnerar samma `SieParseResult`-struktur (M145-paritet).
 *
 * Separat export-modul för framtida SIE5-specifika regler (t.ex. schema-
 * validering mot sie5.xsd). I nuläget är den en ren re-export.
 */
export {
  validateSieParseResult as validateSie5ParseResult,
  detectAccountConflicts as detectSie5AccountConflicts,
  type SieValidationResult,
  type AccountConflict,
} from '../sie4/sie4-import-validator'
