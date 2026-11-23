import type { Metadata } from 'next'
import Link from 'next/link'
import { listListingsForReview, REVIEW_FILTERS, type ReviewFilter } from '@/app/(site)/tooling/_lib/queries'
import { approveProblem, currentRejection } from '@/app/(site)/tooling/_lib/rules'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { requirePermission } from '@/lib/guards'
import { pageParam, textParam } from '@/lib/params'

export const metadata: Metadata = { title: 'Tooling' }

type Row = Awaited<ReturnType<typeof listListingsForReview>>['rows'][number]

const FILTER_LABELS: Record<ReviewFilter, string> = { all: 'All', review: 'To review', listed: 'Listed', closed: 'Off the list' }
const filterParam = (v: string | string[] | undefined): ReviewFilter => (REVIEW_FILTERS as readonly string[]).includes(textParam(v) ?? '') ? (textParam(v) as ReviewFilter) : 'all'

/** A newer version the reviewer can approve right now (one that fails the checks waits for the team, not the reviewer). */
const approvableNewer = (r: Row) => !!r.newer && !approveProblem(r, r.newer, !!r.project.archivedAt)

function Status({ r }: { r: Row }) {
  if (r.project.archivedAt) return <StatusPill tone="danger">Project deleted</StatusPill>
  if (r.closedAt) return <StatusPill>{r.closedReason === 'removed' ? 'Removed' : 'Withdrawn'}</StatusPill>
  return (
    <span className="flex flex-wrap gap-1.5">
      {r.pendingVersion && <StatusPill tone="info">To review · v{r.pendingVersion.number}</StatusPill>}
      {r.newer && (approvableNewer(r)
        ? <StatusPill tone="warning">Newer · v{r.newer.number}</StatusPill>
        : <StatusPill tone={r.newer.maturity === 'archived' ? 'danger' : 'neutral'}>Newer · v{r.newer.number} · {r.newer.maturity === 'archived' ? 'archived' : 'can’t approve'}</StatusPill>)}
      {r.approvedVersion && <StatusPill tone="success">Listed · v{r.approvedVersion.number}</StatusPill>}
      {currentRejection(r) && <StatusPill tone="warning">Rejected</StatusPill>}
    </span>
  )
}

export default async function ToolingAdminPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[]; status?: string | string[] }> }) {
  await requirePermission('tooling.review')
  const sp = await searchParams
  const q = textParam(sp.q)
  const filter = filterParam(sp.status)
  const page = pageParam(sp.page)
  const { rows, hasMore } = await listListingsForReview({ q, filter, page })
  const href = (f: ReviewFilter) => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (f !== 'all') p.set('status', f)
    return p.size ? `/admin/tooling?${p}` : '/admin/tooling'
  }
  return (
    <>
      <PageHeader title="Tooling" description="Projects submitted to the Developer Tooling list. Only approved versions are shown on /tooling. “To review” lists submissions; a newer saved version you can approve directly shows as “Newer” under All and Listed." />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((f) => (
          <Button key={f} asChild variant={f === filter ? 'default' : 'outline'}>
            <Link href={href(f)} aria-current={f === filter ? 'true' : undefined}>{FILTER_LABELS[f]}</Link>
          </Button>
        ))}
      </nav>
      <SearchForm q={q} placeholder="Search project name" keep={filter === 'all' ? undefined : { status: filter }} />
      <DataTable
        id="admin-tooling"
        empty={q || filter !== 'all' ? 'No listings found.' : 'No submissions yet.'}
        columns={[
          { key: 'name', label: 'Project', hideable: false },
          { key: 'status', label: 'Status' },
          { key: 'updated', label: 'Updated', className: 'whitespace-nowrap' },
        ]}
        rows={rows.map((r) => ({
          id: r.id,
          cells: {
            name: <Link href={`/admin/tooling/${r.id}`} className="text-fg-heading hover:underline">{r.project.currentVersion?.name ?? r.project.slug}</Link>,
            status: <Status r={r} />,
            updated: r.updatedAt.toISOString().slice(0, 10),
          },
        }))}
      />
      <Pager page={page} hasMore={hasMore} params={{ q, status: filter === 'all' ? undefined : filter }} />
    </>
  )
}
