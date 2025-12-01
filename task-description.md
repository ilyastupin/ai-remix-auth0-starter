# Group Game Administration - Task Description

## Summary
- Auth already exists; user identity is their email.
- No global super-admin; anyone who passes Auth0 can access the app.
- Any signed-in user can create a game (becomes admin and confirmed player) and gets a generated unique 6-digit join code.
- Any signed-in user can attempt to join an existing game via the join code; they enter a waiting state until approved.
- The creator (admin) can view/manage join requests and confirmed players for their games.
- Players can see games they are part of (waiting or confirmed) and may leave a game; they cannot see join codes unless they are the admin.
- Top navigation shows two items: Game and Administration. Administration handles game creation/join/approval; Game handles Catan setup (status, order, layout).
- Admins can delete a game they created (removes all players and invalidates the join code).
- Catan game data is stored as JSON in the `games` table (game_state): player order, board layout (hexes + tokens), robber placement. Game statuses: `not_started`, `started`, `finished`.
- Player order can be rearranged only while `not_started`. Changes persist immediately.
- Board layout (hexes + tokens) can be generated via “Create layout” only while `not_started` (available from the Game page). Layout state is stored in JSON.
- Each user can mark exactly one game as current. If a user has no current game, a newly created game becomes current automatically. Users/admins can set any game they belong to as current; UI shows a Current flag.

## Roles and visibility
- Admin (per game): sees game name, created time, join code, all players (admin, waiting, confirmed). Can approve waiting, reject waiting, remove confirmed, and remove self if needed.
- Player (confirmed): sees game name and creation time, list of confirmed players, can leave game. Cannot see join code or manage others.
- Player (waiting): sees game name and creation time, their status as waiting. Cannot see join code or manage others.

## Data model (Games table)
- `id` (PK, uuid or serial)
- `name` (string)
- `created_at` (timestamp)
- `join_code` (char(6), unique, digits only)
- `players` (array or join table of `{ email, status }`)
  - `status`: `admin`, `waiting`, `confirmed`

## Administration page flows
1) Start a new game (any user)
   - Input: game name.
   - Backend generates unique 6-digit join code.
   - Creator is recorded as `admin` and `confirmed` for the game.
   - Show resulting game card including join code (for admin).

2) Join existing game (any user)
   - Input: 6-digit code.
   - If a game exists, show game name and creation time; ask “Do you want to join this game?”.
   - On confirm, add the user to the game as `waiting`.
   - Show the user in their “My games” list with status `waiting`.

3) Admin manage join requests
   - For each game where user is admin, show waiting players.
   - Actions: Approve (changes status to `confirmed`), Reject (removes request).
   - Admin can remove any confirmed player as well.
   - Admin can delete the entire game (removes all players and the join code stops working).

4) Player experience
   - “My games” lists games where the user is `waiting` or `confirmed`.
   - Confirmed players can view other confirmed players; waiting players cannot see the join code.
   - Any player can leave a game, which removes them from its player list.

## UI expectations
- Top nav with `Game` and `Administration`; highlight current page.
- Administration shows:
  - Start new game form.
  - Join game by code form.
  - “Games I administer” (with join codes and management actions).
  - “Games I’m in” (waiting/confirmed; no join code unless admin).
