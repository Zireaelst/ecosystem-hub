import 'server-only'
import type { OverviewSource } from '@/app/admin/_lib/overview'
import { prisma } from '@/lib/db'
import { canManageEvents } from './access'

export const eventsOverview: OverviewSource[] = [
  {
    group: 'Events',
    show: canManageEvents,
    load: async () => {
      const now = new Date()
      const [upcoming, hackathons, syncErrors] = await Promise.all([
        prisma.event.count({ where: { status: 'published', startAt: { gte: now } } }),
        prisma.hackathon.count({ where: { event: { startAt: { gte: now } } } }),
        prisma.event.count({ where: { syncError: { not: null }, status: { not: 'archived' } } }),
      ])
      return {
        stats: [
          { label: 'Upcoming events', value: upcoming, href: '/admin/events' },
          { label: 'Upcoming hackathons', value: hackathons, href: '/admin/events' },
        ],
        todos: [{ label: 'Events whose Luma refresh failed', count: syncErrors, href: '/admin/events' }],
      }
    },
  },
]
