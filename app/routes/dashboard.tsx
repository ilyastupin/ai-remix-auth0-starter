import type { LoaderFunctionArgs } from '@remix-run/node'
import { json, redirect } from '@remix-run/node'
import { NavLink, Outlet, useLoaderData, useOutletContext } from '@remix-run/react'
import { NavBar } from '~/components/NavBar'
import { requireAuth } from '~/services/auth.server'
import { getCleaningMeta } from '~/services/cleaningDashboard.server'
import { getUserAccess } from '~/utils/authAccess'

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const access = await getUserAccess(user.email)
  if (access !== 'admin') return redirect('/no-access')

  return json({
    user,
    access,
    meta: getCleaningMeta()
  })
}

export type DashboardContext = {
  user: { name?: string; email?: string }
  access: 'admin'
  meta: ReturnType<typeof getCleaningMeta>
}

export function useDashboardContext() {
  return useOutletContext<DashboardContext>()
}

export default function DashboardLayout() {
  const data = useLoaderData<typeof loader>()

  return (
    <div className="min-h-screen bg-slate-100">
      <NavBar user={data.user} title="Cleaning Schedule" access={data.access} />

      <div className="bg-white border-b border-slate-200">
        <nav className="max-w-6xl mx-auto flex gap-6 px-4 py-3 text-sm font-semibold text-slate-600">
          <DashboardLink to="/dashboard">Assignments</DashboardLink>
          <DashboardLink to="/dashboard/cleaners">Cleaners</DashboardLink>
          <DashboardLink to="/dashboard/jobs">Jobs</DashboardLink>
        </nav>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={data as DashboardContext} />
      </main>
    </div>
  )
}

type DashboardLinkProps = {
  to: string
  children: React.ReactNode
}

function DashboardLink({ to, children }: DashboardLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `px-2 py-1 transition ${isActive ? 'text-indigo-600 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-900'}`
      }
    >
      {children}
    </NavLink>
  )
}
