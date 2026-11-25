import type { Metadata } from 'next'
import { PageHeader } from '@/components/layout/page-header'
import { StatusPill } from '@/components/status-pill'
import { prisma } from '@/lib/db'
import { FLAGS, type Flag } from '@/lib/flags'
import { requireSuperAdmin } from '@/lib/guards'
import { FlagSwitch } from './_components/flag-switch'

export const metadata: Metadata = { title: 'Feature flags' }

const fmt = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ')

export default async function FlagsPage() {
  await requireSuperAdmin()
  // Read straight from the database, not the cache: this page shows what is saved.
  const rows = await prisma.featureFlag.findMany()
  const users = await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.updatedById ? [r.updatedById] : [])) } }, select: { id: true, name: true } })
  const byKey = new Map(rows.map((r) => [r.key, r]))
  return (
    <>
      <PageHeader title="Feature flags" description="Switch features on or off without a deploy. Takes effect right away. While a feature is off, its pages answer 404 for everyone (you too) and its links are hidden; admin pages keep working. Times in UTC." />
      <ul className="grid gap-4">
        {(Object.keys(FLAGS) as Flag[]).map((key) => {
          const def = FLAGS[key]
          const row = byKey.get(key)
          const enabled = row?.enabled ?? def.default
          const by = row?.updatedById ? users.find((u) => u.id === row.updatedById)?.name ?? 'a deleted user' : null
          return (
            <li key={key} className="flex items-start justify-between gap-6 rounded-xl border border-line bg-surface-2 p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg">{def.label}</h2>
                  <code className="text-xs text-fg-faint">{key}</code>
                  <StatusPill tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</StatusPill>
                </div>
                <p className="mt-1 text-sm text-fg-muted">{def.description}</p>
                <p className="mt-2 text-xs text-fg-faint">{row ? `Last changed ${fmt(row.updatedAt)}${by ? ` by ${by}` : ''}` : `Never changed (default: ${def.default ? 'on' : 'off'})`}</p>
              </div>
              <div className="-my-1.5 shrink-0"><FlagSwitch flag={key} label={def.label} enabled={enabled} /></div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
