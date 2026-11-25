import type { Metadata } from 'next'
import { DataTable } from '@/components/data-table'
import { FilterChip } from '@/components/filter-chip'
import { PageHeader } from '@/components/layout/page-header'
import { SearchForm } from '@/components/layout/search-form'
import { Pager } from '@/components/layout/pager'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'

export const metadata: Metadata = { title: 'Audit log' }

const PAGE_SIZE = 100

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; type?: string | string[]; page?: string | string[] }> }) {
  await requireSuperAdmin()
  const sp = await searchParams
  const type = textParam(sp.type)
  const q = textParam(sp.q)
  const i = { contains: q, mode: 'insensitive' as const }
  // ponytail: unindexed ILIKE over the log - fine at this size; add a trigram index if the log grows into millions.
  const search = q ? { OR: [{ action: i }, { entityType: i }, { entityId: i }, { actor: { is: { OR: [{ name: i }, { email: i }] } } }] } : {}
  const page = pageParam(sp.page)
  const [rows, types] = await Promise.all([
    prisma.auditLog.findMany({
      where: { AND: [type ? { entityType: type } : {}, search] },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE + 1,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
  ])
  const entries = rows.slice(0, PAGE_SIZE)
  return (
    <>
      <PageHeader title="Audit log" description="Every state-changing admin action." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchForm q={q} placeholder="Search action, ID or person" keep={type ? { type } : undefined} className="mb-0 flex-1 basis-56" />
        <nav aria-label="Filter by type" className="flex flex-wrap gap-2">
          <FilterChip href={q ? `/admin/audit?${new URLSearchParams({ q })}` : '/admin/audit'} active={!type}>All</FilterChip>
          {types.map(({ entityType }) => <FilterChip key={entityType} href={`/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), type: entityType })}`} active={type === entityType}>{entityType}</FilterChip>)}
        </nav>
      </div>
      {/* Newest first; not sortable - the log is paginated by time. */}
      <DataTable
        id="admin-audit"
        empty={q || type ? 'No entries found.' : 'Nothing logged yet.'}
        columns={[
          { key: 'when', label: 'When (UTC)', hideable: false, className: 'whitespace-nowrap' },
          { key: 'who', label: 'Who' },
          { key: 'action', label: 'Action' },
          { key: 'change', label: 'Change' },
        ]}
        rows={entries.map((e) => ({
          id: e.id,
          className: 'align-top',
          cells: {
            when: e.createdAt.toISOString().slice(0, 16).replace('T', ' '),
            who: e.actor ? e.actor.name : <span className="text-fg-faint">system</span>,
            action: (
              <>
                <code>{e.action}</code>
                <div className="text-xs text-fg-faint">{e.entityType}{e.entityId ? ` · ${e.entityId}` : ''}</div>
              </>
            ),
            change: (e.before != null || e.after != null) && (
              <details>
                <summary className="cursor-pointer text-sm text-fg-muted">Show</summary>
                <pre className="mt-2 max-w-md overflow-x-auto text-xs">{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
              </details>
            ),
          },
        }))}
      />
      <Pager page={page} hasMore={rows.length > PAGE_SIZE} params={{ q, type }} />
    </>
  )
}
