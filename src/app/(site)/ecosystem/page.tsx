import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Compass, Wrench } from 'lucide-react'
import { ToolCard } from '../tooling/_components/tool-card'
import { listPublicTools } from '../tooling/_lib/queries'
import { LinkCard } from '@/components/link-card'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { isFlagOn } from '@/lib/flag-store'
import { canonical } from '@/lib/metadata'

export const metadata: Metadata = {
  title: 'Built on Avalanche',
  description: 'Projects and developer tools built on Avalanche: the ecosystem on Cascade and tools from builders in the community.',
  ...canonical('/ecosystem'),
}

const PREVIEW = 3

/** Entry page to what's built on Avalanche. Always on; the Community Tools part follows the `tooling` flag. */
export default async function EcosystemPage() {
  const toolsOn = await isFlagOn('tooling')
  const tools = toolsOn ? (await listPublicTools({ page: 1 })).tools.slice(0, PREVIEW) : []
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading as="h1" title={<>Built on Avalanche<span className="text-brand">.</span></>}>
        Projects and tools from across the Avalanche ecosystem.
      </SectionHeading>

      <ul className="grid gap-5 sm:grid-cols-2">
        <li><LinkCard href="https://cascade.team1.network" newTab image={null} icon={Compass} title="Cascade" meta="The Avalanche ecosystem: every project building on Avalanche, with its map and more." /></li>
        {toolsOn && <li><LinkCard href="/tooling" image={null} icon={Wrench} title="Community Tools" meta="Developer tools from builders in the community, reviewed by team1." /></li>}
      </ul>

      {tools.length > 0 && (
        <section aria-labelledby="latest-tools" className="mt-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 id="latest-tools" className="text-2xl">Latest community tools</h2>
            <Button asChild variant="outline"><Link href="/tooling">All community tools <ArrowRight aria-hidden /></Link></Button>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t) => <li key={t.slug}><ToolCard tool={t} /></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
