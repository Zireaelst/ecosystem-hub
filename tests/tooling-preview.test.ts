import assert from 'node:assert/strict'
import { test, vi } from 'vitest'
import { listPublicToolPreview, listPublicTools } from '@/app/(site)/tooling/_lib/queries'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({ prisma: { toolingListing: { findMany } } }))

test('preview fetches only the visible cards; the catalog still pages through every listing', async () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({ project: { slug: `tool-${i}` }, approvedVersion: { name: `Tool ${i}`, shortDescription: '', logoUrl: null } }))
  findMany.mockImplementation(({ skip = 0, take }) => rows.slice(skip, skip + take))

  const preview = await listPublicToolPreview(3)
  assert.equal(findMany.mock.calls[0][0].take, 3)
  const first = await listPublicTools({ page: 1 })
  const last = await listPublicTools({ page: 2 })
  assert.deepEqual(preview, first.tools.slice(0, 3))
  assert.equal(first.hasMore, true)
  assert.equal(last.hasMore, false)
  assert.deepEqual([...first.tools, ...last.tools].map(t => t.slug), rows.map(r => r.project.slug))
})
