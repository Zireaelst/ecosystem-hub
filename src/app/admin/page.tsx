import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, CircleCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { requireUser } from '@/lib/guards'
import { holdsAny } from '@/lib/permissions'
import { loadOverview } from './_lib/overview'

const num = new Intl.NumberFormat('en-US')

export default async function AdminHome() {
  const user = await requireUser()
  if (!holdsAny(user)) notFound()
  // Each area's numbers and to-dos, only those `user` has the permission for.
  const { groups, todos } = await loadOverview(user)
  return (
    <>
      <PageHeader title="Overview" description="What needs attention and how things are going, for the areas you have access to." />
      <div className="grid gap-10">
        <section aria-labelledby="admin-open">
          <h2 id="admin-open" className="mb-4 text-lg">Open</h2>
          {todos.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {todos.map((t) => (
                <li key={t.label}>
                  <Link href={t.href} className="group flex min-h-11 items-center gap-4 rounded-xl border border-warning/40 bg-warning/10 p-4 transition-colors hover:border-warning">
                    <span className="text-2xl text-fg-heading tabular-nums">{num.format(t.count)}</span>
                    <span className="flex-1 text-sm text-fg-body">{t.label}<span className="block text-xs text-fg-faint">{t.group}</span></span>
                    <ArrowRight className="size-4 text-fg-faint transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-fg-muted"><CircleCheck className="size-4 text-success" aria-hidden /> Nothing open.</p>
          )}
        </section>
        {groups.length > 0 && (
          <section aria-labelledby="admin-numbers">
            <h2 id="admin-numbers" className="mb-4 text-lg">Numbers</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label} className="rounded-xl border border-line bg-surface-2">
                  <h3 className="border-b border-line px-5 py-3 text-sm text-fg-muted">{g.label}</h3>
                  {/* Numbers side by side, split by hairlines - no boxes inside the card. */}
                  <ul className="grid divide-y divide-line sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
                    {g.stats.map((s) => {
                      const body = (
                        <>
                          <span className="block text-3xl font-medium text-fg-heading tabular-nums transition-colors group-hover:text-brand">{num.format(s.value)}</span>
                          <span className="mt-1 block text-sm text-fg-body">{s.label}</span>
                          {s.hint && <span className="block text-xs text-fg-faint">{s.hint}</span>}
                        </>
                      )
                      return (
                        <li key={s.label}>
                          {s.href ? <Link href={s.href} className="group block h-full px-5 py-4">{body}</Link> : <div className="px-5 py-4">{body}</div>}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
