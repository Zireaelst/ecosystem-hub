// Pure, isomorphic rules for the tooling area (tested in tests/tooling.test.ts).
import { missingForSubmission } from '@/app/(app)/projects/_lib/rules'
import { PROJECT_MATURITY, type ProjectMaturity } from '@/lib/project-maturity'

export const TOOLING_CATEGORY = 'Developer Tooling'
/** Project stages that can be listed. */
export const LISTABLE_STAGES: readonly string[] = ['live', 'established'] satisfies ProjectMaturity[]
/** What the builder agrees to on submit; stored as `consentAt` / `consentById` on the listing. */
export const TOOLING_CONSENT = 'If approved, this project and later versions approved by team1 will be listed publicly under Community Tools (/tooling).'
export const REJECT_REASON_MAX = 1000
/** Note on a version sealed by a tooling submission. Not `submissionNote()`: that prefix marks hackathon versions as "replaced" when no stage entry points at them. */
export const SEAL_NOTE = 'Sent for Developer Tooling review'
export const PAGE_SIZE = 12 // divisible by the 2/3-column grid
export const QUERY_MAX = 80

export const toolHref = (t: { slug: string }) => `/tooling/${t.slug}`
/** `?next=` for the project form: back to the submit page after saving (checked by `safeNext`). */
export const SUBMIT_BACK = encodeURIComponent('/tooling/submit')

/** The fields the listing checks read from a project version (`CHECKED_FIELDS` selects them). */
export type CheckedVersion = Parameters<typeof missingForSubmission>[0] & { categories: string[] }

/** What a version still needs before it can be listed (empty = listable). The same checks run on submit and on approve. */
export function listingProblems(v: CheckedVersion): string[] {
  const out: string[] = []
  if (!v.categories.includes(TOOLING_CATEGORY)) out.push(`Category “${TOOLING_CATEGORY}”`)
  if (v.maturity && !LISTABLE_STAGES.includes(v.maturity)) {
    const stages = LISTABLE_STAGES.map((s) => PROJECT_MATURITY[s as ProjectMaturity].label).join(' or ')
    out.push(`Stage ${stages} (it is ${PROJECT_MATURITY[v.maturity as ProjectMaturity]?.label ?? v.maturity})`)
  }
  return [...out, ...missingForSubmission(v)]
}

type Ref = { id: string; number: number } | null
/** Prisma `select` for `CheckedVersion` plus what approving needs. */
export const CHECKED_FIELDS = {
  id: true, number: true, sealedAt: true, categories: true, maturity: true, fullDescription: true, techDescription: true,
  techStack: true, githubRepos: true, demoLinks: true, websiteUrl: true,
} as const

/** The listing state the review rules need. */
export type ListingState = { closedAt: Date | null; approvedVersion: Ref; pendingVersion: Ref; rejectedVersionId?: string | null; removedVersionId?: string | null }

/**
 * The newest sealed version when it is newer than both the listed and the pending one, so a reviewer can
 * approve it without the team resubmitting (they agreed to later versions being listed). Only for open listings
 * that have something listed or pending, and never the version a reviewer just rejected; a rejected or closed
 * listing needs a new submission.
 */
export function newerVersion<V extends { id: string; number: number }>(l: ListingState, latestSealed: V | null): V | null {
  if (!latestSealed || l.closedAt || (!l.approvedVersion && !l.pendingVersion) || latestSealed.id === l.rejectedVersionId) return null
  return latestSealed.number > Math.max(l.approvedVersion?.number ?? 0, l.pendingVersion?.number ?? 0) ? latestSealed : null
}

/** Why a reviewer can't approve this version on this listing, or null when they can. */
export function approveProblem(l: ListingState, v: CheckedVersion & { id: string; number: number; sealedAt: Date | null }, projectArchived: boolean): string | null {
  if (projectArchived) return 'The project was deleted'
  if (l.closedAt) return 'The listing was withdrawn or removed'
  if (!l.approvedVersion && !l.pendingVersion) return 'Nothing is waiting for review'
  if (!v.sealedAt) return 'Only saved versions can be approved, not the draft'
  if (v.id === l.rejectedVersionId) return `Version ${v.number} was rejected; the team submits a new one`
  if (v.id === l.removedVersionId) return `Version ${v.number} was removed from the list; the team submits a new one`
  if (l.approvedVersion && v.number <= l.approvedVersion.number) return `Version ${v.number} is not newer than the listed one`
  if (l.pendingVersion && v.number < l.pendingVersion.number) return `A newer version (${l.pendingVersion.number}) is waiting for review`
  const problems = listingProblems(v)
  return problems.length ? `It still needs: ${problems.join(', ')}` : null
}

/**
 * Why the team can't submit this version right now, or null. A rejected or removed version never comes back unchanged
 * (also after a withdraw); the team edits the project (a new version) before trying again.
 */
export function submitBlock(l: { closedAt: Date | null; approvedVersionId: string | null; pendingVersionId: string | null; rejectedVersionId: string | null; removedVersionId: string | null } | null, versionId: string): string | null {
  if (!l) return null
  if (l.rejectedVersionId === versionId) return 'This version wasn’t approved. Edit the project before submitting again.'
  if (l.removedVersionId === versionId) return 'team1 took this project off /tooling at this version. Edit the project before submitting again.'
  if (l.closedAt) return null
  if (l.approvedVersionId === versionId) return 'This version is listed. Edit the project to submit an update.'
  if (l.pendingVersionId === versionId) return 'This version is waiting for review.'
  return null
}

/** Why the listing is off the list, for the team: removed by a reviewer (with their reason unless it is internal) or withdrawn by the team. */
export function closedState(l: { closedAt: Date | null; closedReason: string | null; removedReason: string | null; removedReasonInternal: boolean }): { by: 'team' | 'reviewer'; reason: string | null } | null {
  if (!l.closedAt) return null
  return l.closedReason === 'removed' ? { by: 'reviewer', reason: l.removedReasonInternal ? null : l.removedReason } : { by: 'team', reason: null }
}

/**
 * What the team's withdraw does, or null when there is nothing to withdraw. `submission`: only the version in review
 * goes; a listed version stays listed (`pending`), with nothing listed the listing closes. `listing`: unlist, off the
 * list and out of review (`close`).
 */
export function withdrawPlan(l: { closedAt: Date | null; approvedVersionId: string | null; pendingVersionId: string | null }, what: 'submission' | 'listing'): 'pending' | 'close' | null {
  if (l.closedAt) return null
  if (what === 'submission') return l.pendingVersionId ? (l.approvedVersionId ? 'pending' : 'close') : null
  return l.approvedVersionId ? 'close' : null
}

/** Why a reviewer can't remove the listing, or null. Only a listed version is removed; a submission never listed is rejected. */
export function removeProblem(l: { closedAt: Date | null; approvedVersionId: string | null }): string | null {
  if (l.closedAt) return 'The listing was withdrawn or removed'
  return l.approvedVersionId ? null : 'Nothing is listed. Reject the submission instead.'
}

/**
 * The version a removal blocks from coming back unchanged: the newest of the listed, the pending and the project's
 * newest sealed version (the "newer version" on the review page). Every version a reviewer could have seen is at or
 * below it, and the team's current version is never older, so only this one could be resubmitted unchanged.
 */
export function removalBoundary(versions: ({ id: string; number: number } | null)[]): string | null {
  return versions.reduce<{ id: string; number: number } | null>((max, v) => (v && (!max || v.number > max.number) ? v : max), null)?.id ?? null
}

/**
 * Whether the stored rejection is still the latest thing that happened (the team hasn't resubmitted, nothing was approved
 * since, the listing is open). The rejection itself stays on the row as history for reviewers.
 */
export function currentRejection(l: { closedAt: Date | null; pendingVersionId: string | null; rejectedAt: Date | null; approvedAt: Date | null }): boolean {
  return !!l.rejectedAt && !l.closedAt && !l.pendingVersionId && (!l.approvedAt || l.rejectedAt > l.approvedAt)
}

/**
 * A reject that already happened and is still the latest event on the listing as the page saw it: a retry after a lost
 * response, answered with success. Anything else (approved, resubmitted or closed since) is a stale page.
 */
export function isRejectRetry(
  l: { closedAt: Date | null; approvedVersionId: string | null; pendingVersionId: string | null; rejectedVersionId: string | null; rejectedAt: Date | null; approvedAt: Date | null },
  seen: { approvedVersionId: string | null; pendingVersionId: string | null },
): boolean {
  return !!seen.pendingVersionId && l.rejectedVersionId === seen.pendingVersionId && l.approvedVersionId === seen.approvedVersionId && currentRejection(l)
}

/** The rejection reason the team may see: none when the reviewer marked it internal. */
export const visibleRejectReason = (l: { rejectReason: string | null; rejectReasonInternal: boolean }) => (l.rejectReasonInternal ? null : l.rejectReason)

/** A listed tool as the public pages see it: project data only, never the team. */
export type PublicTool = { slug: string; name: string; shortDescription: string; logoUrl: string | null }

/**
 * Prisma `where` on the approved version for a `/tooling` search: every word must appear in the name or the short
 * description (case-insensitive). Undefined for an empty search.
 */
export function toolSearchWhere(q: string | undefined) {
  const words = (q ?? '').split(/\s+/).filter(Boolean)
  if (!words.length) return undefined
  return { AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: 'insensitive' as const } }, { shortDescription: { contains: w, mode: 'insensitive' as const } }] })) }
}
