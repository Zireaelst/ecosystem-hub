// Pure, no imports: the client sidebar uses it.

/**
 * The nav href that owns `pathname`: the longest one that equals it or is a parent of it, so /admin/campus/organizations
 * highlights "Universities & clubs", not "Students" (/admin/campus). `/admin` only matches itself.
 */
export function activeAdminHref(hrefs: readonly string[], pathname: string): string | null {
  const hits = hrefs.filter((h) => pathname === h || (h !== '/admin' && pathname.startsWith(h + '/')))
  return hits.sort((a, b) => b.length - a.length)[0] ?? null
}
