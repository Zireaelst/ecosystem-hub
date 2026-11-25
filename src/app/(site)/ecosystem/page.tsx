import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { ToolCard } from '../tooling/_components/tool-card'
import { listPublicTools } from '../tooling/_lib/queries'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { CASCADE_URL, getCascadeStats } from '@/lib/cascade'
import { isFlagOn } from '@/lib/flag-store'
import { canonical } from '@/lib/metadata'
// Static import: the URL carries a content hash, so a replaced logo is never served from a cache.
import cascadeLogo from '../../../../public/logos/cascade.png'

export const metadata: Metadata = {
  title: 'Built on Avalanche',
  description: 'Projects and developer tools built on Avalanche: the ecosystem on Cascade and tools from builders in the community.',
  ...canonical('/ecosystem'),
}

const PREVIEW = 3
const num = new Intl.NumberFormat('en-US')

/** Entry page to what's built on Avalanche. Cascade is always shown; the Community Tools part follows the `tooling` flag. */
export default async function EcosystemPage() {
  const toolsOn = await isFlagOn('tooling')
  const [cascade, tools] = await Promise.all([getCascadeStats(), toolsOn ? listPublicTools({ page: 1 }).then((r) => r.tools.slice(0, PREVIEW)) : []])
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading as="h1" title={<>Built on Avalanche<span className="text-brand">.</span></>}>
        Projects and tools from across the Avalanche ecosystem.
      </SectionHeading>

      <section aria-labelledby="cascade" className="flex flex-col gap-5 rounded-xl border border-line bg-surface-2 p-6 sm:flex-row sm:items-center sm:gap-6">
        <Image src={cascadeLogo} alt="" width={72} height={72} className="size-18 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 id="cascade" className="text-2xl">Cascade</h2>
          <p className="mt-1 text-fg-muted">The map of the Avalanche ecosystem: every live project building on Avalanche, with its links and more.</p>
          {cascade && (
            <p className="mt-2 text-sm text-fg-body">
              <span className="font-medium text-fg-heading tabular-nums">{num.format(cascade.projects)}</span> live projects ·{' '}
              <span className="font-medium text-fg-heading tabular-nums">{num.format(cascade.categories)}</span> categories
            </p>
          )}
        </div>
        <Button asChild variant="outline" className="self-start sm:self-center">
          <a href={CASCADE_URL} target="_blank" rel="noopener noreferrer">Explore Cascade <ArrowUpRight aria-hidden /><span className="sr-only">(opens in a new tab)</span></a>
        </Button>
      </section>

      {toolsOn && (
        <section aria-labelledby="community-tools" className="mt-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-[60ch]">
              <h2 id="community-tools" className="text-3xl">Community Tools</h2>
              <p className="mt-2 text-fg-muted">Developer tools from builders in the community, reviewed by team1.</p>
            </div>
            <Button asChild variant="outline"><Link href="/tooling">All community tools <ArrowRight aria-hidden /></Link></Button>
          </div>
          {tools.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {tools.map((t) => <li key={t.slug}><ToolCard tool={t} /></li>)}
            </ul>
          ) : (
            <p className="text-fg-muted">No tools listed yet. <Link href="/tooling/submit" className="text-fg-heading underline underline-offset-4">Submit yours</Link>.</p>
          )}
        </section>
      )}
    </div>
  )
}
