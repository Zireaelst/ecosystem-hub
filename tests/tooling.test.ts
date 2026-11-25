import { test } from 'vitest'
import assert from 'node:assert/strict'
import { wasReplaced } from '@/app/(app)/projects/_lib/rules'
import {
  approveProblem, closedState, currentRejection, isRejectRetry, listingProblems, newerVersion, removalBoundary, removeProblem, SEAL_NOTE, submitBlock, TOOLING_CATEGORY, TOOLING_CONSENT,
  toolSearchWhere, visibleRejectReason, withdrawPlan, type ListingState,
} from '@/app/(site)/tooling/_lib/rules'

const version = (extra: Partial<Parameters<typeof listingProblems>[0] & { id: string; number: number; sealedAt: Date | null }> = {}) => ({
  categories: [TOOLING_CATEGORY], maturity: 'live', fullDescription: 'Full', techDescription: 'How', techStack: ['TypeScript'],
  githubRepos: ['https://github.com/a/b'], demoLinks: [], websiteUrl: 'https://a.dev', id: 'v3', number: 3, sealedAt: new Date('2026-11-20'), ...extra,
})
const ref = (number: number) => ({ id: `v${number}`, number })
const listing = (extra: Partial<ListingState> = {}): ListingState => ({ closedAt: null, approvedVersion: null, pendingVersion: null, ...extra })

test('listingProblems: Developer Tooling, live or established, and a complete project', () => {
  assert.deepEqual(listingProblems(version()), [])
  assert.deepEqual(listingProblems(version({ maturity: 'established' })), [])
  assert.deepEqual(listingProblems(version({ categories: ['DeFi'] })), [`Category “${TOOLING_CATEGORY}”`])
  assert.match(listingProblems(version({ maturity: 'testnet' }))[0], /^Stage Live or Established \(it is Testnet/)
  assert.match(listingProblems(version({ maturity: 'archived' }))[0], /it is Archived/)
  assert.deepEqual(listingProblems(version({ maturity: null })), ['Project stage']) // no doubled stage message
  assert.deepEqual(listingProblems(version({ githubRepos: [], websiteUrl: null })), ['Code repository', 'Website or demo link'])
})

test('newerVersion: only a sealed version newer than both the listed and the pending one, on an open listing', () => {
  assert.equal(newerVersion(listing({ approvedVersion: ref(2) }), ref(3))?.number, 3)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), pendingVersion: ref(3) }), ref(3)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), pendingVersion: ref(3) }), ref(4))?.number, 4)
  assert.equal(newerVersion(listing({ approvedVersion: ref(3) }), ref(3)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2) }), null), null)
  assert.equal(newerVersion(listing(), ref(5)), null) // rejected or never reviewed: the team submits again
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), closedAt: new Date() }), ref(5)), null)
  assert.equal(newerVersion(listing({ approvedVersion: ref(2), rejectedVersionId: 'v3' }), ref(3)), null) // just rejected
})

test('approveProblem: sealed, newer than the listed one, still listable, open listing', () => {
  const pending = listing({ pendingVersion: ref(3) })
  assert.equal(approveProblem(pending, version(), false), null)
  assert.equal(approveProblem(listing({ approvedVersion: ref(2) }), version(), false), null) // newer version without a resubmit
  assert.match(approveProblem(pending, version({ sealedAt: null }), false)!, /not the draft/)
  assert.match(approveProblem(pending, version(), true)!, /deleted/)
  assert.match(approveProblem(listing({ pendingVersion: ref(3), closedAt: new Date() }), version(), false)!, /withdrawn or removed/)
  assert.match(approveProblem(listing(), version(), false)!, /Nothing is waiting/)
  assert.match(approveProblem(listing({ approvedVersion: ref(3) }), version(), false)!, /not newer/)
  assert.match(approveProblem(listing({ approvedVersion: ref(1), pendingVersion: ref(4) }), version(), false)!, /newer version \(4\)/)
  assert.match(approveProblem(pending, version({ maturity: 'archived' }), false)!, /still needs: Stage/)
  assert.match(approveProblem(listing({ approvedVersion: ref(2), rejectedVersionId: 'v3' }), version(), false)!, /was rejected/) // same rule as the hidden "newer"
  assert.match(approveProblem(listing({ pendingVersion: ref(3), removedVersionId: 'v3' }), version(), false)!, /was removed/)
})

test('submitBlock: listed, waiting, rejected or removed versions need an edit first; closed listings start over', () => {
  const l = (extra = {}) => ({ closedAt: null, approvedVersionId: null, pendingVersionId: null, rejectedVersionId: null, removedVersionId: null, ...extra })
  assert.equal(submitBlock(null, 'v1'), null)
  assert.equal(submitBlock(l(), 'v1'), null)
  assert.match(submitBlock(l({ approvedVersionId: 'v1' }), 'v1')!, /is listed/)
  assert.match(submitBlock(l({ pendingVersionId: 'v1' }), 'v1')!, /waiting for review/)
  assert.match(submitBlock(l({ rejectedVersionId: 'v1' }), 'v1')!, /wasn’t approved/)
  assert.match(submitBlock(l({ rejectedVersionId: 'v1', closedAt: new Date() }), 'v1')!, /wasn’t approved/) // withdrawing doesn't clear a rejection
  assert.equal(submitBlock(l({ approvedVersionId: 'v1', closedAt: new Date() }), 'v1'), null) // withdrawn: listing again needs review
  assert.equal(submitBlock(l({ approvedVersionId: 'v1', rejectedVersionId: 'v2' }), 'v3'), null)
  // A removal is history: the removed version can't come back unchanged, also after a later withdraw or rejection.
  assert.match(submitBlock(l({ removedVersionId: 'v1', closedAt: new Date() }), 'v1')!, /took this project off \/tooling at this version/)
  assert.match(submitBlock(l({ removedVersionId: 'v1' }), 'v1')!, /took this project off \/tooling at this version/)
  assert.equal(submitBlock(l({ removedVersionId: 'v1', closedAt: new Date() }), 'v2'), null) // edited: a new version
})

test('withdrawPlan: a submission goes alone while a version is listed; unlist closes the listing', () => {
  const open = { closedAt: null, approvedVersionId: 'v4', pendingVersionId: 'v5' }
  assert.equal(withdrawPlan(open, 'submission'), 'pending')
  assert.equal(withdrawPlan(open, 'listing'), 'close')
  assert.equal(withdrawPlan({ ...open, approvedVersionId: null }, 'submission'), 'close')
  assert.equal(withdrawPlan({ ...open, approvedVersionId: null }, 'listing'), null)
  assert.equal(withdrawPlan({ ...open, pendingVersionId: null }, 'submission'), null)
  assert.equal(withdrawPlan({ ...open, closedAt: new Date() }, 'listing'), null)
})

test('removeProblem: only a listed version is removed; a submission never listed is rejected', () => {
  assert.equal(removeProblem({ closedAt: null, approvedVersionId: 'v1' }), null)
  assert.match(removeProblem({ closedAt: null, approvedVersionId: null })!, /Reject the submission instead/)
  assert.match(removeProblem({ closedAt: new Date(), approvedVersionId: null })!, /withdrawn or removed/)
})

test('removalBoundary: the newest of listed, pending and newest sealed, so an unsubmitted newer version is blocked too', () => {
  assert.equal(removalBoundary([ref(1), null, ref(1)]), 'v1')
  assert.equal(removalBoundary([ref(1), null, ref(2)]), 'v2') // v2 sealed but never submitted (shown as "Newer version")
  assert.equal(removalBoundary([ref(1), ref(2), ref(3)]), 'v3')
  assert.equal(removalBoundary([ref(1), ref(3), ref(2)]), 'v3')
  assert.equal(removalBoundary([null, null, null]), null)
})

test('isRejectRetry: a lost response is a retry; an approval, resubmit or close since is a stale page', () => {
  const at = (d: string) => new Date(`2026-11-${d}T12:00:00Z`)
  const seen = { approvedVersionId: 'v2', pendingVersionId: 'v3' }
  const l = (extra = {}) => ({ closedAt: null, approvedVersionId: 'v2', pendingVersionId: null, rejectedVersionId: 'v3', rejectedAt: at('20'), approvedAt: at('19'), ...extra })
  assert.equal(isRejectRetry(l(), seen), true)
  assert.equal(isRejectRetry(l({ approvedVersionId: 'v4', approvedAt: at('21') }), seen), false) // v4 approved since: stale tab
  assert.equal(isRejectRetry(l({ pendingVersionId: 'v4' }), seen), false) // resubmitted since
  assert.equal(isRejectRetry(l({ closedAt: at('21'), approvedVersionId: null }), seen), false)
  assert.equal(isRejectRetry(l({ rejectedVersionId: 'v1' }), seen), false)
  assert.equal(isRejectRetry(l(), { approvedVersionId: 'v2', pendingVersionId: null }), false)
})

test('currentRejection: the kept rejection only counts until the team resubmits, a reviewer approves or the listing closes', () => {
  const at = (d: string) => new Date(`2026-11-${d}T12:00:00Z`)
  const l = (extra = {}) => ({ closedAt: null, pendingVersionId: null, rejectedAt: at('20'), approvedAt: null, ...extra })
  assert.equal(currentRejection(l()), true)
  assert.equal(currentRejection(l({ approvedAt: at('19') })), true) // an update rejected, the older version still listed
  assert.equal(currentRejection(l({ pendingVersionId: 'v4' })), false) // resubmitted
  assert.equal(currentRejection(l({ approvedAt: at('21') })), false) // a newer version approved since
  assert.equal(currentRejection(l({ closedAt: at('21') })), false)
  assert.equal(currentRejection(l({ rejectedAt: null })), false)
})

test('closedState: a removal shows the reviewer and reason to the team (not when internal); a withdraw shows no reason', () => {
  const now = new Date()
  assert.equal(closedState({ closedAt: null, closedReason: null, removedReason: 'Old removal', removedReasonInternal: false }), null) // resubmitted: the removal is history
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'removed', removedReason: 'Repo was deleted', removedReasonInternal: false }), { by: 'reviewer', reason: 'Repo was deleted' })
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'removed', removedReason: 'Reported by a partner', removedReasonInternal: true }), { by: 'reviewer', reason: null }) // internal: hidden from the team
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'removed', removedReason: null, removedReasonInternal: false }), { by: 'reviewer', reason: null }) // no reason given
  assert.deepEqual(closedState({ closedAt: now, closedReason: 'withdrawn', removedReason: 'Old removal', removedReasonInternal: false }), { by: 'team', reason: null })
})

test('visibleRejectReason hides internal reasons from the team', () => {
  assert.equal(visibleRejectReason({ rejectReason: 'Repo is private', rejectReasonInternal: false }), 'Repo is private')
  assert.equal(visibleRejectReason({ rejectReason: 'Looks like spam', rejectReasonInternal: true }), null)
  assert.equal(visibleRejectReason({ rejectReason: null, rejectReasonInternal: false }), null)
})

test('a tooling seal is never labelled "replaced" on the project page', () => {
  assert.equal(wasReplaced({ sealedAt: new Date(), note: SEAL_NOTE, entries: 0 }), false)
})

test('consent wording names the public list and later versions', () => {
  assert.match(TOOLING_CONSENT, /listed publicly under Community Tools/)
  assert.match(TOOLING_CONSENT, /later versions approved by team1/)
})

test('toolSearchWhere: every word in the name or the short description, case-insensitive; empty = no filter', () => {
  assert.equal(toolSearchWhere(undefined), undefined)
  assert.equal(toolSearchWhere('   '), undefined)
  const word = (w: string) => ({ OR: [{ name: { contains: w, mode: 'insensitive' } }, { shortDescription: { contains: w, mode: 'insensitive' } }] })
  assert.deepEqual(toolSearchWhere(' wallet  kit '), { AND: [word('wallet'), word('kit')] })
})
