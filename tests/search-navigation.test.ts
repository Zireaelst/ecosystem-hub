import assert from 'node:assert/strict'
import { test } from 'vitest'
import { searchHref } from '@/lib/search-navigation'

const path = '/admin/campus/organizations'
const keep = { view: 'university' }

test('submitting the current search from page two keeps the filter and returns to the first page', () => {
  assert.equal(searchHref(path, keep, 'wallet', 'wallet', '?view=university&q=wallet&page=2'), `${path}?view=university&q=wallet`)
})

test('an unchanged search does not navigate on first-page submit or while typing', () => {
  assert.equal(searchHref(path, keep, 'wallet', 'wallet', '?q=wallet&page=1'), null)
  assert.equal(searchHref(path, keep, 'wallet', 'wallet'), null)
})
