/** Public-page section header: big title left, muted copy right, bottom-aligned. `as="h1"` when it is the page's title. */
export function SectionHeading({ title, children, id, as: Heading = 'h2' }: { title: React.ReactNode; children?: React.ReactNode; id?: string; as?: 'h1' | 'h2' }) {
  return (
    <div className="mb-10 grid gap-4 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:gap-20">
      <Heading id={id} className="text-[clamp(2rem,4vw,3.5rem)] leading-[1.05] tracking-[-0.012em]">{title}</Heading>
      {children && <div className="max-w-[52ch] text-fg-muted">{children}</div>}
    </div>
  )
}
