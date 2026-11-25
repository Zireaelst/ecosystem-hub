'use client'

import { useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import { approveListing, rejectListing, removeListing } from '@/app/(site)/tooling/_lib/actions'
import { REJECT_REASON_MAX } from '@/app/(site)/tooling/_lib/rules'
import { Field } from '@/components/field'
import { FormDialog } from '@/components/form-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { useActionToast } from '@/hooks/use-action-toast'

/** The listing as this page saw it; every action sends it back so a stale page is refused. */
type Seen = { listingId: string; approvedVersionId: string | null; pendingVersionId: string | null }

export function ApproveButton({ seen, versionId, number }: { seen: Seen; versionId: string; number: number }) {
  const { pending, run } = useActionToast()
  return (
    <Button disabled={pending} onClick={() => run(() => approveListing({ ...seen, versionId }), `Version ${number} is listed`)}>
      <Check aria-hidden /> Approve version {number}
    </Button>
  )
}

/** Optional reason + "internal" switch, shared by reject and remove. */
function useReason() {
  const [reason, setReason] = useState('')
  const [internal, setInternal] = useState(false)
  const reset = () => { setReason(''); setInternal(false) }
  return { value: { reason, internal }, reset, setReason, setInternal }
}

function ReasonFields({ id, r }: { id: string; r: ReturnType<typeof useReason> }) {
  return (
    <>
      <Field id={id} label="Reason (optional)">
        <Textarea id={id} value={r.value.reason} maxLength={REJECT_REASON_MAX} rows={4} onChange={(e) => r.setReason(e.target.value)} />
      </Field>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <Checkbox className="mt-0.5" checked={r.value.internal} onCheckedChange={(c) => r.setInternal(c === true)} />
        <span>Internal: only reviewers see the reason, not the team</span>
      </label>
    </>
  )
}

export function RejectButton({ seen, number }: { seen: Seen; number: number }) {
  const { pending, run } = useActionToast()
  const r = useReason()
  return (
    <FormDialog
      trigger={<Button variant="outline"><X aria-hidden /> Reject</Button>}
      title={`Reject version ${number}`}
      description="Anything already listed stays listed. The team can fix the project and submit again."
      submitLabel="Reject"
      pending={pending}
      onOpenChange={(o) => !o && r.reset()}
      onSubmit={() => run(() => rejectListing({ ...seen, ...r.value }), 'Rejected')}
    >
      <ReasonFields id="reject-reason" r={r} />
    </FormDialog>
  )
}

export function RemoveButton({ seen }: { seen: Seen }) {
  const { pending, run } = useActionToast()
  const r = useReason()
  return (
    <FormDialog
      trigger={<Button variant="ghost" className="text-destructive hover:text-destructive"><Trash2 aria-hidden /> Remove listing</Button>}
      title="Remove listing"
      description="Takes the project off the list and out of review right away. The team can submit a changed version for review; this version can’t come back unchanged."
      submitLabel="Remove"
      pending={pending}
      onOpenChange={(o) => !o && r.reset()}
      onSubmit={() => run(() => removeListing({ ...seen, ...r.value }), 'Removed')}
    >
      <ReasonFields id="remove-reason" r={r} />
    </FormDialog>
  )
}
