import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise'
import { getPool } from '~/db/pool.server'

export const PLAYER_STATUSES = ['admin', 'waiting', 'confirmed'] as const
export type GamePlayerStatus = (typeof PLAYER_STATUSES)[number]

export type GamePlayer = {
  id: number
  gameId: number
  email: string
  status: GamePlayerStatus
  createdAt: Date
  updatedAt: Date
}

export type Game = {
  id: number
  name: string
  joinCode: string
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export type GameWithPlayers = Game & { players: GamePlayer[] }
export type GameMembership = GameWithPlayers & { myStatus: GamePlayerStatus }

export type ActionResult = { ok: boolean; message: string }

type GameRow = RowDataPacket & {
  id: number
  name: string
  join_code: string
  created_by: string
  created_at: Date
  updated_at: Date
}

type PlayerRow = RowDataPacket & {
  id: number
  game_id: number
  player_email: string
  status: GamePlayerStatus
  created_at: Date
  updated_at: Date
}

function mapGameRow(row: GameRow): Game {
  return {
    id: Number(row.id),
    name: String(row.name),
    joinCode: String(row.join_code),
    createdBy: String(row.created_by),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

function mapPlayerRow(row: PlayerRow): GamePlayer {
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    email: String(row.player_email),
    status: row.status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

async function generateJoinCode(): Promise<string> {
  const pool = getPool()
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = String(Math.floor(Math.random() * 900000) + 100000)
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM games WHERE join_code = ? LIMIT 1', [code])
    if (rows.length === 0) return code
  }
  throw new Error('Could not generate a unique join code')
}

async function fetchPlayersByGameIds(gameIds: number[]): Promise<Record<number, GamePlayer[]>> {
  if (gameIds.length === 0) return {}
  const pool = getPool()
  const [rows] = await pool.query<PlayerRow[]>(
    `SELECT id, game_id, player_email, status, created_at, updated_at
     FROM game_players
     WHERE game_id IN (?)
     ORDER BY status = 'admin' DESC, status = 'confirmed' DESC, created_at ASC`,
    [gameIds]
  )

  return rows.reduce<Record<number, GamePlayer[]>>((acc, row) => {
    const mapped = mapPlayerRow(row)
    acc[mapped.gameId] = acc[mapped.gameId] || []
    acc[mapped.gameId].push(mapped)
    return acc
  }, {})
}

async function isAdmin(gameId: number, email: string): Promise<boolean> {
  const pool = getPool()
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM game_players WHERE game_id = ? AND player_email = ? AND status = 'admin' LIMIT 1`,
    [gameId, email]
  )
  return rows.length > 0
}

async function getPlayer(gameId: number, email: string): Promise<GamePlayer | null> {
  const pool = getPool()
  const [rows] = await pool.query<PlayerRow[]>(
    `SELECT id, game_id, player_email, status, created_at, updated_at FROM game_players WHERE game_id = ? AND player_email = ? LIMIT 1`,
    [gameId, email]
  )
  if (rows.length === 0) return null
  return mapPlayerRow(rows[0])
}

async function getGame(gameId: number): Promise<GameWithPlayers | null> {
  const pool = getPool()
  const [rows] = await pool.query<GameRow[]>(
    `SELECT id, name, join_code, created_by, created_at, updated_at FROM games WHERE id = ? LIMIT 1`,
    [gameId]
  )
  if (rows.length === 0) return null
  const playersMap = await fetchPlayersByGameIds([gameId])
  return { ...mapGameRow(rows[0]), players: playersMap[gameId] ?? [] }
}

async function getGameByJoinCode(joinCode: string): Promise<GameWithPlayers | null> {
  const pool = getPool()
  const [rows] = await pool.query<GameRow[]>(
    `SELECT id, name, join_code, created_by, created_at, updated_at FROM games WHERE join_code = ? LIMIT 1`,
    [joinCode]
  )
  if (rows.length === 0) return null
  const gameId = Number(rows[0].id)
  const playersMap = await fetchPlayersByGameIds([gameId])
  return { ...mapGameRow(rows[0]), players: playersMap[gameId] ?? [] }
}

export async function createGame(name: string, creatorEmail: string): Promise<GameWithPlayers> {
  const pool = getPool()
  const joinCode = await generateJoinCode()

  const [result] = await pool.query<ResultSetHeader>(
    `INSERT INTO games (name, join_code, created_by) VALUES (?, ?, ?)`,
    [name, joinCode, creatorEmail]
  )
  const gameId = Number(result.insertId)

  await pool.query(
    `INSERT INTO game_players (game_id, player_email, status) VALUES (?, ?, 'admin')`,
    [gameId, creatorEmail]
  )

  const game = await getGame(gameId)
  if (!game) {
    throw new Error('Failed to load game after creation')
  }
  return game
}

export async function listAdminGames(email: string): Promise<GameWithPlayers[]> {
  const pool = getPool()
  const [rows] = await pool.query<GameRow[]>(
    `SELECT g.id, g.name, g.join_code, g.created_by, g.created_at, g.updated_at
     FROM games g
     INNER JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.player_email = ? AND gp.status = 'admin'
     ORDER BY g.created_at DESC`,
    [email]
  )

  const gameIds = rows.map((row) => Number(row.id))
  const playersMap = await fetchPlayersByGameIds(gameIds)

  return rows.map((row) => {
    const mapped = mapGameRow(row)
    return { ...mapped, players: playersMap[mapped.id] ?? [] }
  })
}

export async function listMemberGames(email: string): Promise<GameMembership[]> {
  const pool = getPool()
  const [rows] = await pool.query<(GameRow & { my_status: GamePlayerStatus })[]>(
    `SELECT g.id, g.name, g.join_code, g.created_by, g.created_at, g.updated_at, gp.status AS my_status
     FROM games g
     INNER JOIN game_players gp ON gp.game_id = g.id
     WHERE gp.player_email = ?
     ORDER BY g.created_at DESC`,
    [email]
  )

  const nonAdminRows = rows.filter((row) => row.my_status !== 'admin')
  const gameIds = nonAdminRows.map((row) => Number(row.id))
  const playersMap = await fetchPlayersByGameIds(gameIds)

  return nonAdminRows.map((row) => {
    const mapped = mapGameRow(row)
    return {
      ...mapped,
      myStatus: row.my_status,
      players: playersMap[mapped.id] ?? []
    }
  })
}

export async function requestJoinGame(joinCode: string, email: string): Promise<ActionResult & { status?: GamePlayerStatus }> {
  const game = await getGameByJoinCode(joinCode)
  if (!game) {
    return { ok: false, message: 'Game not found with that code.' }
  }

  const existing = await getPlayer(game.id, email)
  if (existing) {
    if (existing.status === 'waiting') {
      return { ok: true, status: existing.status, message: 'You have already requested to join this game.' }
    }
    return { ok: true, status: existing.status, message: 'You are already part of this game.' }
  }

  const pool = getPool()
  await pool.query(`INSERT INTO game_players (game_id, player_email, status) VALUES (?, ?, 'waiting')`, [
    game.id,
    email
  ])

  return { ok: true, status: 'waiting', message: 'Join request submitted. Waiting for admin approval.' }
}

export async function approvePlayer(gameId: number, targetEmail: string, adminEmail: string): Promise<ActionResult> {
  if (!(await isAdmin(gameId, adminEmail))) {
    return { ok: false, message: 'You are not an admin for this game.' }
  }

  const pool = getPool()
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE game_players SET status = 'confirmed' WHERE game_id = ? AND player_email = ?`,
    [gameId, targetEmail]
  )

  if (result.affectedRows === 0) {
    return { ok: false, message: 'Player not found for this game.' }
  }

  return { ok: true, message: 'Player approved.' }
}

export async function rejectPlayer(gameId: number, targetEmail: string, adminEmail: string): Promise<ActionResult> {
  if (!(await isAdmin(gameId, adminEmail))) {
    return { ok: false, message: 'You are not an admin for this game.' }
  }

  const pool = getPool()
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM game_players WHERE game_id = ? AND player_email = ? AND status = 'waiting'`,
    [gameId, targetEmail]
  )

  if (result.affectedRows === 0) {
    return { ok: false, message: 'Waiting request not found.' }
  }

  return { ok: true, message: 'Join request rejected.' }
}

export async function removePlayer(gameId: number, targetEmail: string, adminEmail: string): Promise<ActionResult> {
  if (!(await isAdmin(gameId, adminEmail))) {
    return { ok: false, message: 'You are not an admin for this game.' }
  }

  const target = await getPlayer(gameId, targetEmail)
  if (!target) {
    return { ok: false, message: 'Player not found for this game.' }
  }
  if (target.status === 'admin') {
    return { ok: false, message: 'Cannot remove an admin from their own game.' }
  }

  const pool = getPool()
  await pool.query(`DELETE FROM game_players WHERE id = ?`, [target.id])
  return { ok: true, message: 'Player removed.' }
}

export async function deleteGame(gameId: number, adminEmail: string): Promise<ActionResult> {
  if (!(await isAdmin(gameId, adminEmail))) {
    return { ok: false, message: 'You are not an admin for this game.' }
  }

  const pool = getPool()
  const [result] = await pool.query<ResultSetHeader>(`DELETE FROM games WHERE id = ?`, [gameId])
  if (result.affectedRows === 0) {
    return { ok: false, message: 'Game not found.' }
  }

  return { ok: true, message: 'Game deleted.' }
}

export async function leaveGame(gameId: number, email: string): Promise<ActionResult> {
  const player = await getPlayer(gameId, email)
  if (!player) {
    return { ok: false, message: 'You are not part of this game.' }
  }
  if (player.status === 'admin') {
    return { ok: false, message: 'Admins cannot leave their own game. Delete the game instead.' }
  }

  const pool = getPool()
  await pool.query(`DELETE FROM game_players WHERE id = ?`, [player.id])
  return { ok: true, message: 'You left the game.' }
}
