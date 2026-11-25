import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getListingForReview } from '@/app/(site)/tooling/_lib/queries'
import { approveProblem, removeProblem, toolHref } from '@/app/(site)/tooling/_lib/rules'
import { BackLink } from '@/components/back-link'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { ProjectVersionView } from '@/components/project-version-view'
import { SectionCard } from '@/components/section-card'
import { StatusPill } from '@/components/status-pill'
import { formatUtc } from '@/lib/dates'
import { requirePermission } from '@/lib/guards'
import { ApproveButton, RejectButton, RemoveButton } from '../_components/review-actions'

export const metadata: Metadata = { title: 'Tooling review' }

/** One label / value row of the status overview. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-fg-body">{children}</dd>
    </div>
  )
}

export default async function ToolingReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('tooling.review')
  const l = await getListingForReview((await params).id)
  if (!l) notFound()
  const seen = { listingId: l.id, approvedVersionId: l.approvedVersionId, pendingVersionId: l.pendingVersionId }
  const archived = !!l.project.archivedAt
  const name = (l.pendingVersion ?? l.newer ?? l.approvedVersion ?? l.project.currentVersion)?.name ?? l.project.slug
  // The versions a reviewer can act on: the submitted one, and a newer one the team saved since.
  const candidates = [
    ...(l.pendingVersion ? [{ v: l.pendingVersion, title: `Waiting for review: version ${l.pendingVersion.number}`, description: `Submitted by ${l.names.submitted} on ${formatUtc(l.submittedAt)}.`, pending: true }] : []),
    ...(l.newer ? [{ v: l.newer, title: `Newer version ${l.newer.number}`, description: 'Saved by the team after the last submission. You can approve it without a resubmit; they agreed to later versions being listed.', pending: false }] : []),
  ]
  return (
    <>
      <BackLink href="/admin/tooling">Tooling</BackLink>
      <PageHeader title={name} description={`/tooling/${l.project.slug}`} />
      <div className="grid gap-6">
        <SectionCard title="Status" actions={!removeProblem(l) && <RemoveButton seen={seen} />}>
          <dl className="divide-y divide-line text-sm">
            {archived && <Row label="Project"><StatusPill tone="danger">Deleted</StatusPill> hidden from /tooling</Row>}
            <Row label="Public list">
              {l.approvedVersion ? (
                <>
                  <StatusPill tone="success">Listed · v{l.approvedVersion.number}</StatusPill>
                  <span>since {formatUtc(l.approvedAt)}</span>
                  {!archived && <Link href={toolHref(l.project)} className="text-fg-heading underline-offset-4 hover:underline">View public page</Link>}
                </>
              ) : l.closedAt ? (
                <>
                  <StatusPill tone={l.closedReason === 'removed' ? 'danger' : 'neutral'}>{l.closedReason === 'removed' ? 'Removed by a reviewer' : 'Withdrawn by the team'}</StatusPill>
                  <span>{l.names.closed ? `by ${l.names.closed}, ` : ''}{formatUtc(l.closedAt)}</span>
                </>
              ) : (
                <StatusPill>Not listed</StatusPill>
              )}
            </Row>
            <Row label="In review">
              {l.pendingVersion ? (
                <>
                  <StatusPill tone="info">v{l.pendingVersion.number}</StatusPill>
                  <span>submitted by {l.names.submitted}, {formatUtc(l.submittedAt)}</span>
                </>
              ) : (
                <span className="text-fg-muted">Nothing waiting</span>
              )}
            </Row>
            {l.newer && (
              <Row label="Newer version">
                <StatusPill tone="warning">v{l.newer.number}</StatusPill>
                <span>saved since the last submission</span>
              </Row>
            )}
          </dl>
        </SectionCard>

        <SectionCard title="History" description="Everything that happened to this listing, newest first. Times in UTC.">
          <DataTable
            id="admin-tooling-history"
            empty="No history yet."
            columns={[
              { key: 'at', label: 'When', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap', hideable: false },
              { key: 'event', label: 'Event', hideable: false },
              { key: 'version', label: 'Version', className: 'whitespace-nowrap' },
              { key: 'by', label: 'By' },
              { key: 'reason', label: 'Reason' },
            ]}
            rows={l.history.map((e) => ({
              id: e.id,
              sort: { at: e.at.toISOString(), version: e.number },
              cells: {
                at: formatUtc(e.at),
                event: e.event,
                version: e.number ? `v${e.number}` : '-',
                by: e.by,
                reason: e.reason ? <>“{e.reason}” <span className="text-fg-faint">({e.internal ? 'internal' : 'shared with the team'})</span></> : '',
              },
            }))}
          />
        </SectionCard>

        {candidates.map(({ v, title, description, pending }) => {
          const problem = approveProblem(l, v, archived)
          return (
            <SectionCard key={v.id} title={title} description={description}>
              {problem && <p className="mb-4 text-sm text-warning">Can’t approve: {problem}</p>}
              <div className="mb-8 flex flex-wrap gap-2">
                {!problem && <ApproveButton seen={seen} versionId={v.id} number={v.number} />}
                {pending && <RejectButton seen={seen} number={v.number} />}
              </div>
              <ProjectVersionView version={v} hideCountry />
            </SectionCard>
          )
        })}
        {l.approvedVersion && (
          <SectionCard title={`Listed version ${l.approvedVersion.number}`}>
            <details>
              <summary className="cursor-pointer text-sm text-fg-muted">Show this version</summary>
              <div className="mt-6"><ProjectVersionView version={l.approvedVersion} hideCountry /></div>
            </details>
          </SectionCard>
        )}
      </div>
    </>
  )
}
