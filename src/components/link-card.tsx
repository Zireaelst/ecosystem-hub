import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { EventCover } from '@/components/event-cover'

/** Clickable row card with a square image (event cover) - used by list pages. `icon` replaces the image for things without a cover. `newTab` for external sites. */
export function LinkCard({ href, image, icon: Icon, title, meta, metaClassName, newTab }: { href: string; image: string | null; icon?: LucideIcon; title: string; meta: React.ReactNode; metaClassName?: string; newTab?: boolean }) {
  return (
    <Link href={href} {...(newTab && { target: '_blank', rel: 'noopener noreferrer' })} className="flex items-center gap-4 rounded-xl border border-line bg-surface-2 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-brand hover:shadow-glow">
      {Icon ? (
        <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-brand/40 bg-brand/10"><Icon className="size-6 text-brand" aria-hidden /></span>
      ) : (
        <EventCover src={image} className="size-16 shrink-0 rounded-lg" />
      )}
      <div className="min-w-0">
        <p className="truncate text-fg-heading">{title}</p>
        <p className={`text-sm ${metaClassName ?? 'text-fg-muted'}`}>{meta}</p>
      </div>
      {newTab && <><ArrowUpRight className="ml-auto size-5 shrink-0 text-fg-faint" aria-hidden /><span className="sr-only">(opens in a new tab)</span></>}
    </Link>
  )
}
