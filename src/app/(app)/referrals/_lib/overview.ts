import 'server-only'
import type { OverviewSource } from '@/app/admin/_lib/overview'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'

const since30 = () => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

export const referralsOverview: OverviewSource[] = [
  { group: 'Groups & referrals', show: (u) => can(u, 'groups.manage'), load: async () => ({ stats: [{ label: 'Groups', value: await prisma.group.count(), href: '/admin/groups' }] }) },
  {
    group: 'Groups & referrals',
    show: (u) => can(u, 'referrals.view'),
    load: async () => ({ stats: [{ label: 'Referred sign-ups', value: await prisma.referral.count({ where: { createdAt: { gte: since30() } } }), hint: 'last 30 days', href: '/admin/groups' }] }),
  },
]
