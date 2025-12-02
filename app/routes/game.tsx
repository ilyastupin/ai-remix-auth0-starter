import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigation } from '@remix-run/react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
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
  const baseChipSize = 70.4
  const baseFontSize = 18

  function tokenFontScale(token: number | null): number {
    if (token === null) return 1
    if (token === 6 || token === 8) return 2
    if (token === 5 || token === 9) return 1.7
    if (token === 4 || token === 10) return 1.4
    if (token === 3 || token === 11) return 1.2
    return 1 // 2 or 12
  }

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
    width: baseChipSize,
    height: baseChipSize,
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
    width: baseChipSize,
    height: baseChipSize,
    borderRadius: '50%',
    background: '#111827',
    color: '#f8fafc',
    borderColor: '#1f2937',
    border: '2px solid #1f2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
    backgroundImage: 'url(/robber.png)',
    backgroundSize: '105% 105%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center'
  }

  return (
    <div style={style} className="flex items-center justify-center text-center">
      <span className="absolute left-1 top-1 text-[10px] font-semibold text-slate-900 drop-shadow">#{tile.id}</span>

      {tile.hasRobber ? (
        <div style={robberStyle}></div>
      ) : tile.token !== null ? (
        <div style={{ ...chipStyle, fontSize: baseFontSize * tokenFontScale(tile.token) }}>{tile.token}</div>
      ) : null}
    </div>
  )
}

const HEX_ROW_LAYOUT = [3, 4, 5, 4, 3]
const PLAYER_COLORS = ['#ef4444', '#22c55e', '#2563eb', '#f97316'] // red, green, blue, orange

function normalizePlayerOrder(order: string[], confirmedPlayers: string[]) {
  const set = new Set(confirmedPlayers)
  const cleaned = order.filter((email) => set.has(email))
  for (const email of confirmedPlayers) {
    if (!cleaned.includes(email)) cleaned.push(email)
  }
  return cleaned
}

function colorForPlayer(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}

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
  const images: Record<string, string> = {
    wood: '/wood.png',
    wheat: '/wheat.png',
    sheep: '/pasture.png',
    brick: '/hills.png',
    ore: '/mountains.png',
    desert: '/desert.png'
  }

  const palette: Record<string, string> = {
    desert: 'linear-gradient(135deg, #e5e7eb, #cbd5e1)'
  }

  const image = images[terrain]
  if (image) {
    return {
      backgroundImage: `url(${image})`,
      backgroundSize: '150% 150%',
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      color: '#0f172a'
    }
  }

  const bg = palette[terrain] ?? '#e5e7eb'
  return {
    background: bg,
    color: '#0f172a'
  }
}

export default function GamePage() {
  const { user, games, selectedGame, selectedGameId } = useLoaderData<typeof loader>()
  const actionData = useActionData<ActionMessage>()
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  const gameState = selectedGame?.gameState ?? { playerOrder: [], tiles: [] }
  const [flippedResource, setFlippedResource] = useState<string | null>(null)
  const flipTimer = useRef<NodeJS.Timeout | null>(null)
  const [playerStats, setPlayerStats] = useState<Record<string, { points: number; army: number; lArmy: boolean; lRoad: boolean }>>({})

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

  const handleDevClick = useCallback(async (card: { title: string; count: number; note: string }) => {
    const Swal = (await import('sweetalert2')).default
    await Swal.fire({
      title: card.title,
      html: `<p style="margin:4px 0;">Cards in deck: <strong>${card.count}</strong></p><p style="margin:4px 0;">${card.note}</p>`,
      icon: 'info',
      confirmButtonText: 'Close'
    })
  }, [])

  const resourceHexImages: Record<string, string> = {
    wheat: '/wheat.png',
    brick: '/hills.png',
    ore: '/mountains.png',
    wood: '/wood.png',
    sheep: '/pasture.png'
  }

  const handleResourceClick = useCallback((key: string) => {
    if (flipTimer.current) {
      clearTimeout(flipTimer.current)
    }
    setFlippedResource(key)
    flipTimer.current = setTimeout(() => setFlippedResource(null), 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (flipTimer.current) clearTimeout(flipTimer.current)
    }
  }, [])

  const currentPlayerColor = useMemo(() => {
    const idx = orderedPlayers.findIndex((p) => p.email === user.email)
    return colorForPlayer(idx >= 0 ? idx : 0)
  }, [orderedPlayers, user.email])

  useEffect(() => {
    if (orderedPlayers.length === 0) return
    setPlayerStats((prev) => {
      const next: typeof prev = {}
      orderedPlayers.forEach((p) => {
        next[p.email] = prev[p.email] ?? { points: 0, army: 0, lArmy: false, lRoad: false }
      })
      return next
    })
  }, [orderedPlayers])

  const randomizeStats = useCallback(() => {
    setPlayerStats((prev) => {
      const next: typeof prev = {}
      orderedPlayers.forEach((p, idx) => {
        const roadLen = Math.floor(Math.random() * 8)
        next[p.email] = {
          points: Math.floor(Math.random() * 10),
          army: Math.floor(Math.random() * 6),
          roadLen,
          lArmy: Math.random() > 0.7,
          lRoad: roadLen >= 5
        }
      })
      return next
    })
  }, [orderedPlayers])

  const clearStats = useCallback(() => {
    setPlayerStats((prev) => {
      const next: typeof prev = {}
      orderedPlayers.forEach((p) => {
        next[p.email] = { points: 0, army: 0, roadLen: 0, lArmy: false, lRoad: false }
      })
      return next
    })
  }, [orderedPlayers])

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
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={randomizeStats}
                      className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200"
                    >
                      Test stats
                    </button>
                    <button
                      type="button"
                      onClick={clearStats}
                      className="rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 hover:bg-slate-200"
                    >
                      Clear
                    </button>
                  </div>
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
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: colorForPlayer(index) }}
                            aria-label="player color"
                          />
                          <span className="font-semibold text-slate-900">
                            {player.email}
                            {player.email === user.email && (
                              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                                me
                              </span>
                            )}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                              player.status === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {player.status}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                              player.status === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {player.status}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-xs text-slate-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">
                              {Array.from({ length: playerStats[player.email]?.army ?? 0 }).map((_, i) => (
                                <span key={i}>⚔️</span>
                              ))}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">
                              {Array.from({ length: playerStats[player.email]?.roadLen ?? 0 }).map((_, i) => (
                                <span key={i}>🚂</span>
                              ))}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold">
                              🏆 {playerStats[player.email]?.points ?? 0} pts
                            </span>
                          <span
                            className="rounded-full px-2 py-1 font-semibold"
                            style={{
                              backgroundColor: playerStats[player.email]?.lArmy ? '#fef08a' : '#f8fafc',
                              color: playerStats[player.email]?.lArmy ? '#92400e' : '#cbd5e1'
                            }}
                          >
                            🛡️ Army
                          </span>
                          <span
                            className="rounded-full px-2 py-1 font-semibold"
                            style={{
                              backgroundColor: playerStats[player.email]?.lRoad ? '#fef08a' : '#f8fafc',
                              color: playerStats[player.email]?.lRoad ? '#92400e' : '#cbd5e1'
                            }}
                          >
                            🛤️ Road
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
                        </div>
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

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Pieces</h3>
                    <p className="text-sm text-slate-600">Your available settlements, cities, and roads.</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  {[
                    { key: 'settlement', image: '/settlement.svg', label: 'Settlements', count: 5 },
                    { key: 'city', image: '/city.svg', label: 'Cities', count: 4 },
                    { key: 'road', image: '/road.svg', label: 'Roads', count: 15 }
                  ].map((piece) => (
                    <div
                      key={piece.key}
                      className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm"
                      style={{ color: currentPlayerColor }}
                    >
                      <img src={piece.image} alt={piece.label} className="h-12 w-16 object-contain" />
                      <div className="mt-2 text-sm font-semibold text-slate-900">{piece.label}</div>
                      <div className="text-xs text-slate-600">Available: {piece.count}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Development cards</h3>
                    <p className="text-sm text-slate-600">Starter deck counts with quick reminders.</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-5">
                  {[
                    {
                      key: 'knight',
                      image: '/knight.png',
                      count: 14,
                      title: 'Knight',
                      note: 'Move the robber and steal 1 resource.'
                    },
                    {
                      key: 'road-building',
                      image: '/road-building.png',
                      count: 2,
                      title: 'Road Building',
                      note: 'Place 2 roads for free.'
                    },
                    {
                      key: 'year-of-plenty',
                      image: '/year-of-plenty.png',
                      count: 2,
                      title: 'Year of Plenty',
                      note: 'Take any 2 resource cards from the bank.'
                    },
                    {
                      key: 'monopoly',
                      image: '/monopoly.png',
                      count: 2,
                      title: 'Monopoly',
                      note: 'All players give you all of one resource type you choose.'
                    },
                    {
                      key: 'victory-point',
                      image: '/victory-point.png',
                      count: 5,
                      title: 'Victory Point',
                      note: 'Keep hidden; +1 VP at game end.'
                    }
                  ].map((card) => (
                    <div
                      key={card.key}
                      className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm text-center cursor-pointer"
                      onClick={() => handleDevClick({ title: card.title, count: card.count, note: card.note })}
                    >
                      <img src={card.image} alt={card.key} className="h-50 w-32 rounded-sm object-contain" />
                      <div className="mt-2 text-sm font-semibold text-slate-900">Cards: {card.count}</div>
                      <div className="mt-1 text-xs text-slate-600">{card.note}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Resource piles</h3>
                    <p className="text-sm text-slate-600">Available cards at start (19 each).</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-6">
                  {[
                    { key: 'wheat', image: '/bread.png' },
                    { key: 'brick', image: '/brick.png' },
                    { key: 'ore', image: '/iron.png' },
                    { key: 'wood', image: '/lumber.png' },
                    { key: 'sheep', image: '/sheep.png' },
                    { key: 'back', image: '/back-side.png' }
                  ].map((pile) => (
                    <div
                      key={pile.key}
                      className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 p-3 shadow-sm"
                      style={{ perspective: '1000px' }}
                      onClick={() => handleResourceClick(pile.key)}
                    >
                      <div
                        style={{
                          width: 128,
                          height: 200,
                          position: 'relative',
                          transformStyle: 'preserve-3d',
                          transition: 'transform 0.6s',
                          transform: flippedResource === pile.key ? 'rotateY(180deg)' : 'rotateY(0deg)'
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backfaceVisibility: 'hidden',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f8fafc'
                          }}
                        >
                          <img src={pile.image} alt={pile.key} className="h-full w-full object-contain" />
                        </div>
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            backgroundImage: `url(${resourceHexImages[pile.key] ?? ''})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundColor: '#e2e8f0'
                          }}
                        />
                        {pile.key === 'back' && (
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              backfaceVisibility: 'hidden',
                              transform: 'rotateY(180deg)',
                              borderRadius: '6px',
                              overflow: 'hidden',
                              backgroundImage: `url(${resourceHexImages[pile.key] ?? ''})`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center',
                              backgroundColor: '#e2e8f0'
                            }}
                          />
                        )}
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        Cards: {pile.key === 'back' ? 25 : 19}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  )
}
