import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import type { FormEvent } from 'react'
import { format } from 'date-fns'
import { AppTopNav } from '~/components/AppTopNav'
import { requireAuth } from '~/services/auth.server'
import {
  approvePlayer,
  createGame,
  deleteGame,
  leaveGame,
  listAdminGames,
  listMemberGames,
  rejectPlayer,
  removePlayer,
  requestJoinGame,
  setCurrentGameForUser
} from '~/services/games.server'

type ActionMessage = { ok: boolean; message: string }

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const [adminGames, memberGames] = await Promise.all([listAdminGames(user.email), listMemberGames(user.email)])

  const markCurrent = <T extends { players: { email: string; isCurrent?: boolean }[] }>(game: T) => ({
    ...game,
    isCurrentForUser: game.players.some((p) => p.email === user.email && p.isCurrent)
  })

  const adminGamesWithFlag = adminGames.map((g) => markCurrent(g))
  const memberGamesWithFlag = memberGames.map((g) =>
    g.isCurrentForUser === undefined ? markCurrent(g) : g
  )

  return json({ user, adminGames: adminGamesWithFlag, memberGames: memberGamesWithFlag })
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') || '')

  switch (intent) {
    case 'create-game': {
      const name = String(formData.get('name') || '').trim()
      if (!name) return json<ActionMessage>({ ok: false, message: 'Game name is required.' }, { status: 400 })

      const game = await createGame(name, user.email)
      return json<ActionMessage>({ ok: true, message: `Created "${game.name}". Join code: ${game.joinCode}` })
    }

    case 'join-game': {
      const joinCode = String(formData.get('joinCode') || '').trim()
      if (!/^[0-9]{6}$/.test(joinCode)) {
        return json<ActionMessage>({ ok: false, message: 'Join code must be 6 digits.' }, { status: 400 })
      }
      const result = await requestJoinGame(joinCode, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'approve-player': {
      const gameId = Number(formData.get('gameId'))
      const targetEmail = String(formData.get('targetEmail') || '').trim()
      if (!gameId || !targetEmail) return json<ActionMessage>({ ok: false, message: 'Missing parameters.' }, { status: 400 })
      const result = await approvePlayer(gameId, targetEmail, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'reject-player': {
      const gameId = Number(formData.get('gameId'))
      const targetEmail = String(formData.get('targetEmail') || '').trim()
      if (!gameId || !targetEmail) return json<ActionMessage>({ ok: false, message: 'Missing parameters.' }, { status: 400 })
      const result = await rejectPlayer(gameId, targetEmail, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'remove-player': {
      const gameId = Number(formData.get('gameId'))
      const targetEmail = String(formData.get('targetEmail') || '').trim()
      if (!gameId || !targetEmail) return json<ActionMessage>({ ok: false, message: 'Missing parameters.' }, { status: 400 })
      const result = await removePlayer(gameId, targetEmail, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'delete-game': {
      const gameId = Number(formData.get('gameId'))
      if (!gameId) return json<ActionMessage>({ ok: false, message: 'Missing game id.' }, { status: 400 })
      const result = await deleteGame(gameId, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'set-current': {
      const gameId = Number(formData.get('gameId'))
      if (!gameId) return json<ActionMessage>({ ok: false, message: 'Missing game id.' }, { status: 400 })
      const result = await setCurrentGameForUser(gameId, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    case 'leave-game': {
      const gameId = Number(formData.get('gameId'))
      if (!gameId) return json<ActionMessage>({ ok: false, message: 'Missing game id.' }, { status: 400 })
      const result = await leaveGame(gameId, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }

    default:
      return json<ActionMessage>({ ok: false, message: 'Unknown action.' }, { status: 400 })
  }
}

export default function AdministrationPage() {
  const { user, adminGames, memberGames } = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionMessage>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'

  async function confirmAndSubmit(event: FormEvent<HTMLFormElement>, title: string, confirmText: string) {
    event.preventDefault()
    const form = event.currentTarget
    let confirmed = false
    try {
      const Swal = (await import('sweetalert2')).default
      const result = await Swal.fire({
        title,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc2626'
      })
      confirmed = result.isConfirmed
    } catch {
      confirmed = window.confirm(title)
    }

    if (confirmed) {
      form.submit()
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppTopNav user={user} active="administration" />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-slate-900">Administration</h1>
          <p className="text-sm text-slate-600">
            Create games, share join codes, approve requests, and manage players. Anyone authenticated can use this area.
          </p>
        </div>

        {actionData && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              actionData.ok
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {actionData.message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Start a new game</h2>
            <p className="text-sm text-slate-600">Creates a 6-digit join code; you become the game admin.</p>
            <Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="intent" value="create-game" />
              <label className="block text-sm font-semibold text-slate-800">
                Game name
                <input
                  name="name"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g. Friday Poker Night"
                  disabled={isSubmitting}
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
              >
                Create game
              </button>
            </Form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Join an existing game</h2>
            <p className="text-sm text-slate-600">Enter the 6-digit code from a game admin. You will be marked as waiting.</p>
            <Form method="post" className="mt-4 space-y-3">
              <input type="hidden" name="intent" value="join-game" />
              <label className="block text-sm font-semibold text-slate-800">
                Join code
                <input
                  name="joinCode"
                  type="text"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  minLength={6}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="123456"
                  disabled={isSubmitting}
                />
              </label>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
              >
                Request to join
              </button>
            </Form>
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Games I administer</h2>
              <p className="text-sm text-slate-600">See join codes, approve waiting players, remove players, or delete the game.</p>
            </div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
              Join code visible here
            </span>
          </div>

          {adminGames.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">You have not created any games yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {adminGames.map((game) => {
                const confirmedPlayers = game.players.filter((p) => p.status === 'admin' || p.status === 'confirmed')
                const waitingPlayers = game.players.filter((p) => p.status === 'waiting')

                return (
                  <div key={game.id} className="rounded-lg border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{game.name}</h3>
                        <p className="text-xs text-slate-600">
                          Created {format(game.createdAt, 'PPP p')} by {game.createdBy}
                        </p>
                      </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                        Join code: {game.joinCode}
                      </span>
                      {game.isCurrentForUser ? (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Current
                        </span>
                      ) : (
                        <Form method="post">
                          <input type="hidden" name="intent" value="set-current" />
                          <input type="hidden" name="gameId" value={game.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-60"
                          >
                            Set as current
                          </button>
                        </Form>
                      )}
                      <Form
                        method="post"
                        onSubmit={(event) => confirmAndSubmit(event, 'Delete this game?', 'Yes, delete it')}
                      >
                          <input type="hidden" name="intent" value="delete-game" />
                          <input type="hidden" name="gameId" value={game.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                          >
                            Delete game
                          </button>
                        </Form>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Confirmed players</h4>
                        {confirmedPlayers.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-600">No confirmed players yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm">
                            {confirmedPlayers.map((player) => (
                              <li
                                key={player.id}
                                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-900">{player.email}</span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                      player.status === 'admin'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {player.status}
                                  </span>
                                </div>
                                {player.status !== 'admin' && (
                                  <Form
                                    method="post"
                                    onSubmit={(event) =>
                                      confirmAndSubmit(event, `Remove ${player.email}?`, 'Yes, remove')
                                    }
                                  >
                                    <input type="hidden" name="intent" value="remove-player" />
                                    <input type="hidden" name="gameId" value={game.id} />
                                    <input type="hidden" name="targetEmail" value={player.email} />
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                                    >
                                      Remove
                                    </button>
                                  </Form>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Waiting requests</h4>
                        {waitingPlayers.length === 0 ? (
                          <p className="mt-2 text-sm text-slate-600">No pending requests.</p>
                        ) : (
                          <ul className="mt-2 space-y-2 text-sm">
                            {waitingPlayers.map((player) => (
                              <li
                                key={player.id}
                                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                              >
                                <span className="font-semibold text-slate-900">{player.email}</span>
                                <div className="flex items-center gap-2">
                                  <Form method="post">
                                    <input type="hidden" name="intent" value="approve-player" />
                                    <input type="hidden" name="gameId" value={game.id} />
                                    <input type="hidden" name="targetEmail" value={player.email} />
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                      Approve
                                    </button>
                                  </Form>
                                  <Form
                                    method="post"
                                    onSubmit={(event) =>
                                      confirmAndSubmit(event, `Reject ${player.email}?`, 'Yes, reject')
                                    }
                                  >
                                    <input type="hidden" name="intent" value="reject-player" />
                                    <input type="hidden" name="gameId" value={game.id} />
                                    <input type="hidden" name="targetEmail" value={player.email} />
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                                    >
                                      Reject
                                    </button>
                                  </Form>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Games I&apos;m in</h2>
              <p className="text-sm text-slate-600">Shows games where you are waiting or confirmed. Join codes stay hidden.</p>
            </div>
          </div>

          {memberGames.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">You have not joined any games yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {memberGames.map((game) => {
                const confirmedPlayers = game.players.filter((p) => p.status === 'admin' || p.status === 'confirmed')
                const isWaiting = game.myStatus === 'waiting'

                return (
                  <div key={game.id} className="rounded-lg border border-slate-200 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{game.name}</h3>
                        <p className="text-xs text-slate-600">Created {format(game.createdAt, 'PPP p')}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                            isWaiting ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          Your status: {game.myStatus}
                        </span>
                        {game.isCurrentForUser ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                            Current
                          </span>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="set-current" />
                            <input type="hidden" name="gameId" value={game.id} />
                            <button
                              type="submit"
                              disabled={isSubmitting}
                              className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-60"
                            >
                              Set as current
                            </button>
                          </Form>
                        )}
                      </div>
                    </div>

                    {isWaiting ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-slate-600">Waiting for admin approval.</p>
                        <Form
                          method="post"
                          onSubmit={(event) => confirmAndSubmit(event, 'Cancel this join request?', 'Yes, cancel')}
                        >
                          <input type="hidden" name="intent" value="leave-game" />
                          <input type="hidden" name="gameId" value={game.id} />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                          >
                            Cancel request
                          </button>
                        </Form>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-800">Confirmed players</h4>
                        {confirmedPlayers.length === 0 ? (
                          <p className="text-sm text-slate-600">No confirmed players yet.</p>
                        ) : (
                          <ul className="space-y-2 text-sm">
                            {confirmedPlayers.map((player) => (
                              <li
                                key={player.id}
                                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-slate-900">{player.email}</span>
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                                      player.status === 'admin'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    {player.status === 'admin' ? 'admin' : 'confirmed'}
                                  </span>
                                </div>
                                {player.email === user.email && (
                                  <Form
                                    method="post"
                                    onSubmit={(event) => confirmAndSubmit(event, 'Leave this game?', 'Yes, leave')}
                                  >
                                    <input type="hidden" name="intent" value="leave-game" />
                                    <input type="hidden" name="gameId" value={game.id} />
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="rounded-md bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                    >
                                      Leave game
                                    </button>
                                  </Form>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
