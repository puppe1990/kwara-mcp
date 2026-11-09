# kwara-mcp

Stdio MCP for Kwara: search lots, read one lot, list favorites.

## Run

```bash
npm test
npm start
```

## Auth

Favorites need a refresh JWT:

- env `KWARA_REFRESH_TOKEN`, or
- `~/.config/kwara/config.json` (`refreshToken`, mode 0600)

Get a fresh token from a logged-in browser session (`GET https://api.kwara.com.br/auth/refresh-token` JSON `refreshToken`). Do not commit it.

## Grok

```toml
[mcp_servers.kwara]
command = "node"
args = ["/Users/matheuspuppe/Desktop/Projetos/ferramentas/kwara-mcp/src/index.js"]
enabled = true
```

Put `KWARA_REFRESH_TOKEN` under `[mcp_servers.kwara.env]`.
