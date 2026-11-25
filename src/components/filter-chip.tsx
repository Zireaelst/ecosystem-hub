import Link from 'next/link'
import { cn } from '@/lib/utils'

/** A filter link in a list toolbar (the filter lives in the URL; active = the current one). Sits next to `SearchForm`. */
export function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'true' : undefined} className={cn('inline-flex min-h-11 items-center rounded-full border px-4 text-sm', active ? 'border-brand bg-brand/10 text-fg-heading' : 'border-line text-fg-muted hover:border-fg-faint')}>
      {children}
    </Link>
  )
}
