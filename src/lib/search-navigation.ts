import { pageParam } from './params'

/** Only an explicit submit from a later page should repeat an unchanged search. */
export function searchHref(pathname: string, keep: Record<string, string> | undefined, query: string, lastQuery: string, submittedFrom?: string): string | null {
  if (query === lastQuery && (!submittedFrom || pageParam(new URLSearchParams(submittedFrom).get('page') ?? undefined) === 1)) return null
  const params = new URLSearchParams(keep)
  if (query) params.set('q', query)
  return params.size ? `${pathname}?${params}` : pathname
}
