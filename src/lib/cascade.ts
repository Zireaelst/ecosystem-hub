import 'server-only'
import { z } from 'zod'
import { logger } from '@/lib/logger'

// Cascade (cascade.team1.network), the Avalanche ecosystem map. READ-ONLY: the hub reads one small public,
// anonymous endpoint for the /ecosystem page. Cached for an hour; on failure the page shows no numbers.

export const CASCADE_URL = 'https://cascade.team1.network'

/** Live projects and categories on Cascade (`/api/v1/stats`), or null when Cascade can't be reached - the page must not break. */
export async function getCascadeStats(): Promise<{ projects: number; categories: number } | null> {
  try {
    const res = await fetch(`${CASCADE_URL}/api/v1/stats`, { signal: AbortSignal.timeout(5_000), next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`Cascade answered ${res.status}`)
    return z.object({ projects: z.number().int().nonnegative(), categories: z.number().int().nonnegative() }).parse(await res.json())
  } catch (err) {
    logger.warn({ err }, '[cascade] stats unavailable')
    return null
  }
}
