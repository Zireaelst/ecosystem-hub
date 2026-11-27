import { test } from 'vitest'
import assert from 'node:assert/strict'
import { catalogSearchWords, cleanAliases, mergeUniversityHits, emptyUniversityEntry, MAX_ALIASES, hasUniversityGaps, normalizeOrgName, parseRorId, universityGaps, updateUniversityEntry, type UniversityEntry } from '@/lib/campus'
import { profileSchema } from '@/app/(app)/profile/_lib/schemas'

const base = { name: 'Ada', bio: '', country: 'AT', builderRoles: ['university'], companyName: '', employeeRole: '', githubAccount: '', xAccount: '', linkedinAccount: '', telegramAccount: '', otherSocials: [], wallets: [], skills: [], newsletterOptIn: false, image: null, trackInterests: ['technology'], campusCoordinatorInterest: true, adultConfirmed: true }
const entry = (patch: Partial<UniversityEntry> = {}): UniversityEntry => ({ ...emptyUniversityEntry(), universityId: 'uni1', fieldOfStudy: 'Computer Science', ...patch })

test('a position belongs to its club, not to the university form row', () => {
  const before = entry({ clubId: 'club1', clubPosition: 'President' })
  const switched = updateUniversityEntry(before, { universityId: 'uni2', clubId: null, newClubName: null })
  assert.equal(updateUniversityEntry(switched, { clubId: 'club2' }).clubPosition, null)
  assert.equal(updateUniversityEntry(before, { clubId: null, newClubName: 'New club' }).clubPosition, null)
  assert.equal(updateUniversityEntry(before, { graduationYear: 2030 }).clubPosition, 'President')
})

test('normalizeOrgName ignores case, accents, punctuation and spacing', () => {
  assert.equal(normalizeOrgName('  Technische Universität   Wien '), 'technische universitat wien')
  assert.equal(normalizeOrgName('TU-Wien'), normalizeOrgName('tu wien'))
  assert.equal(normalizeOrgName('Texas A&M'), 'texas a and m')
})

test('form gaps: university, new-university country, field of study (students only), 18+', () => {
  assert.equal(hasUniversityGaps(universityGaps([entry()], true)), false)
  assert.equal(universityGaps([], true).none, true)
  assert.deepEqual(universityGaps([entry({ universityId: null })], true).university, [true])
  assert.deepEqual(universityGaps([entry({ universityId: null, newUniversity: { name: 'New U', country: null } })], true).country, [true])
  assert.deepEqual(universityGaps([entry({ fieldOfStudy: ' ' })], true).fieldOfStudy, [true])
  assert.deepEqual(universityGaps([entry({ kind: 'faculty', fieldOfStudy: null })], false), { none: false, university: [false], country: [false], fieldOfStudy: [false], adult: false })
  assert.equal(universityGaps([entry()], false).adult, true)
})

test('schema: University role needs a university; students need field of study and 18+', () => {
  assert.equal(profileSchema.safeParse({ ...base, universities: [] }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ fieldOfStudy: null })] }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, adultConfirmed: false, universities: [entry()] }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, adultConfirmed: false, universities: [entry({ kind: 'faculty', fieldOfStudy: null })] }).success, true)
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry(), entry()] }).success, false) // same university twice
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null })] }).success, false) // neither id nor new
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ newUniversity: { name: 'New U', country: 'AT' } })] }).success, false) // both
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, newUniversity: { name: 'New U', country: null } })] }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ graduationYear: 1800 })] }).success, false)
})

test('schema: student-only data is dropped for faculty and without the University role', () => {
  const faculty = profileSchema.parse({ ...base, universities: [entry({ kind: 'faculty', graduationYear: 2027, clubId: 'c1', clubPosition: 'Lead' })] })
  assert.deepEqual(faculty.universities[0], { ...entry({ kind: 'faculty' }), fieldOfStudy: null, graduationYear: null, clubId: null, newClubName: null, clubPosition: null })
  assert.deepEqual([faculty.trackInterests, faculty.campusCoordinatorInterest], [[], false])
  const developer = profileSchema.parse({ ...base, builderRoles: ['developer'], universities: [entry()] })
  assert.deepEqual([developer.universities, developer.trackInterests, developer.campusCoordinatorInterest], [[], [], false])
  const student = profileSchema.parse({ ...base, universities: [entry({ clubPosition: 'President' })] })
  assert.equal(student.universities[0]!.clubPosition, null) // no club, no position
  assert.deepEqual([student.trackInterests, student.campusCoordinatorInterest], [['technology'], true])
})

test('schema: half-filled rows left behind without the University role never block the save', () => {
  const p = profileSchema.safeParse({ ...base, builderRoles: ['developer'], adultConfirmed: false, universities: [emptyUniversityEntry(), entry({ universityId: null, newUniversity: { name: '', country: null } })] })
  assert.equal(p.success, true)
  assert.deepEqual(p.data!.universities, [])
})

test('schema: typed-in names must have letters or digits (they share one key otherwise)', () => {
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, newUniversity: { name: '--', country: 'AT' } })] }).success, false)
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ newClubName: '??' })] }).success, false)
  const ok = profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, newUniversity: { name: 'TU Graz', country: 'AT' }, newClubName: 'Chain Club' })] })
  assert.equal(ok.success, true)
})

test('schema: row errors point at the row', () => {
  const r = profileSchema.safeParse({ ...base, universities: [entry(), entry({ universityId: 'uni2', fieldOfStudy: null })] })
  assert.deepEqual(r.error!.issues.map((i) => [i.path, i.message]), [[['universities', 1, 'fieldOfStudy'], 'Pick your field of study']])
})

test('cleanAliases: trims, drops duplicates, the own name and junk, caps the list', () => {
  assert.deepEqual(cleanAliases('University of Vienna', [' Universität Wien ', 'universitat  wien', 'University of Vienna', '--', 'Uni Wien']), {
    aliases: ['Universität Wien', 'Uni Wien'],
    normalizedAliases: ['universitat wien', 'uni wien'],
  })
  assert.equal(cleanAliases('X', Array.from({ length: 30 }, (_, i) => `Name ${i}`)).aliases.length, MAX_ALIASES)
})

const catalog = { catalogUniversity: { rorId: '04d836q62', name: 'TU Wien' } }

test('schema: a catalog pick is one of id / catalog / new, with a real ROR id', () => {
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, ...catalog })] }).success, true)
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry(catalog)] }).success, false) // id and catalog
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, catalogUniversity: { rorId: 'https://ror.org/04d836q62', name: 'TU Wien' } })] }).success, false) // prefixed
  assert.equal(profileSchema.safeParse({ ...base, universities: [entry({ universityId: null, catalogUniversity: { rorId: 'x', name: 'TU Wien' } })] }).success, false)
  assert.deepEqual(universityGaps([entry({ universityId: null, ...catalog })], true).university, [false])
})

test('parseRorId takes the bare id or the URL, nothing else', () => {
  assert.equal(parseRorId('https://ror.org/04D836Q62'), '04d836q62')
  assert.equal(parseRorId('04d836q62'), '04d836q62')
  assert.equal(parseRorId('14d836q62'), null)
  assert.equal(parseRorId('https://evil.example/04d836q62'), null)
  assert.equal(parseRorId(null), null)
})

test('catalogSearchWords: normalized words, nothing below 2 characters', () => {
  assert.deepEqual(catalogSearchWords(' Universität  Wien '), ['universitat', 'wien'])
  assert.deepEqual(catalogSearchWords('a'), [])
})

test('mergeUniversityHits: catalog first (as its org when linked), then matching orgs, no twins, no hidden', () => {
  const tuw = { rorId: '04d836q62', name: 'TU Wien', aliases: ['TUW'], country: 'AT' }
  const uniwien = { rorId: '03prydq77', name: 'University of Vienna', aliases: ['Universität Wien'], country: 'AT' }
  const org = (id: string, name: string, patch: Partial<{ rorId: string | null; country: string | null; aliases: string[] }> = {}) => ({ id, name, aliases: [], country: 'AT', rorId: null, normalizedName: normalizeOrgName(name), normalizedAliases: (patch.aliases ?? []).map(normalizeOrgName), ...patch })
  const linked = [{ id: 'o-uni', name: 'Uni Wien (renamed)', aliases: ['Uni Wien'], rorId: uniwien.rorId, hidden: false }]
  const orgs = [
    org('o-uni', 'Uni Wien (renamed)', { rorId: uniwien.rorId }), // found by its own name too - listed once
    org('o-twin', 'Technische Universität Wien'), // typed-in twin of TU Wien (catalog alias match below)
    org('o-boot', 'Coding Bootcamp', { aliases: ['Zz School'] }), // not in the catalog
    org('o-de', 'TU Wien', { country: 'DE' }), // same name, other country - not a twin
  ]
  const hits = mergeUniversityHits([{ ...tuw, aliases: ['TUW', 'Technische Universität Wien'] }, uniwien], linked, orgs)
  assert.deepEqual(hits.map((h) => h.value), ['ror:04d836q62', 'o-uni', 'o-boot', 'o-de'])
  assert.equal(hits[1]!.name, 'Uni Wien (renamed)') // the org's name, not the catalog's
  assert.deepEqual(mergeUniversityHits([uniwien], [{ ...linked[0]!, hidden: true }], []), []) // hidden org hides its catalog row
  assert.equal(mergeUniversityHits([tuw, uniwien], [], [], 1).length, 1)
})
