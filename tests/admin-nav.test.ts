import { test } from 'vitest'
import assert from 'node:assert/strict'
import { activeAdminHref } from '@/app/admin/_lib/active'

test('activeAdminHref: the longest matching nav href wins; /admin only matches itself', () => {
  const hrefs = ['/admin', '/admin/campus', '/admin/campus/organizations', '/admin/tooling']
  assert.equal(activeAdminHref(hrefs, '/admin'), '/admin')
  assert.equal(activeAdminHref(hrefs, '/admin/campus'), '/admin/campus')
  assert.equal(activeAdminHref(hrefs, '/admin/campus/organizations/abc'), '/admin/campus/organizations')
  assert.equal(activeAdminHref(hrefs, '/admin/tooling/xyz'), '/admin/tooling')
  assert.equal(activeAdminHref(hrefs, '/admin/toolingfoo'), null)
  assert.equal(activeAdminHref(hrefs, '/admin/users'), null)
})
