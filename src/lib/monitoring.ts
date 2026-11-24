import * as Sentry from '@sentry/node'
import type { NodeOptions } from '@sentry/node'
import { DATA_COLLECTION, scrubEvent } from '@/lib/sentry-scrub'

// Server-side GlitchTip (Sentry SDK) capture for the web server and the worker. Without
// SENTRY_DSN no client is initialised and both functions do nothing. Never throws.
type Ctx = { userId?: string; tags?: Record<string, string> }

/** Init options shared by the web server (@sentry/nextjs) and the worker (@sentry/node); undefined = GlitchTip off. */
export function sentryServerOptions(): NodeOptions | undefined {
  const dsn = process.env.SENTRY_DSN?.trim()
  if (!dsn) return undefined
  return {
    dsn,
    release: process.env.RAILWAY_GIT_COMMIT_SHA?.trim() || undefined,
    // Errors only: no tracesSampleRate at all (0 still creates unsampled spans), no trace headers on
    // outgoing requests, no OTel tracer provider of our own (so OpenTelemetry can own tracing later).
    tracePropagationTargets: [],
    enableOpenTelemetrySetup: false,
    // No session envelopes, only errors.
    integrations: (defaults) => defaults.filter((i) => i.name !== 'ProcessSession'),
    // Security events are messages: a synthetic stack (minified server frames) makes GlitchTip title them "a" / "?".
    attachStacktrace: false,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
  }
}

const user = (userId?: string, ip?: string) => (userId || ip ? { ...(userId && { id: userId }), ...(ip && { ip_address: ip }) } : undefined)

/** Returns the event id (shown to the user as a short ref), or undefined when GlitchTip is off. */
export function captureError(err: unknown, ctx?: Ctx): string | undefined {
  try {
    if (!Sentry.getClient()) return undefined
    return Sentry.captureException(err, { user: user(ctx?.userId), tags: ctx?.tags })
  } catch {
    return undefined
  }
}

/** One GlitchTip issue per security event type (fingerprint), tagged `security`. */
/** The client IP goes into GlitchTip's standard user.ip_address (security events only), so a source can be found and blocked. */
export function captureSecurity(type: string, level: 'warning' | 'error', ctx: Ctx & { ip?: string; extra?: Record<string, unknown> }): void {
  try {
    if (!Sentry.getClient()) return
    Sentry.captureMessage(type, { level, fingerprint: [type], tags: { ...ctx.tags, security: 'true' }, user: user(ctx.userId, ctx.ip), extra: ctx.extra })
  } catch {}
}
