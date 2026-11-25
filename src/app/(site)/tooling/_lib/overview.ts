import 'server-only'
import type { OverviewSource } from '@/app/admin/_lib/overview'
import { can } from '@/lib/permissions'
import { countListings } from './queries'

export const toolingOverview: OverviewSource[] = [{
  group: 'Tooling',
  show: (u) => can(u, 'tooling.review'),
  load: async () => {
    const [review, listed] = await Promise.all([countListings('review'), countListings('listed')])
    return {
      stats: [{ label: 'Tools listed', value: listed, href: '/admin/tooling?status=listed' }],
      todos: [{ label: 'Tools waiting for review', count: review, href: '/admin/tooling?status=review' }],
    }
  },
}]
