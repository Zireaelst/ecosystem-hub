import type { Metadata } from 'next'
import { Info } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { JOBS } from '@/lib/jobs'
import { RefreshButton, RunNowButton } from './_components/run-now-button'

export const metadata: Metadata = { title: 'Jobs' }

const STATUS_CLASS: Record<string, string> = {
  success: 'bg-success/15 text-success',
  partial: 'bg-warning/15 text-warning',
  failed: 'bg-destructive/15 text-destructive',
  running: 'bg-info/15 text-info',
}

function Status({ status }: { status: string }) {
  return <Badge className={`rounded-full border-0 ${STATUS_CLASS[status] ?? ''}`}>{status}</Badge>
}

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '-')

export default async function JobsPage() {
  await requireSuperAdmin()
  const runs = await prisma.jobRun.findMany({ orderBy: { startedAt: 'desc' }, take: 50 })
  const last = new Map<string, (typeof runs)[number]>()
  for (const r of runs) if (!last.has(r.job)) last.set(r.job, r)

  return (
    <>
      <PageHeader title="Jobs" description="Scheduled background jobs, run by the worker service. Times in UTC.">
        <RefreshButton />
      </PageHeader>
      <div className="mb-12">
        <DataTable
          id="admin-jobs"
          columns={[
            { key: 'job', label: 'Job', sortable: true, hideable: false },
            { key: 'cron', label: 'Schedule' },
            { key: 'last', label: 'Last run', sortable: true, firstDir: 'desc' },
            { key: 'actions', label: '', hideable: false, className: 'text-right' },
          ]}
          rows={JOBS.map((job) => {
            const r = last.get(job.name)
            return {
              id: job.name,
              sort: { job: job.name, last: r?.startedAt.getTime() },
              cells: {
                job: (
                  <span className="flex items-center gap-1.5 text-fg-heading">
                    {job.name}
                    <span title={job.description} aria-label={job.description} role="img" className="cursor-help text-fg-faint hover:text-fg-muted">
                      <Info className="size-3.5" aria-hidden />
                    </span>
                  </span>
                ),
                cron: <code>{job.cron}</code>,
                last: r ? <span className="flex items-center gap-2"><Status status={r.status} /> {fmt(r.startedAt)}</span> : <span className="text-fg-faint">never</span>,
                actions: <RunNowButton name={job.name} />,
              },
            }
          })}
        />
      </div>

      <h2 className="mb-3 text-lg">Recent runs</h2>
      <DataTable
        id="admin-job-runs"
        empty="No runs yet."
        columns={[
          { key: 'job', label: 'Job', sortable: true, hideable: false },
          { key: 'status', label: 'Status', sortable: true },
          { key: 'started', label: 'Started', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'finished', label: 'Finished', sortable: true, firstDir: 'desc', className: 'whitespace-nowrap' },
          { key: 'summary', label: 'Summary' },
        ]}
        rows={runs.map((r) => ({
          id: r.id,
          className: 'align-top',
          sort: { job: r.job, status: r.status, started: r.startedAt.getTime(), finished: r.finishedAt?.getTime() },
          cells: {
            job: r.job,
            status: <Status status={r.status} />,
            started: fmt(r.startedAt),
            finished: fmt(r.finishedAt),
            summary: r.summary != null && (
              <details>
                <summary className="cursor-pointer text-sm text-fg-muted">Show</summary>
                <pre className="mt-2 max-w-md overflow-x-auto text-xs">{JSON.stringify(r.summary, null, 2)}</pre>
              </details>
            ),
          },
        }))}
      />
    </>
  )
}
