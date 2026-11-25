'use server'

import { revalidatePath } from 'next/cache'
import { canEditProject } from '@/app/(app)/projects/_lib/rules'
import { action, ActionError, ForbiddenError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { requireFlag } from '@/lib/flag-store'
import { PROJECT_PROGRAMS, recordProjectActivity } from '@/lib/project-activity'
import { approveProblem, isRejectRetry, listingProblems, removalBoundary, removeProblem, SEAL_NOTE, submitBlock, TOOLING_CONSENT, withdrawPlan } from './rules'
import { approveListingSchema, rejectListingSchema, removeListingSchema, submitListingSchema, withdrawListingSchema } from './schemas'

const STALE = 'This listing changed since you opened it - reload the page'

/** The common part of this listing's activity rows (`recordProjectActivity`). */
const activity = (l: { id: string; projectId: string }, actorId: string) => ({ projectId: l.projectId, program: 'tooling' as const, targetId: l.id, targetName: PROJECT_PROGRAMS.tooling.label, actorId })

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
  await requireFlag('tooling')
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
    // A version still waiting (an open listing) is replaced by this one.
    const replaced = !listing.closedAt && listing.pendingVersionId ? listing.pendingVersionId : null
    await recordProjectActivity(tx, [
      { ...activity(listing, user.id), versionId: version.id, event: 'submitted' },
      ...(replaced ? [{ ...activity(listing, user.id), versionId: replaced, event: 'replaced' as const }] : []),
    ])
    return { listingId: listing.id, version, changed: true }
  })
  if (out.changed) {
    await recordAudit({ actorId: user.id, action: 'tooling.submit', entityType: 'ToolingListing', entityId: out.listingId, after: { projectId, versionId: out.version.id, number: out.version.number, consent: TOOLING_CONSENT } })
  }
  refresh()
  return { number: out.version.number, changed: out.changed }
})

/** Without a reviewer, the team takes its submission back (a listed version stays listed) or unlists the project. */
export const withdrawFromTooling = action({ schema: withdrawListingSchema, permission: 'user' }, async ({ projectId, what }, user) => {
  await requireFlag('tooling')
  await requireTeam(projectId, user.id)
  const listing = await prisma.toolingListing.findUnique({ where: { projectId } })
  const plan = listing && withdrawPlan(listing, what)
  if (!plan) throw new ActionError('Nothing to withdraw')
  // Only from the state just read: an approval in between must not turn "withdraw the submission" into an unlist.
  await prisma.$transaction(async (tx) => {
    const r = await tx.toolingListing.updateMany({
      where: { id: listing.id, closedAt: null, approvedVersionId: listing.approvedVersionId, pendingVersionId: listing.pendingVersionId },
      data: plan === 'pending'
        ? { pendingVersionId: null }
        : { approvedVersionId: null, pendingVersionId: null, closedAt: new Date(), closedById: user.id, closedReason: 'withdrawn' },
    })
    if (!r.count) throw new ActionError(STALE)
    // Unlisting takes a version in review along; withdrawing only the submission leaves the listed one.
    await recordProjectActivity(tx, [
      ...(listing.pendingVersionId ? [{ ...activity(listing, user.id), versionId: listing.pendingVersionId, event: 'withdrawn' as const }] : []),
      ...(plan === 'close' && listing.approvedVersionId ? [{ ...activity(listing, user.id), versionId: listing.approvedVersionId, event: 'unlisted' as const }] : []),
    ])
  })
  await recordAudit({
    actorId: user.id, action: 'tooling.withdraw', entityType: 'ToolingListing', entityId: listing.id,
    before: { projectId, approvedVersionId: listing.approvedVersionId, pendingVersionId: listing.pendingVersionId },
    after: plan === 'pending' ? { pendingVersionId: null } : { approvedVersionId: null, pendingVersionId: null, closedReason: 'withdrawn' },
  })
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
  await prisma.$transaction(async (tx) => {
    const r = await tx.toolingListing.updateMany({
      where: seenWhere(input),
      data: { approvedVersionId: version.id, approvedAt: new Date(), approvedById: user.id, pendingVersionId: null },
    })
    if (!r.count) throw new ActionError(STALE)
    // The listed version and an older one in review (approving a newer version directly) are replaced.
    const replaced = [listing.approvedVersionId, listing.pendingVersionId].filter((v): v is string => !!v && v !== version.id)
    await recordProjectActivity(tx, [
      { ...activity(listing, user.id), versionId: version.id, event: 'approved' },
      ...replaced.map((v) => ({ ...activity(listing, user.id), versionId: v, event: 'replaced' as const })),
    ])
  })
  await recordAudit({ actorId: user.id, action: 'tooling.approve', entityType: 'ToolingListing', entityId: listing.id, before: { approvedVersionId: listing.approvedVersionId, pendingVersionId: listing.pendingVersionId }, after: { approvedVersionId: version.id, number: version.number } })
  refresh()
  return null
})

/** Turn down the pending version; what is already listed stays listed. */
export const rejectListing = action({ schema: rejectListingSchema, permission: 'tooling.review' }, async (input, user) => {
  if (!input.pendingVersionId) throw new ActionError('Nothing is waiting for review')
  const now = await prisma.toolingListing.findUnique({
    where: { id: input.listingId },
    select: { id: true, projectId: true, closedAt: true, approvedVersionId: true, pendingVersionId: true, rejectedVersionId: true, rejectedAt: true, approvedAt: true },
  })
  if (!now) throw new ActionError('Listing not found')
  // The rejection stays on the row as history, so only a rejection that is still the latest event counts as a retry.
  if (isRejectRetry(now, input)) return null
  const pendingVersionId = input.pendingVersionId
  await prisma.$transaction(async (tx) => {
    const r = await tx.toolingListing.updateMany({
      where: seenWhere(input),
      data: { pendingVersionId: null, rejectedVersionId: pendingVersionId, rejectedAt: new Date(), rejectedById: user.id, rejectReason: input.reason, rejectReasonInternal: input.internal },
    })
    if (!r.count) throw new ActionError(STALE)
    await recordProjectActivity(tx, [{ ...activity(now, user.id), versionId: pendingVersionId, event: 'rejected', reason: input.reason, reasonInternal: input.internal }])
  })
  await recordAudit({ actorId: user.id, action: 'tooling.reject', entityType: 'ToolingListing', entityId: input.listingId, before: { pendingVersionId: input.pendingVersionId }, after: { rejectReason: input.reason, internal: input.internal } })
  refresh()
  return null
})

/**
 * Take a listed project off the list and out of review (a rug, an archived project). The team sees the reason (unless internal) and can
 * submit a changed version again; the removal stays on the listing for the next reviewer.
 */
export const removeListing = action({ schema: removeListingSchema, permission: 'tooling.review' }, async (input, user) => {
  const now = await prisma.toolingListing.findUnique({
    where: { id: input.listingId },
    select: {
      id: true, projectId: true, closedReason: true, closedAt: true, approvedVersion: { select: { id: true, number: true } }, pendingVersion: { select: { id: true, number: true } },
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
  await prisma.$transaction(async (tx) => {
    const r = await tx.toolingListing.updateMany({
      where: seenWhere(input),
      data: {
        approvedVersionId: null, pendingVersionId: null, closedAt: at, closedById: user.id, closedReason: 'removed',
        removedVersionId, removedAt: at, removedById: user.id, removedReason: input.reason, removedReasonInternal: input.internal,
      },
    })
    if (!r.count) throw new ActionError(STALE)
    // The listed version and one in review both go (the seen guard made sure they are the ones the reviewer saw).
    await recordProjectActivity(tx, [input.approvedVersionId, input.pendingVersionId].filter((v): v is string => !!v).map((v) => (
      { ...activity(now, user.id), versionId: v, event: 'removed' as const, reason: input.reason, reasonInternal: input.internal }
    )))
  })
  await recordAudit({ actorId: user.id, action: 'tooling.remove', entityType: 'ToolingListing', entityId: input.listingId, before: { approvedVersionId: input.approvedVersionId, pendingVersionId: input.pendingVersionId }, after: { closedReason: 'removed', reason: input.reason, internal: input.internal, removedVersionId } })
  refresh()
  return null
})
