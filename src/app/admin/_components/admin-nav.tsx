'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { activeAdminHref } from '../_lib/active'

/** The visible nav groups, icons already rendered (functions can't cross into a client component). */
export type NavGroup = { label?: string; items: { href: string; label: string; icon: React.ReactNode }[] }

/** Grouped admin links. The page's own entry gets the brand bar, fill and icon colour. */
export function AdminNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = activeAdminHref(groups.flatMap((g) => g.items.map((i) => i.href)), pathname)
  return (
    <nav aria-label="Admin" className="grid gap-5">
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} role={g.label ? 'group' : undefined} aria-label={g.label}>
          {g.label && <p aria-hidden className="px-3 pb-1.5 text-xs font-medium text-fg-faint">{g.label}</p>}
          <ul className="grid gap-0.5">
            {g.items.map((i) => {
              const current = i.href === active
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg-heading [&_svg]:size-4 [&_svg]:shrink-0',
                      current && 'bg-surface-hover text-fg-heading [&_svg]:text-brand before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-brand',
                    )}
                  >
                    {i.icon}
                    <span className="truncate">{i.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Below `lg`: an "Admin menu" button (the site header keeps its own menu) that opens the same nav in a left drawer, closed by following a link. */
export function AdminNavDrawer({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 gap-2"><PanelLeft aria-hidden /> Admin menu</Button>
      </SheetTrigger>
      <SheetContent side="left" showCloseButton={false} className="w-72 gap-0 border-line bg-surface-1 p-0">
        <SheetTitle className="sr-only">Admin menu</SheetTitle>
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line pr-2 pl-5">
          <p className="font-heading text-lg font-medium text-fg-heading">Admin</p>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="Close admin menu"><X aria-hidden /></Button>
          </SheetClose>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4"><AdminNav groups={groups} onNavigate={() => setOpen(false)} /></div>
      </SheetContent>
    </Sheet>
  )
}
