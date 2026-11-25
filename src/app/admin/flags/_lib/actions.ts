'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { action, ActionError } from '@/lib/action'
import { recordAudit } from '@/lib/audit'
import { prisma } from '@/lib/db'
import { clearFlagCache } from '@/lib/flag-store'
import { FLAGS, isFlag } from '@/lib/flags'
import { sendSystemAlert } from '@/lib/system-alert'

export const setFlag = action({ schema: z.object({ key: z.string().max(100), enabled: z.boolean() }), permission: 'superAdmin' }, async ({ key, enabled }, user) => {
  if (!isFlag(key)) throw new ActionError('Unknown flag')
  const before = (await prisma.featureFlag.findUnique({ where: { key } }))?.enabled ?? FLAGS[key].default
  await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled, updatedById: user.id }, update: { enabled, updatedById: user.id } })
  clearFlagCache()
  await recordAudit({ actorId: user.id, action: 'flag.set', entityType: 'FeatureFlag', entityId: key, before: { enabled: before }, after: { enabled } })
  // No name in the alert (no PII); who it was is in the audit log.
  void sendSystemAlert({ title: `Feature ${key} ${enabled ? 'on' : 'off'}`, message: `"${FLAGS[key].label}" was switched ${enabled ? 'on' : 'off'} by a super admin. See /admin/audit`, priority: 2 })
  revalidatePath('/', 'layout') // nav links and gated pages
  return null
})
