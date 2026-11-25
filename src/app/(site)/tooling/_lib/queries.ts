import 'server-only'
import { cache } from 'react'
import { TEAM_ROLES } from '@/app/(app)/projects/_lib/rules'
import { prisma } from '@/lib/db'
import { CHECKED_FIELDS, newerVersion, PAGE_SIZE, toolSearchWhere, type PublicTool } from './rules'

/** Listed = a reviewer approved a version, the listing is open and the project isn't deleted. */
const listed = { approvedVersionId: { not: null }, closedAt: null, project: { archivedAt: null } }
const ref = { select: { id: true, number: true } } as const
const latestSealed = { where: { sealedAt: { not: null } }, orderBy: { number: 'desc' }, take: 1 } as const

/** One page of listed tools for `/tooling`, newest approval first, searched in the database. Project data from the approved version only, never the team. */
export async function listPublicTools({ q, page }: { q?: string; page: number }): Promise<{ tools: PublicTool[]; hasMore: boolean }> {
  const search = toolSearchWhere(q)
  const rows = await prisma.toolingListing.findMany({
    where: { ...listed, ...(search ? { approvedVersion: search } : {}) },
    orderBy: [{ approvedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: { project: { select: { slug: true } }, approvedVersion: { select: { name: true, shortDescription: true, logoUrl: true } } },
  })
  const tools = rows.flatMap((r) => (r.approvedVersion ? [{ slug: r.project.slug, ...r.approvedVersion }] : []))
  return { tools: tools.slice(0, PAGE_SIZE), hasMore: rows.length > PAGE_SIZE }
}

/** Whether anything is listed at all (the empty state: "nothing listed yet" vs "no match"). */
export async function anyPublicTool() {
  return !!(await prisma.toolingListing.findFirst({ where: listed, select: { id: true } }))
}

/** Every listed tool's slug for the sitemap. */
export async function listPublicToolSlugs() {
  const rows = await prisma.toolingListing.findMany({ where: listed, orderBy: { id: 'asc' }, select: { approvedAt: true, project: { select: { slug: true } } } })
  return rows.map((r) => ({ slug: r.project.slug, approvedAt: r.approvedAt }))
}

/** One listed tool by its project slug, or null (not listed, withdrawn, removed or deleted). The whole approved version: the page renders it like a project page (`ProjectVersionView`), which shows no team. */
export const getPublicTool = cache(async (slug: string) => {
  const r = await prisma.toolingListing.findFirst({ where: { ...listed, project: { slug, archivedAt: null } }, select: { approvedAt: true, approvedVersion: true, project: { select: { slug: true } } } })
  return r?.approvedVersion ? { slug: r.project.slug, approvedAt: r.approvedAt, version: r.approvedVersion } : null
})

/** My projects (owner / writer) with their listing, for the submit page. */
export async function listMyToolingProjects(userId: string) {
  return prisma.project.findMany({
    where: { archivedAt: null, members: { some: { userId, role: { in: TEAM_ROLES } } } },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      slug: true,
      currentVersion: { select: { ...CHECKED_FIELDS, name: true } },
      toolingListing: {
        select: {
          approvedVersionId: true, pendingVersionId: true, rejectedVersionId: true, rejectedAt: true, rejectReason: true, rejectReasonInternal: true,
          approvedAt: true, closedAt: true, closedReason: true, removedVersionId: true, removedReason: true, removedReasonInternal: true, approvedVersion: ref, pendingVersion: ref,
        },
      },
    },
  })
}

export const REVIEW_PAGE_SIZE = 50
export const REVIEW_FILTERS = ['all', 'review', 'listed', 'closed'] as const
export type ReviewFilter = (typeof REVIEW_FILTERS)[number]
const reviewFilterWhere: Record<ReviewFilter, object> = {
  all: {},
  review: { pendingVersionId: { not: null }, closedAt: null, project: { archivedAt: null } },
  listed,
  closed: { OR: [{ closedAt: { not: null } }, { project: { archivedAt: { not: null } } }] },
}

/** How many listings match `filter` (admin overview). */
export const countListings = (filter: ReviewFilter) => prisma.toolingListing.count({ where: reviewFilterWhere[filter] })

/** One page of the review queue (search on the project's current name), with each project's newest sealed version (a reviewer can approve a newer one directly). */
export const REVIEW_SORTS = ['name', 'submitted', 'approved', 'updated'] as const
export type ReviewSort = { key: (typeof REVIEW_SORTS)[number]; dir: 'asc' | 'desc' }
const reviewOrder = ({ key, dir }: ReviewSort) =>
  key === 'name' ? { project: { currentVersion: { name: dir } } }
  : key === 'submitted' ? { submittedAt: { sort: dir, nulls: 'last' as const } }
  : key === 'approved' ? { approvedAt: { sort: dir, nulls: 'last' as const } }
  : { updatedAt: dir }

export async function listListingsForReview({ q, filter, page, sort }: { q?: string; filter: ReviewFilter; page: number; sort: ReviewSort }) {
  const rows = await prisma.toolingListing.findMany({
    where: { AND: [reviewFilterWhere[filter], q ? { project: { currentVersion: { name: { contains: q, mode: 'insensitive' } } } } : {}] },
    orderBy: [reviewOrder(sort), { id: 'asc' }],
    skip: (page - 1) * REVIEW_PAGE_SIZE,
    take: REVIEW_PAGE_SIZE + 1,
    include: {
      project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: { ...latestSealed, select: CHECKED_FIELDS } } },
      approvedVersion: ref,
      pendingVersion: ref,
    },
  })
  return { rows: rows.slice(0, REVIEW_PAGE_SIZE).map((r) => ({ ...r, newer: newerVersion(r, r.project.versions[0] ?? null) })), hasMore: rows.length > REVIEW_PAGE_SIZE }
}

/** One listing with the full versions a reviewer looks at, the names behind it (no emails) and the numbers of the rejected / removed versions. */
export async function getListingForReview(id: string) {
  const r = await prisma.toolingListing.findUnique({
    where: { id },
    include: { project: { select: { slug: true, archivedAt: true, currentVersion: { select: { name: true } }, versions: latestSealed } }, approvedVersion: true, pendingVersion: true },
  })
  if (!r) return null
  const userIds = [r.submittedById, r.consentById, r.approvedById, r.rejectedById, r.removedById, r.closedById].filter((x): x is string => !!x)
  const versionIds = [r.rejectedVersionId, r.removedVersionId].filter((x): x is string => !!x)
  const [users, versions] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    prisma.projectVersion.findMany({ where: { id: { in: versionIds }, projectId: r.projectId }, select: { id: true, number: true } }),
  ])
  const name = (uid: string | null) => (uid ? users.find((u) => u.id === uid)?.name ?? 'a deleted user' : null)
  const number = (vid: string | null) => (vid ? versions.find((v) => v.id === vid)?.number ?? null : null)
  return {
    ...r,
    newer: newerVersion(r, r.project.versions[0] ?? null),
    names: { submitted: name(r.submittedById), consent: name(r.consentById), approved: name(r.approvedById), rejected: name(r.rejectedById), removed: name(r.removedById), closed: name(r.closedById) },
    numbers: { rejected: number(r.rejectedVersionId), removed: number(r.removedVersionId) },
  }
}
