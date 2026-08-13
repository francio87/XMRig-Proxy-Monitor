# ⛏️ XMRig Proxy Monitor

⚡ Live XMRig Proxy dashboard from browser
📊 Workers, hashrate, shares, and active miner diagnostics
🐳 Static site or local Docker Compose stack

XMRig Proxy Monitor is a lightweight dashboard for one [XMRig Proxy](https://github.com/xmrig/xmrig-proxy) endpoint. It has no application backend or database: browser calls Proxy HTTP API directly, while settings and chart history remain in browser local storage.

## Highlights

- 📈 Local 1m and 10m hashrate chart, retaining latest 180 samples
- 👷 Worker state: online, recently offline, and offline
- 🔌 Active miner diagnostics, without rendering or storing miner passwords
- 🔐 Optional Proxy Bearer-token support
- 🔄 Auto-refresh: 10 seconds, 30 seconds, 1 minute, or 5 minutes
- 🖥️ Responsive Market Dark interface

![XMRig Proxy Monitor dashboard](docs/images/dashboard.png)

## Quickstart: Docker Compose

Copy environment template and set `XMRIG_UPSTREAM_USER` to valid pool wallet or user:

```bash
cp .env.example .env
# Edit .env: set XMRIG_UPSTREAM_USER.
docker compose up --build -d
```

Open dashboard:

```text
http://127.0.0.1:4173
```

At first visit enter:

- **Proxy address:** `127.0.0.1:18080`
- **Protocol:** `HTTP`
- **Bearer token:** `XMRIG_API_TOKEN` from `.env`

Use **Save and connect**. Standard stack builds production static assets; fixture controls are excluded.

### Ports

| Service | Default | Notes |
| --- | --- | --- |
| Dashboard | `127.0.0.1:4173` | Browser UI |
| Proxy API | `127.0.0.1:18080` | Direct browser API access |
| Stratum | `127.0.0.1:3333` | Test miners |

All bind to localhost by default. For trusted LAN use, set `WEBUI_BIND`, `XMRIG_API_BIND`, and optionally `XMRIG_STRATUM_BIND` in `.env`. Browser must reach both dashboard and API.

## Static release deployment

GitHub Release ZIP files contain static-site contents only. Extract them under any static web server or hosting provider; no Node.js, Docker, or application backend needed at runtime.

For local test only:

```bash
unzip xmrig-proxy-monitor-v*.zip -d xmrig-monitor
cd xmrig-monitor
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080`. For public use, serve site with HTTPS through Nginx, Caddy, or static hosting.

### Connect an existing XMRig Proxy

For an existing Proxy, enable HTTP API with a token. Port is configurable; `18080` is this project's default.

```json
"http": {
  "enabled": true,
  "host": "127.0.0.1",
  "port": 18080,
  "access-token": "replace-with-a-long-random-token",
  "restricted": true
}
```

Verify it before opening dashboard:

```bash
curl -H 'Authorization: Bearer replace-with-a-long-random-token' \
  http://127.0.0.1:18080/1/summary
```

Enter same host, port, protocol, and token in dashboard. Keep API on localhost, VPN, or trusted LAN. For remote access, use HTTPS for both dashboard and API.

Docker Compose configures this API automatically. Set `XMRIG_API_PORT` in `.env` to change its port.

### Direct API requirements

Dashboard browser — not machine serving static files — must reach Proxy API.

- Configure Proxy or reverse proxy CORS for dashboard origin.
- Allow `Authorization` header when Bearer token is used.
- HTTPS dashboard requires HTTPS API; browsers block HTTPS-to-HTTP mixed content.
- Do not open `index.html` with `file://`; root-relative assets and browser origin rules require web server.

## Build from source

```bash
npm ci
npm run build
```

Deploy contents of generated `public/` directory. Build output is ignored by Git and contains no development fixture assets.

## Development

Start reproducible development stack:

```bash
cp .env.example .env
# Edit .env: set XMRIG_UPSTREAM_USER.
docker compose -f docker-compose.dev.yml up --build
```

Or run WebUI directly after `npm ci`:

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. Development build includes **Dev fixture** selector in header. It provides synthetic operational, warning, offline, mixed-rig, large-fleet, and API-error states without calling Proxy. Return selector to **Live Proxy** before testing real endpoint.

## API and privacy

Dashboard requests these XMRig Proxy v6.26.0 endpoints every refresh:

- `GET /1/summary`
- `GET /1/workers`
- `GET /1/miners`

Token, when configured, is sent only as `Authorization: Bearer <token>`. Dashboard never renders, persists, or logs `password` fields returned by `/1/miners`.

See [XMRig Proxy API notes](docs/xmrig-proxy-api.md) for payload mapping, worker lifecycle behavior, and API limits.

## Checks

```bash
npm run test:e2e
npm run build
```

## Notes

- Empty worker list is normal until miner connects.
- Dashboard-only token is stored in browser local storage: use only personal or trusted-LAN dashboard.
- Development Proxy uses configured primary pool plus HashVault and SupportXMR TLS failovers.
- Development fixture menu is not included in production build.

## License

Licensed under [GNU AGPL-3.0-or-later](LICENSE). Derivatives distributed or offered as network services must provide corresponding source code under same license.

## Disclaimer

- ⚠️ Provided **as-is**, without warranties. Use at your own risk and validate data before relying on it.
- 🤖 This project was developed with significant AI assistance.
