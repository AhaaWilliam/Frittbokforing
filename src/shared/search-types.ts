export type SearchResultType =
  | 'invoice'
  | 'expense'
  | 'customer'
  | 'supplier'
  | 'product'
  | 'account'
  | 'journal_entry'

export interface SearchResult {
  type: SearchResultType
  identifier: string
  title: string
  subtitle: string
  route: string
}

export interface GlobalSearchResponse {
  results: SearchResult[]
  total_count: number
}
