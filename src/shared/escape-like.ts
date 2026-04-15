/**
 * Escape SQL LIKE wildcards so %, _ and the escape char itself
 * are matched literally. Use with ESCAPE '!' in SQL.
 */
export const LIKE_ESCAPE_CHAR = '!'

export function escapeLikePattern(s: string): string {
  return s.replace(/[!%_]/g, '!$&')
}
