import { Form, NavLink } from '@remix-run/react'

type NavPage = 'game' | 'administration'

export function AppTopNav({ user, active }: { user: { name?: string; email?: string }; active: NavPage }) {
  const displayName = user.name || user.email || 'Player'
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <header className="bg-slate-900 text-slate-100 shadow">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-500 px-3 py-1 text-sm font-bold uppercase tracking-wide">Game Hub</div>
          <nav className="flex items-center gap-2 text-sm font-semibold">
            <NavLink
              to="/game"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 transition ${isActive || active === 'game' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800'}`
              }
            >
              Game
            </NavLink>
            <NavLink
              to="/administration"
              className={({ isActive }) =>
                `rounded-md px-3 py-2 transition ${isActive || active === 'administration' ? 'bg-slate-800 text-white' : 'text-slate-200 hover:bg-slate-800'}`
              }
            >
              Administration
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full bg-slate-800 px-3 py-1 text-sm">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold">{initials}</div>
            <span className="text-slate-200">{displayName}</span>
          </div>
          <Form method="post" action="/auth/logout">
            <button
              type="submit"
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700"
            >
              Logout
            </button>
          </Form>
        </div>
      </div>
    </header>
  )
}
