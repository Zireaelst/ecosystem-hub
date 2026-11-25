import type { Metadata } from 'next'
import { SiteHeader } from '@/components/layout/site-header'
import { envProblems } from '@/lib/env'
import { denyAccess, denyContext, requireUser } from '@/lib/guards'
import { holdsAny } from '@/lib/permissions'
import { AdminNav, AdminNavDrawer, type NavGroup } from './_components/admin-nav'
import { visibleAdminNav } from './_lib/nav'

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Admin · team1 Ecosystem Hub' }, robots: { index: false } }

/** Admin shell: the site header on top, then the page container with a sticky grouped sidebar (a drawer below `lg`). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!holdsAny(user)) denyAccess(user, await denyContext())
  const groups: NavGroup[] = visibleAdminNav(user).map((g) => ({ label: g.label, items: g.items.map(({ href, label, icon: Icon }) => ({ href, label, icon: <Icon aria-hidden /> })) }))
  // Variable names only, never values.
  const envIssues = user.isSuperAdmin ? envProblems(process.env) : []
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <div className="container-page flex flex-1 flex-col py-4 lg:flex-row lg:gap-10 lg:py-10">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-26 max-h-[calc(100dvh-8rem)] overflow-y-auto">
            <p className="mb-4 px-3 font-heading text-lg font-medium text-fg-heading">Admin</p>
            <AdminNav groups={groups} />
          </div>
        </aside>
        <div className="mb-4 border-b border-line pb-3 lg:hidden"><AdminNavDrawer groups={groups} /></div>
        <main className="min-w-0 flex-1">
          {envIssues.length > 0 && (
            <div role="status" className="mb-6 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
              <p className="text-fg-heading">Server environment needs attention (only super admins see this):</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">{envIssues.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  )
}
