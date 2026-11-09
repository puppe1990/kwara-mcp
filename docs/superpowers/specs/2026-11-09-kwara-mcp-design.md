# Kwara MCP — design

Date: 2026-11-09
Status: approved (architecture, tools, auth, favorites, compact lot, search, errors, tests, grok)

## Goal

Stdio MCP at `ferramentas/kwara-mcp` so an agent can search Kwara lots, read one lot, and list the signed-in account’s favorites. Node ESM, `@modelcontextprotocol/sdk` + Zod, same shape as `ferramentas/registro-br-mcp`. TDD with `node --test` and `@faker-js/faker`.

Site `https://www.kwara.com.br`. JSON API `https://api.kwara.com.br`. Endpoints taken from network-listener captures on 2026-11-09 and from `clientes/KwaraBot/kwara_bot/kwara_bot.rb`.

## Non-goals

- Viewer, CSV download, or any UI.
- Superbid.
- Google One Tap and `POST https://www.kwara.com.br/api/auth/set`.
- Placing bids.
- Add/remove favorite.
- `GET .../favorites/biddable-lots` and `POST .../favorites/by-listing-ids`.
- Live Kwara calls inside `npm test`.
- GitHub remote until asked.

`clientes/KwaraBot` and `negocios/leilao-erp` stay untouched.

## 1. Architecture

```
ferramentas/kwara-mcp/
├── src/
│   ├── index.js       # McpServer, stdio, tool registration
│   ├── client.js      # fetch wrapper (timeout, Origin, errors)
│   ├── auth.js        # refresh → access in memory; userId from JWT `id`
│   ├── search.js      # q → JSON search or /busca RSC
│   ├── lots.js        # compact lot mapping
│   └── favorites.js   # GET /web/users/{userId}/favorites
├── test/
│   ├── factories.js
│   └── fixtures/      # sanitized JSON/RSC, never a real JWT
└── docs/superpowers/specs/
```

Stack: Node ≥ 18, `"type": "module"`, Zod schemas on every tool. `npm test` → `node --test`. `npm start` → `node src/index.js`.

Code, comments, tests, and git messages in English. Tool descriptions, agent-facing error strings, and user copy in pt-BR.

Search and lot details call the JSON API with no `Authorization`. Favorites send `Authorization: Bearer {access}`. Access lives in process memory only.

## 2. Tools

Three tools, prefix `kwara_`. Each result is a JSON object serialized as MCP text (pretty-printed). No fee tables.

| Tool | Auth | Args |
| --- | --- | --- |
| `kwara_search` | no | `q` string; `take` int default 20 max 50; `skip` int default 0 |
| `kwara_lot` | no | `id` string (lot id or `/bens/` URL) |
| `kwara_favorites` | yes | `take` int default 20 max 50; `skip` int default 0; `onlyActiveItems` bool default true |

### `kwara_search`

Description (pt-BR): busca lotes na Kwara. `q` é texto, código de leilão (`K-2551`), id numérico de **leilão** (listing), URL `/evento/...`, ou URL `/bens/...`. Id numérico de **lote** vai em `kwara_lot`.

Returns `{ items: CompactLot[], total: number | null, source: "json" | "rsc" | "details" }`.

### `kwara_lot`

Description (pt-BR): ficha de um lote. `id` é o id numérico do lote ou a URL `/bens/{slug}`.

Returns `{ lot: CompactLotDetails }`. HTTP 404 → error string `lote {id} não encontrado` (value received in the message).

### `kwara_favorites`

Description (pt-BR): lista os favoritos da conta configurada no MCP.

Returns `{ items: CompactLot[], total: number | null }`.

## 3. Search mapping

Classify trimmed `q` in this order. First match wins.

1. **Lot URL** — `q` is a URL (or path) whose path starts with `/bens/`. Trailing numeric segment is the lot id. Call `GET /web/lots/{id}/details?includeBids=true&isBot=false` and wrap the compact details as a one-item list (`source: "details"`).
2. **Event URL** — path `/evento/{slug}`. If `slug` contains `K-<digits>`, use that `K-…` token; otherwise use the full slug. Then JSON search with `listingSlugs`.
3. **Listing code** — `q` matches `/^K-\d+$/i` → JSON search `listingSlugs: [q]`.
4. **Long slug with code** — `q` contains `K-<digits>` (e.g. full event slug) → JSON search with that `K-…` token as `listingSlugs`.
5. **Digits only** — `/^\d+$/` → JSON search `listingIds: [q]`. This is a **listing** id, not a lot id.
6. **Free text** — `GET https://www.kwara.com.br/busca?q={urlencoded}` as Next.js RSC. `source: "rsc"`.

### JSON search

```
POST https://api.kwara.com.br/web/lots/search?take={take}&skip={skip}
Origin: https://www.kwara.com.br
Accept: application/json
Content-Type: application/json
```

Body (empty arrays always present, as in capture `listingSlugs: ["K-3161"]`):

```json
{
  "listingIds": [],
  "assetCategoryIds": [],
  "sellerIds": [],
  "tags": [],
  "refs": [],
  "segments": [],
  "listingSlugs": [],
  "showFinalizedLast": true
}
```

Fill either `listingSlugs` or `listingIds`; leave the other `[]`. Do not send a `q` field on this POST (captures never did; free text is RSC).

Parse `items` from the JSON object (or nested `data.items`). `total` from `totalItems` / `total` when present, else `null`.

### RSC search

```
GET https://www.kwara.com.br/busca?q={q}
rsc: 1
next-url: /busca
next-router-state-tree: same encoded tree the Ruby bot uses for /busca
Accept: */*
```

Do **not** send `x-deployment-id` (the bot’s value is a snapshot and goes stale). Do not send `orderBy`. Map pagination to `currentPage = floor(skip / take) + 1` when `skip > 0`.

Parse the flight payload the way `extract_search_result_from_rsc` does in KwaraBot: find a JSON object with an `items` array of lots. Failure → error `não deu para ler a busca do site`.

## 4. Compact lot

Identifiers in English. Money: integer cents plus formatted `R$` string (`123` → `R$ 1,23`), same helper as the Ruby bot.

### List row (`CompactLot`) — search and favorites

| Field | Source |
| --- | --- |
| `id` | `id` |
| `number` | `number` |
| `title` | `title` |
| `slug` | `slug` |
| `listingId` | `listingId` |
| `listingTitle` | `listing.title` |
| `kwaraId` | `listing.kwaraId` |
| `currentBidCents` | `cachedPriceAmountCents` |
| `currentBid` | formatted |
| `startingBidCents` | `lotAuctionSettings[0].startingBidCents` or current setting |
| `startingBid` | formatted |
| `bidsCount` | `cachedBidsCount` |
| `endsAt` | `scheduledEndAt` / `currentEndAt` |
| `pickupState` | `pickUpState` |
| `ended` | `isEnded === true` |
| `url` | `https://www.kwara.com.br/bens/{slug}` when `slug` already ends with the lot `id`; otherwise `https://www.kwara.com.br/bens/{slug}-{id}` |

No image on the list row. Drop fee tables, bid arrays, and seller blobs.

Normalize nested `item` / `lot` the way `normalize_item_payload` does in the bot.

### Details (`CompactLotDetails`) — `kwara_lot`

All list fields, plus:

| Field | Rule |
| --- | --- |
| `description` | text; strip HTML tags if present; cap 2000 characters |
| `pickupAddress` | `pickUpAddress` |
| `incrementCents` | current `minimumIncrementCents` |
| `increment` | formatted |
| `images` | up to 3 `images[].url` |
| `phase` | `currentLotAuctionSetting.listingPhase.phaseName` |
| `views` | `views` |

`GET /web/lots/{id}/details?includeBids=true&isBot=false`. Individual bids are dropped.

Current auction setting: `currentLotAuctionSetting` if it is an object, else the `lotAuctionSettings` entry with `isCurrent`, else `[0]`.

## 5. Auth

Favorites only. Search and lot details never refresh.

### Storage

- Seed: env `KWARA_REFRESH_TOKEN`.
- File: `~/.config/kwara/config.json` (override `KWARA_CONFIG_PATH` in tests), mode `0600`, directory `0700`.
- File shape: `{ "refreshToken": "<jwt>", "refreshTokenExpiresAt": "<iso>" }`. Never persist `accessToken`.
- Load order: file `refreshToken` if present, else env. After a successful refresh, write the **rotated** refresh to the file (create the file even when the seed was env-only). Later loads prefer the file.
- Access token and `accessTokenExpiresAt` stay in memory.

### Refresh call

On the first authenticated tool call, and again when now ≥ `accessTokenExpiresAt - 60s` (fall back to access JWT `exp` if the ISO field is missing):

```
GET https://api.kwara.com.br/auth/refresh-token
Accept: application/json
Origin: https://www.kwara.com.br
```

Network-listener capture `2334087` returned 200 JSON keys `accessToken`, `refreshToken`, `accessTokenExpiresAt`, `refreshTokenExpiresAt`, with cookies/Authorization stripped. Node therefore probes, stop at first HTTP 200:

1. `Authorization: Bearer {refresh}`
2. `Cookie: __Secure-auth.kat={refresh}`

Remember the winning method in memory for this process. Do not persist it.

Expected body: the four keys above. Access JWT claim `type` is `access`; refresh claim `type` is `refresh`. Decode payload with base64url; do not verify the signature.

`userId` = access payload `id`. Never `buyerId`. Same as `extract_user_id_from_token` in the bot.

Do not call `POST /api/auth/set`. Do not implement Google login.

### Auth errors (pt-BR)

| Case | Message |
| --- | --- |
| no refresh in env or file | `configure KWARA_REFRESH_TOKEN ou ~/.config/kwara/config.json` |
| both probe methods fail | `refresh rejeitado, cole um token novo` (include HTTP status, not body) |
| favorites 401 | refresh once, retry the GET once, then the same rejected message |

Redact JWTs and `Bearer` values from stderr, logs, and tool text. Never print the refresh or access token.

## 6. Favorites

```
GET https://api.kwara.com.br/web/users/{userId}/favorites?take={take}&skip={skip}&onlyActiveItems={true|false}
Authorization: Bearer {access}
Origin: https://www.kwara.com.br
Accept: application/json
```

`userId` from the access JWT `id`. Default `take=20` (cap 50), `skip=0`, `onlyActiveItems=true`.

Items: `items` / `favorites` / `userFavorites` / `data.items` (same candidates as the bot). Map each through `CompactLot`. `total` from `totalItems` / `total` when present.

Out of v1: biddable-lots, by-listing-ids, write paths.

## 7. HTTP client

- `fetch` injectable (`fetchImpl`) for tests.
- Timeout 15s (`AbortSignal`).
- Default headers: `Origin: https://www.kwara.com.br`, `Accept: application/json` on the API host, Chrome-like `User-Agent`.
- Non-2xx: throw with `status` and `path`. Do not attach response body (bodies can contain tokens).
- Timeout / network: error string includes the path and the failure kind.

MCP tool failures set `isError: true` with the pt-BR message as text.

## 8. Testing

Command: `npm test` (`node --test`).

`test/factories.js`: `faker.seed` per file. Factories build lots, search payloads, favorites payloads, and unsigned JWTs (`type: "access"` / `"refresh"`, `id` vs `buyerId` distinct). Fixtures copied from NL must be sanitized: replace every JWT and email.

Coverage:

- `q` classification (K-code, digits, `/evento/` URL, `/bens/` URL, free text).
- Compact list + details (fee tables absent; description cap; max 3 images).
- `userId` reads `id`, ignores `buyerId`.
- Refresh probe order with mock fetch (Bearer 401 then cookie 200, and Bearer 200 first).
- Persist rotated refresh to a temp dir, file mode `0600`.
- Favorites 401 → one refresh → one retry.
- Missing refresh → the configure message.
- Stdio: `initialize` and `tools/list` expose exactly the three tools.
- RSC fixture parses to lots; truncated garbage → the RSC error string.
- Compact mapper never emits a token field.

No real `api.kwara.com.br` in unit tests.

## 9. Grok (and Command Code) registration

Implementation writes, it does not belong in this spec’s git tree:

`~/.grok/config.toml`

```toml
[mcp_servers.kwara]
command = "node"
args = ["/Users/matheuspuppe/Desktop/Projetos/ferramentas/kwara-mcp/src/index.js"]
enabled = true

[mcp_servers.kwara.env]
KWARA_REFRESH_TOKEN = "(from the account; never commit)"
```

Same server in `~/.commandcode/mcp.json` (local Node MCP pattern already used for pay-core / mcp-uber).

Inventory: one line in workspace `PROJETOS.md` and a bullet in workspace `AGENTS.md`.

## 10. Secrets

- Do not commit `~/.config/kwara/config.json`, `.env`, or capture dumps.
- Spec, fixtures, README, and tests contain no live JWT, cookie, or email from captures.
- Evidence ids (not bodies): refresh `2334087`; auth/set `2334095` (website only); JSON search bodies with `listingSlugs: ["K-3161"]`; lot details `includeBids=true&isBot=false`; RSC `/busca?q=` `2333397` / `2333199` / `2333115`; favorites by-listing-ids `2338609` and biddable-lots `2338568` (both out of v1).
