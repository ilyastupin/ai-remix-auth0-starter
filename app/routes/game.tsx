import type { LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { AppTopNav } from '~/components/AppTopNav'
import { requireAuth } from '~/services/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }
  return json({ user })
}

export default function GamePage() {
  const { user } = useLoaderData<typeof loader>()

  return (
    <div className="min-h-screen bg-slate-50">
      <AppTopNav user={user} active="game" />
      <main className="mx-auto max-w-5xl px-4 py-10 space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">Game</h1>
        <p className="text-sm text-slate-600">This page is reserved for in-game content and is currently empty.</p>
      </main>
    </div>
  )
}
