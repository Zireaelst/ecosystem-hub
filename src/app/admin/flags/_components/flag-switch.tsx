'use client'

import { Switch } from '@/components/ui/switch'
import { useActionToast } from '@/hooks/use-action-toast'
import { setFlag } from '../_lib/actions'

export function FlagSwitch({ flag, label, enabled }: { flag: string; label: string; enabled: boolean }) {
  const { pending, run } = useActionToast()
  // The label gives the small switch a 44px hit area (clicks on a label activate its button).
  return (
    <label className="flex size-11 cursor-pointer items-center justify-center">
      <Switch
        checked={enabled}
        disabled={pending}
        aria-label={label}
        onCheckedChange={(on) => run(() => setFlag({ key: flag, enabled: on }), `${label} ${on ? 'on' : 'off'}`)}
      />
    </label>
  )
}
