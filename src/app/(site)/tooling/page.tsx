import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Pager } from '@/components/layout/pager'
import { SearchForm } from '@/components/layout/search-form'
import { SectionHeading } from '@/components/section-heading'
import { Button } from '@/components/ui/button'
import { canonical } from '@/lib/metadata'
import { pageParam, textParam } from '@/lib/params'
import { ToolCard } from './_components/tool-card'
import { anyPublicTool, listPublicTools } from './_lib/queries'
import { QUERY_MAX } from './_lib/rules'

export const metadata: Metadata = {
  title: 'Community Tools',
  description: 'Developer tools built by builders in the Avalanche community, reviewed by team1 before they are listed.',
  ...canonical('/tooling'),
}

export default async function ToolingPage({ searchParams }: { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> }) {
  const sp = await searchParams
  const q = textParam(sp.q, QUERY_MAX)
  const page = pageParam(sp.page)
  const { tools, hasMore } = await listPublicTools({ q, page })
  // An empty first page without a search means nothing is listed; otherwise ask the database once.
  const any = tools.length > 0 || (q || page > 1 ? await anyPublicTool() : false)
  const outOfRange = tools.length === 0 && page > 1
  const firstPage = q ? `/tooling?${new URLSearchParams({ q })}` : '/tooling'
  return (
    <div className="container-page py-14 sm:py-20">
      <SectionHeading as="h1" title={<>Community Tools<span className="text-brand">.</span></>}>
        Developer tools built and run by builders in the Avalanche community, not by team1. Team1 reviews each project before it is listed, but hasn&apos;t audited the code.
      </SectionHeading>

      {any && <SearchForm q={q} placeholder="Search tools" />}

      {tools.length > 0 ? (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((t) => <li key={t.slug}><ToolCard tool={t} /></li>)}
        </ul>
      ) : outOfRange ? (
        <EmptyState className="mt-8" title="No tools on this page" action={<Button asChild variant="outline"><Link href={firstPage}>Back to first page</Link></Button>} />
      ) : (
        <EmptyState
          className="mt-8"
          title={q && any ? `No tools match “${q}”` : 'No tools listed yet'}
          action={q && <Button asChild variant="outline"><Link href="/tooling">Clear search</Link></Button>}
        >
          {q && any ? 'Try fewer or different words.' : 'Builders’ projects show up here once team1 has reviewed them.'}
        </EmptyState>
      )}
      {!outOfRange && <Pager page={page} hasMore={hasMore} params={{ q }} />}

      <section aria-labelledby="submit-heading" className="mt-20 border-t border-line pt-12">
        <h2 id="submit-heading" className="text-2xl">Built a tool?</h2>
        <p className="mt-2 max-w-[60ch] text-fg-muted">
          Submit your hub project if it is live and in the “Developer Tooling” category. Team1 reviews it before it is listed here.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/tooling/submit">Submit your project <ArrowRight aria-hidden /></Link>
        </Button>
      </section>
    </div>
  )
}
