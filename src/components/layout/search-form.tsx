'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { searchHref } from '@/lib/search-navigation'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 300

/**
 * Search box for `?q=` (the page reads it server-side). Searches as you type (after a short pause) and on Enter;
 * without JS it is a plain GET form. Back to page 1 on every search. `keep` = other params to carry along (e.g. a filter).
 * With filters, put both in one wrapping row: `<div className="mb-4 flex flex-wrap items-center gap-3">` + `className="mb-0 flex-1 basis-56"`.
 */
export function SearchForm({ q, placeholder, keep, className }: { q?: string; placeholder: string; keep?: Record<string, string>; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const sent = useRef(q ?? '')

  // Navigation from elsewhere (a "clear" link, back/forward) changes `q`: show it instead of stale text.
  useEffect(() => {
    if ((q ?? '') !== sent.current && input.current) input.current.value = q ?? ''
    sent.current = q ?? ''
  }, [q])
  useEffect(() => () => clearTimeout(timer.current), [])

  function search(value: string, submittedFrom?: string) {
    clearTimeout(timer.current)
    const v = value.trim()
    const href = searchHref(pathname, keep, v, sent.current, submittedFrom)
    if (href === null) return
    sent.current = v
    startTransition(() => router.replace(href, { scroll: false }))
  }

  const Icon = pending ? LoaderCircle : Search
  return (
    <form role="search" className={cn('relative mb-4 max-w-sm', className)} onSubmit={(e) => { e.preventDefault(); search(input.current?.value ?? '', window.location.search) }}>
      {keep && Object.entries(keep).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Icon className={cn('pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-faint', pending && 'animate-spin')} aria-hidden />
      <Input
        ref={input}
        name="q"
        type="search"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 pl-9"
        onChange={(e) => { const v = e.target.value; clearTimeout(timer.current); timer.current = setTimeout(() => search(v), DEBOUNCE_MS) }}
      />
    </form>
  )
}
