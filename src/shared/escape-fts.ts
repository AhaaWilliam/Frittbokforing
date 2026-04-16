/**
 * Escape FTS5 special characters for safe MATCH queries.
 * FTS5 treats " as phrase delimiter — escape by doubling.
 */
export function escapeFtsQuery(query: string): string {
  return query.replace(/"/g, '""')
}
