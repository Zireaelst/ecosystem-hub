import 'server-only'
import { ActionError } from '@/lib/action-error'
import { prisma } from '@/lib/db'
import { FLAGS, flagOn, type Flag } from '@/lib/flags'

// Stored flag values, cached in this process: one small query per TTL instead of one per request.
// Kept on globalThis: the proxy and the app are separate bundles in the same process, and a toggle
// (`clearFlagCache` in the action) must reach the proxy's copy too.
// ponytail: per-process cache - other processes (a second web instance) follow within TTL. Fine for one web instance; revisit with the rate limiter.
const TTL_MS = 30_000
type Cache = { at: number; values: Map<string, boolean> } | null
const g = globalThis as typeof globalThis & { __flags?: { cached: Cache; generation: number } }
const state = (g.__flags ??= { cached: null, generation: 0 })

async function storedFlags(): Promise<Map<string, boolean>> {
  if (state.cached && Date.now() - state.cached.at < TTL_MS) return state.cached.values
  // A read that started before a toggle must not put its old values back into the cache.
  const gen = state.generation
  const rows = await prisma.featureFlag.findMany({ select: { key: true, enabled: true } })
  const values = new Map(rows.map((r) => [r.key, r.enabled]))
  if (gen === state.generation) state.cached = { at: Date.now(), values }
  return values
}

export function clearFlagCache() {
  state.generation++
  state.cached = null
}

/** Whether the feature is on. Pages under the flag's `paths` are gated by the proxy; use this for nav links, the sitemap and server actions. */
export async function isFlagOn(key: Flag): Promise<boolean> {
  return flagOn(await storedFlags(), key)
}

/** First line of every server action of a flagged feature: refuses while the flag is off (actions work from any URL, the proxy can't stop them). */
export async function requireFlag(key: Flag): Promise<void> {
  if (!(await isFlagOn(key))) throw new ActionError(`${FLAGS[key].label} is not available right now`)
}
