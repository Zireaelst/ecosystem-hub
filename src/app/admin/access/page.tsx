import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { DataTable } from '@/components/data-table'
import { PageHeader } from '@/components/layout/page-header'
import { SearchForm } from '@/components/layout/search-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/guards'
import { textParam } from '@/lib/params'
import { envSuperAdminEmails } from '@/lib/session'
import { isPermission } from '@/lib/permissions'
import { userSearchWhere } from '@/lib/user-search'
import { DeleteRoleButton, RoleDialog } from './_components/role-dialog'

export const metadata: Metadata = { title: 'Access' }

const PERSON = { id: true, name: true, email: true, isSuperAdmin: true, roles: { select: { role: { select: { label: true } } } }, _count: { select: { permissions: true } } } as const

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireSuperAdmin()
  const q = textParam((await searchParams).q)
  const [roles, users] = await Promise.all([
    prisma.role.findMany({ orderBy: { label: 'asc' }, include: { _count: { select: { users: true } } } }),
    q
      ? prisma.user.findMany({ where: userSearchWhere(q), take: 20, orderBy: { name: 'asc' }, select: PERSON })
      : prisma.user.findMany({
          where: {
            OR: [
              { isSuperAdmin: true },
              { email: { in: envSuperAdminEmails(), mode: 'insensitive' } },
              { roles: { some: {} } },
              { permissions: { some: {} } },
            ],
          },
          take: 50,
          orderBy: { name: 'asc' },
          select: PERSON,
        }),
  ])
  const envAdmins = new Set(envSuperAdminEmails().map((e) => e.toLowerCase()))

  return (
    <>
      <PageHeader title="Access" description="Roles bundle permissions; assign roles or single permissions to people.">
        <RoleDialog trigger={<Button size="sm"><Plus aria-hidden /> New role</Button>} />
      </PageHeader>

      <section className="mb-12">
        <h2 className="mb-1 text-lg">People</h2>
        <p className="mb-4 text-sm text-fg-muted">{q ? 'Search results.' : 'Everyone with any access. Search to find others.'}</p>
        <SearchForm q={q} placeholder="Search name or email" />
        <DataTable
          id="admin-access-people"
          empty="No one found."
          columns={[
            { key: 'name', label: 'Name', sortable: true, hideable: false },
            { key: 'email', label: 'Email', sortable: true },
            { key: 'access', label: 'Access' },
            { key: 'direct', label: 'Direct permissions', sortable: true, firstDir: 'desc' },
          ]}
          rows={users.map((u) => {
            const superAdmin = u.isSuperAdmin || envAdmins.has(u.email.toLowerCase())
            return {
              id: u.id,
              sort: { name: u.name, email: u.email, direct: u._count.permissions },
              cells: {
                name: <Link href={`/admin/access/users/${u.id}`} className="text-fg-heading underline-offset-4 hover:underline">{u.name}</Link>,
                email: u.email,
                access: (
                  <span className="space-x-1">
                    {superAdmin && <Badge>Super admin{u.isSuperAdmin ? '' : ' (env)'}</Badge>}
                    {u.roles.map((r) => <Badge key={r.role.label} variant="secondary">{r.role.label}</Badge>)}
                  </span>
                ),
                direct: u._count.permissions || '',
              },
            }
          })}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg">Roles</h2>
        <DataTable
          id="admin-roles"
          empty="No roles yet."
          columns={[
            { key: 'label', label: 'Role', sortable: true, hideable: false },
            { key: 'permissions', label: 'Permissions' },
            { key: 'holders', label: 'Holders', sortable: true, firstDir: 'desc' },
            { key: 'actions', label: '', hideable: false, className: 'text-right whitespace-nowrap' },
          ]}
          rows={roles.map(({ _count, ...role }) => ({
            id: role.id,
            sort: { label: role.label },
            cells: {
              label: (
                <>
                  <div className="text-fg-heading">{role.label}</div>
                  <code className="text-xs text-fg-faint">{role.slug}</code>
                </>
              ),
              permissions: (
                <span className="space-x-1">
                  {role.permissions.map((p) => (
                    <Badge key={p} variant={isPermission(p) ? 'secondary' : 'outline'} title={isPermission(p) ? undefined : 'Unknown key - ignored'}>{p}</Badge>
                  ))}
                </span>
              ),
              holders: _count.users,
              actions: (
                <>
                  <RoleDialog role={{ ...role, permissions: role.permissions.filter(isPermission) }} trigger={<Button variant="ghost" size="sm">Edit</Button>} />
                  <DeleteRoleButton role={role} holders={_count.users} />
                </>
              ),
            },
          }))}
        />
      </section>

    </>
  )
}
