import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { useMemo, type CSSProperties } from 'react'
import { AppTopNav } from '~/components/AppTopNav'
import { requireAuth } from '~/services/auth.server'
import {
  GAME_STATUSES,
  type GameMembership,
  generateGameLayout,
  listAdminGames,
  listMemberGames,
  reorderPlayerOrder,
  setCurrentGameForUser,
  updateGameStatus
} from '~/services/games.server'

type ActionMessage = { ok: boolean; message: string }

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const [adminGames, memberGames] = await Promise.all([listAdminGames(user.email), listMemberGames(user.email)])
  const adminWithFlag: GameMembership[] = adminGames.map((g) => ({
    ...g,
    myStatus: 'admin',
    isCurrentForUser: g.players.some((p) => p.email === user.email && p.isCurrent)
  }))
  const memberWithFlag: GameMembership[] = memberGames.map((g) => ({
    ...g,
    isCurrentForUser:
      g.isCurrentForUser ?? g.players.some((p) => p.email === user.email && (p as any).isCurrent)
  }))
  const games: GameMembership[] = [...adminWithFlag, ...memberWithFlag]

  const url = new URL(request.url)
  const selectedId = url.searchParams.get('gameId')
  const selectedGameId = selectedId ? Number(selectedId) : games[0]?.id
  const selectedGame = games.find((g) => g.id === selectedGameId) ?? null

  return json({ user, games, selectedGameId, selectedGame })
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireAuth(request)
  if (!user.email) {
    throw new Error('User email is missing')
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') || '')
  const gameId = Number(formData.get('gameId'))
  if (!gameId) {
    return json<ActionMessage>({ ok: false, message: 'Missing game id.' }, { status: 400 })
  }

  switch (intent) {
    case 'generate-layout': {
      const preset = String(formData.get('preset') || '')
      const result = await generateGameLayout(gameId, user.email, preset === 'standard' ? { preset: 'standard' } : undefined)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }
    case 'reorder-players': {
      const orderJson = String(formData.get('orderJson') || '[]')
      const targetEmail = String(formData.get('targetEmail') || '')
      const direction = String(formData.get('direction') || '')
      let order: string[]
      try {
        order = JSON.parse(orderJson)
      } catch {
        return json<ActionMessage>({ ok: false, message: 'Invalid order payload.' }, { status: 400 })
      }
      const index = order.findIndex((email) => email === targetEmail)
      if (index === -1) {
        return json<ActionMessage>({ ok: false, message: 'Player not found in order.' }, { status: 400 })
      }
      if (direction === 'up' && index > 0) {
        ;[order[index - 1], order[index]] = [order[index], order[index - 1]]
      } else if (direction === 'down' && index < order.length - 1) {
        ;[order[index + 1], order[index]] = [order[index], order[index + 1]]
      }
      const result = await reorderPlayerOrder(gameId, user.email, order)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }
    case 'update-status': {
      const status = formData.get('status')
      if (!status || !GAME_STATUSES.includes(status as any)) {
        return json<ActionMessage>({ ok: false, message: 'Invalid status.' }, { status: 400 })
      }
      const result = await updateGameStatus(gameId, user.email, status as (typeof GAME_STATUSES)[number])
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }
    case 'set-current': {
      const result = await setCurrentGameForUser(gameId, user.email)
      return json<ActionMessage>(result, { status: result.ok ? 200 : 400 })
    }
    default:
      return json<ActionMessage>({ ok: false, message: 'Unknown action.' }, { status: 400 })
  }
}

type HexTileProps = {
  tile: { id: number; terrain: string; token: number | null; hasRobber?: boolean }
}

function HexTile({ tile }: HexTileProps) {
  const style: CSSProperties = {
    width: 176,
    height: 192,
    clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
    ...terrainStyle(tile.terrain),
    position: 'relative',
    boxShadow: '0 6px 12px rgba(15, 23, 42, 0.18)',
    border: '2px solid rgba(0,0,0,0.08)'
  }

  const chipStyle: CSSProperties = {
    width: 70.4,
    height: 70.4,
    borderRadius: '50%',
    background: '#fef3c7',
    border: '2px solid #fbbf24',
    color: '#92400e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
  }

  const robberStyle: CSSProperties = {
    ...chipStyle,
    background: '#111827',
    color: '#f8fafc',
    borderColor: '#1f2937'
  }

  return (
    <div style={style} className="flex items-center justify-center text-center">
      <span className="absolute left-1 top-1 text-[10px] font-semibold text-slate-900 drop-shadow">#{tile.id}</span>
      <span className="absolute bottom-1 left-0 right-0 text-[11px] font-semibold uppercase tracking-wide text-slate-900 drop-shadow">
        {tile.terrain}
      </span>

      {tile.hasRobber ? (
        <div style={robberStyle}>R</div>
      ) : tile.token !== null ? (
        <div style={chipStyle}>{tile.token}</div>
      ) : null}
    </div>
  )
}

function normalizePlayerOrder(order: string[], confirmedPlayers: string[]) {
  const set = new Set(confirmedPlayers)
  const cleaned = order.filter((email) => set.has(email))
  for (const email of confirmedPlayers) {
    if (!cleaned.includes(email)) cleaned.push(email)
  }
  return cleaned
}

const HEX_ROW_LAYOUT = [3, 4, 5, 4, 3]

function chunkHexRows<T>(tiles: T[]): T[][] {
  const rows: T[][] = []
  let index = 0
  for (const length of HEX_ROW_LAYOUT) {
    rows.push(tiles.slice(index, index + length))
    index += length
  }
  return rows
}

function terrainStyle(terrain: string): CSSProperties {
  const palette: Record<string, string> = {
    wood: 'linear-gradient(135deg, #166534, #22c55e)',
    wheat: 'linear-gradient(135deg, #eab308, #facc15)',
    sheep: 'linear-gradient(135deg, #16a34a, #4ade80)',
    brick: 'linear-gradient(135deg, #9f1239, #f97316)',
    ore: 'linear-gradient(135deg, #475569, #94a3b8)',
    desert: 'linear-gradient(135deg, #eab308, #eab308)'
  }
  return {
    background: palette[terrain] ?? '#cbd5e1',
    color: '#0f172a'
  }
}

export default function GamePage() {
  const { user, games, selectedGame, selectedGameId } = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionMessage>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const gameState = selectedGame?.gameState ?? { playerOrder: [], tiles: [] }

  const confirmedPlayers = useMemo(() => {
    if (!selectedGame) return []
    return selectedGame.players.filter((p) => p.status === 'admin' || p.status === 'confirmed')
  }, [selectedGame])

  const hexRows = useMemo(() => chunkHexRows(gameState.tiles), [gameState.tiles])

  const orderedPlayers = useMemo(() => {
    if (!selectedGame) return []
    const order = normalizePlayerOrder(
      gameState.playerOrder ?? [],
      confirmedPlayers.map((p) => p.email)
    )
    return order
      .map((email) => confirmedPlayers.find((p) => p.email === email))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
  }, [selectedGame, confirmedPlayers, gameState.playerOrder])

  const orderJson = JSON.stringify(orderedPlayers.map((p) => p.email))

  return (
    <div className="min-h-screen bg-slate-50">
      <AppTopNav user={user} active="game" />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Game</h1>
            <p className="text-sm text-slate-600">
              Manage Catan game setup: player order, layout, and status. Changes save immediately.
            </p>
          </div>
          {games.length > 0 && (
            <Form method="get">
              <label className="text-sm font-semibold text-slate-800">
                Select game
                <select
                  name="gameId"
                  defaultValue={selectedGameId ?? undefined}
                  onChange={(e) => e.currentTarget.form?.submit()}
                  className="mt-1 w-56 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.myStatus}
                      {g.isCurrentForUser ? ', current' : ''})
                    </option>
                  ))}
                </select>
              </label>
            </Form>
          )}
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

        {games.length === 0 ? (
          <p className="text-sm text-slate-600">You are not part of any games yet.</p>
        ) : !selectedGame ? (
          <p className="text-sm text-slate-600">Select a game to manage its setup.</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{selectedGame.name}</h2>
                  <p className="text-sm text-slate-600">
                    Status: <span className="font-semibold">{selectedGame.status.replace('_', ' ')}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedGame.isCurrentForUser ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                      Current
                    </span>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="set-current" />
                      <input type="hidden" name="gameId" value={selectedGame.id} />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-60"
                      >
                        Set as current
                      </button>
                    </Form>
                  )}
                  {selectedGame.myStatus === 'admin' && (
                    <>
                      {selectedGame.status === 'not_started' && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="update-status" />
                          <input type="hidden" name="gameId" value={selectedGame.id} />
                          <input type="hidden" name="status" value="started" />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Start game
                          </button>
                        </Form>
                      )}
                      {selectedGame.status !== 'finished' && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="update-status" />
                          <input type="hidden" name="gameId" value={selectedGame.id} />
                          <input type="hidden" name="status" value="finished" />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-60"
                          >
                            Finish game
                          </button>
                        </Form>
                      )}
                      {selectedGame.status !== 'not_started' && (
                        <Form method="post">
                          <input type="hidden" name="intent" value="update-status" />
                          <input type="hidden" name="gameId" value={selectedGame.id} />
                          <input type="hidden" name="status" value="not_started" />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60"
                          >
                            Reset to not started
                          </button>
                        </Form>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Player order</h3>
                    <p className="text-sm text-slate-600">Admin can reorder before the game starts.</p>
                  </div>
                  {selectedGame.myStatus === 'admin' && selectedGame.status === 'not_started' && (
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                      Autosaves
                    </span>
                  )}
                </div>

                {orderedPlayers.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">No confirmed players yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2 text-sm">
                    {orderedPlayers.map((player, index) => (
                      <li
                        key={player.id}
                        className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            #{index + 1}
                          </span>
                          <span className="font-semibold text-slate-900">{player.email}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                              player.status === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {player.status}
                          </span>
                        </div>
                        {selectedGame.myStatus === 'admin' && selectedGame.status === 'not_started' && (
                          <div className="flex items-center gap-1">
                            <Form method="post">
                              <input type="hidden" name="intent" value="reorder-players" />
                              <input type="hidden" name="gameId" value={selectedGame.id} />
                              <input type="hidden" name="orderJson" value={orderJson} />
                              <input type="hidden" name="targetEmail" value={player.email} />
                              <input type="hidden" name="direction" value="up" />
                              <button
                                type="submit"
                                disabled={isSubmitting || index === 0}
                                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                              >
                                ↑
                              </button>
                            </Form>
                            <Form method="post">
                              <input type="hidden" name="intent" value="reorder-players" />
                              <input type="hidden" name="gameId" value={selectedGame.id} />
                              <input type="hidden" name="orderJson" value={orderJson} />
                              <input type="hidden" name="targetEmail" value={player.email} />
                              <input type="hidden" name="direction" value="down" />
                              <button
                                type="submit"
                                disabled={isSubmitting || index === orderedPlayers.length - 1}
                                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                              >
                                ↓
                              </button>
                            </Form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Board layout</h3>
                    <p className="text-sm text-slate-600">Generate hexes and number tokens before starting.</p>
                  </div>
                  {selectedGame.myStatus === 'admin' && selectedGame.status === 'not_started' && (
                    <div className="flex flex-wrap gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="generate-layout" />
                        <input type="hidden" name="gameId" value={selectedGame.id} />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                          Create random layout
                        </button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="generate-layout" />
                        <input type="hidden" name="gameId" value={selectedGame.id} />
                        <input type="hidden" name="preset" value="standard" />
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Create standard layout
                        </button>
                      </Form>
                    </div>
                  )}
                </div>

                {gameState.tiles.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">No layout yet. Generate to place hexes and tokens.</p>
                ) : (
                  <div style={{ marginTop: 100 }}>
                    {hexRows.map((row, rowIndex) => (
                      <div
                        key={rowIndex}
                        className="flex justify-center"
                        style={{
                          marginLeft: 0,
                          columnGap: 2,
                          marginTop: rowIndex === 0 ? 0 : -45
                        }}
                      >
                        {row.map((tile) => (
                          <HexTile key={tile.id} tile={tile} />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
