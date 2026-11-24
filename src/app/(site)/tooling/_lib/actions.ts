'use server'

import { revalidatePath } from 'next/cache'
import { canEditProject } from '@/app/(app)/projects/_lib/rules'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { approveProblem, isRejectRetry, listingProblems, removalBoundary, removeProblem, SEAL_NOTE, submitBlock, TOOLING_CONSENT } from './rules'
import { approveListingSchema, rejectListingSchema, removeListingSchema, submitListingSchema, withdrawListingSchema } from './schemas'

const STALE = 'This listing changed since you opened it - reload the page'

function refresh() {
  revalidatePath('/tooling', 'layout')
  revalidatePath('/admin/tooling', 'layout')
}

async function requireTeam(projectId: string, userId: string) {
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, select: { role: true } })
  if (!m) throw new ForbiddenError('You are not on this project')
  if (!canEditProject(m.role)) throw new ForbiddenError('Only the owner and writers can do this')
}

// ── Team (owner / writer) ────────────────────────────────────────────────────

/** Seal the project's current version (or reuse it if already sealed), check it, and put it up for review with the team's consent. */
export const submitToTooling = action({ schema: submitListingSchema, permission: 'user' }, async ({ projectId }, user) => {
  await requireTeam(projectId, user.id)
  const out = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id: projectId }, select: { archivedAt: true, currentVersionId: true } })
    if (!project || project.archivedAt || !project.currentVersionId) throw new ActionError('Project not found')
    // Lock the listing row (created empty if missing) so a review in flight waits for us, then its `seen` guard refuses it.
    await tx.toolingListing.createMany({ data: [{ projectId }], skipDuplicates: true })
    await tx.$queryRaw`SELECT id FROM tooling_listings WHERE "projectId" = ${projectId} FOR UPDATE`
    const listing = await tx.toolingListing.findUniqueOrThrow({ where: { projectId } })
    // Seal the draft first and check what was sealed. A concurrent project save can't change it after this: the save
    // action only writes a version with a `sealedAt: null` guard and starts a new draft otherwise (projects/_lib/actions.ts).
    // Keep that guard there; the row lock above only serialises tooling actions, the save never touches tooling_listings.
    await tx.projectVersion.updateMany({ where: { id: project.currentVersionId, sealedAt: null }, data: { sealedAt: new Date(), note: SEAL_NOTE } })
    const version = await tx.projectVersion.findUniqueOrThrow({ where: { id: project.currentVersionId } })
    const problems = listingProblems(version)
    if (problems.length) throw new ActionError(`Your project still needs: ${problems.join(', ')}`) // rolls the seal (and an empty listing) back
    if (!listing.closedAt && listing.pendingVersionId === version.id) return { listingId: listing.id, version, changed: false } // retry / double click
    const blocked = submitBlock(listing, version.id)
    if (blocked) throw new ActionError(blocked)
    const now = new Date()
    await tx.toolingListing.update({
      where: { id: listing.id },
      data: {
        pendingVersionId: version.id, submittedAt: now, submittedById: user.id, consentAt: now, consentById: user.id,
        // A closed listing has nothing listed already (withdraw / remove clear approvedVersionId). The last approval,
        // rejection and removal stay as history for reviewers (`currentRejection` tells the pages a rejection is past).
        closedAt: null, closedById: null, closedReason: null,
      },
    })
    return { listingId: listing.id, version, changed: true }
  })
  if (out.changed) {
    await recordAudit({ actorId: user.id, action: 'tooling.submit', entityType: 'ToolingListing', entityId: out.listingId, after: { projectId, versionId: out.version.id, number: out.version.number, consent: TOOLING_CONSENT } })
  }
  refresh()
  return { number: out.version.number, changed: out.changed }
})

/** The team takes the project off the list (and out of review) without a reviewer. */
export const withdrawFromTooling = action({ schema: withdrawListingSchema, permission: 'user' }, async ({ projectId }, user) => {
  await requireTeam(projectId, user.id)
  const listing = await prisma.toolingListing.findUnique({ where: { projectId } })
  if (!listing || listing.closedAt) throw new ActionError('Nothing to withdraw')
  const r = await prisma.toolingListing.updateMany({
    where: { id: listing.id, closedAt: null },
    data: { approvedVersionId: null, pendingVersionId: null, closedAt: new Date(), closedById: user.id, closedReason: 'withdrawn' },
  })
  if (!r.count) throw new ActionError('Nothing to withdraw')
  await recordAudit({ actorId: user.id, action: 'tooling.withdraw', entityType: 'ToolingListing', entityId: listing.id, before: { projectId, approvedVersionId: listing.approvedVersionId, pendingVersionId: listing.pendingVersionId }, after: { closedReason: 'withdrawn' } })
  refresh()
  return null
})

// ── Reviewers (`tooling.review`) ─────────────────────────────────────────────

const seenWhere = (s: { listingId: string; approvedVersionId: string | null; pendingVersionId: string | null }) => ({
  id: s.listingId, approvedVersionId: s.approvedVersionId, pendingVersionId: s.pendingVersionId, closedAt: null,
})

/** List a sealed version: the pending one, or a newer one the team saved later. */
export const approveListing = action({ schema: approveListingSchema, permission: 'tooling.review' }, async (input, user) => {
  const listing = await prisma.toolingListing.findUnique({
    where: { id: input.listingId },
    include: { project: { select: { archivedAt: true } }, approvedVersion: { select: { id: true, number: true } }, pendingVersion: { select: { id: true, number: true } } },
  })
  if (!listing) throw new ActionError('Listing not found')
  if (!listing.closedAt && listing.approvedVersionId === input.versionId && !listing.pendingVersionId) return null // retry after a lost response
  if (listing.approvedVersionId !== input.approvedVersionId || listing.pendingVersionId !== input.pendingVersionId) throw new ActionError(STALE)
  const version = await prisma.projectVersion.findUnique({ where: { id: input.versionId } })
  if (!version || version.projectId !== listing.projectId) throw new ActionError('Version not found')
  const problem = approveProblem(listing, version, !!listing.project.archivedAt)
  if (problem) throw new ActionError(problem)
  const r = await prisma.toolingListing.updateMany({
    where: seenWhere(input),
    data: { approvedVersionId: version.id, approvedAt: new Date(), approvedById: user.id, pendingVersionId: null },
  })
  if (!r.count) throw new ActionError(STALE)
  await recordAudit({ actorId: user.id, action: 'tooling.approve', entityType: 'ToolingListing', entityId: listing.id, before: { approvedVersionId: listing.approvedVersionId, pendingVersionId: listing.pendingVersionId }, after: { approvedVersionId: version.id, number: version.number } })
  refresh()
  return null
})

/** Turn down the pending version; what is already listed stays listed. */
export const rejectListing = action({ schema: rejectListingSchema, permission: 'tooling.review' }, async (input, user) => {
  if (!input.pendingVersionId) throw new ActionError('Nothing is waiting for review')
  const now = await prisma.toolingListing.findUnique({
    where: { id: input.listingId },
    select: { closedAt: true, approvedVersionId: true, pendingVersionId: true, rejectedVersionId: true, rejectedAt: true, approvedAt: true },
  })
  // The rejection stays on the row as history, so only a rejection that is still the latest event counts as a retry.
  if (now && isRejectRetry(now, input)) return null
  const r = await prisma.toolingListing.updateMany({
    where: seenWhere(input),
    data: { pendingVersionId: null, rejectedVersionId: input.pendingVersionId, rejectedAt: new Date(), rejectedById: user.id, rejectReason: input.reason, rejectReasonInternal: input.internal },
  })
  if (!r.count) throw new ActionError(STALE)
  await recordAudit({ actorId: user.id, action: 'tooling.reject', entityType: 'ToolingListing', entityId: input.listingId, before: { pendingVersionId: input.pendingVersionId }, after: { rejectReason: input.reason, internal: input.internal } })
  refresh()
  return null
})

/**
 * Take a listed project off the list and out of review (a rug, an archived project). The team sees the reason and can
 * submit a changed version again; the removal stays on the listing for the next reviewer.
 */
export const removeListing = action({ schema: removeListingSchema, permission: 'tooling.review' }, async (input, user) => {
  const now = await prisma.toolingListing.findUnique({
    where: { id: input.listingId },
    select: {
      closedReason: true, closedAt: true, approvedVersion: { select: { id: true, number: true } }, pendingVersion: { select: { id: true, number: true } },
      project: { select: { versions: { where: { sealedAt: { not: null } }, orderBy: { number: 'desc' }, take: 1, select: { id: true, number: true } } } },
    },
  })
  if (!now) throw new ActionError('Listing not found')
  if (now.closedAt && now.closedReason === 'removed') return null // retry after a lost response
  const problem = removeProblem({ closedAt: null, approvedVersionId: input.approvedVersionId }) // the seen guard below checks it is still so
  if (problem) throw new ActionError(problem)
  // Decided here, not from the page: every version the reviewer could have seen (listed, pending, newest sealed) is
  // blocked from coming back unchanged (`submitBlock`). A version sealed after this read is treated like a draft that
  // existed at removal: never seen by the reviewer, so it goes through review as a change. If the listing changed
  // since the read, the seen guard refuses the update anyway.
  const removedVersionId = removalBoundary([now.approvedVersion, now.pendingVersion, now.project.versions[0] ?? null])
  const at = new Date()
  const r = await prisma.toolingListing.updateMany({
    where: seenWhere(input),
    data: {
      approvedVersionId: null, pendingVersionId: null, closedAt: at, closedById: user.id, closedReason: 'removed',
      removedVersionId, removedAt: at, removedById: user.id, removedReason: input.reason,
    },
  })
  if (!r.count) throw new ActionError(STALE)
  await recordAudit({ actorId: user.id, action: 'tooling.remove', entityType: 'ToolingListing', entityId: input.listingId, before: { approvedVersionId: input.approvedVersionId, pendingVersionId: input.pendingVersionId }, after: { closedReason: 'removed', reason: input.reason, removedVersionId } })
  refresh()
  return null
})
