import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BackLink } from '@/components/back-link'
import { ProjectVersionView } from '@/components/project-version-view'
import { canonical } from '@/lib/metadata'
import { getPublicTool } from '../_lib/queries'
import { toolHref } from '../_lib/rules'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = await getPublicTool((await params).slug)
  if (!tool) return {}
  return { title: `${tool.version.name} · Tooling`, description: tool.version.shortDescription, ...canonical(toolHref(tool)) }
}

const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

/** A listed tool: the version team1 approved, shown like a project page (the same view reviewers approve), without the team or its country. */
export default async function ToolPage({ params }: Props) {
  const tool = await getPublicTool((await params).slug)
  if (!tool) notFound()
  return (
    <div className="container-page max-w-4xl py-10 sm:py-16">
      <BackLink href="/tooling">Tooling</BackLink>
      <div className="mt-6">
        <ProjectVersionView version={tool.version} hideCountry titleAs="h1" />
      </div>
      <p className="mt-10 border-t border-line pt-6 text-sm text-fg-muted">
        {tool.approvedAt && <>Last reviewed on {formatDate(tool.approvedAt)}. </>}Built by the community; team1 hasn&apos;t audited it.
      </p>
    </div>
  )
}
