# AGENTS.md

## Repository goal

Build a lightweight, client-side WebUI for monitoring one or more **XMRig Proxy** instances.

The initial product is a static single-page application (SPA), not a backend service:

1. On first visit, the user enters the proxy host, HTTP API port, and optional Bearer token.
2. The browser calls the XMRig Proxy HTTP API directly.
3. The configuration is stored locally in the browser (for example, `localStorage`).
4. The dashboard periodically refreshes live proxy and worker information.
5. A bounded local browser history is retained only for the live 1m/10m hashrate chart.

Do not introduce a database, polling backend, server-side API proxy, or mandatory Docker runtime for the WebUI unless a requirement explicitly calls for alerts, multi-user credentials, cross-device history, or similar server-side features.

## XMRig Proxy API

The primary endpoints are:

- `GET /1/summary` — proxy metadata, uptime, total hashrate, miners/workers counts, upstream state, and global share results.
- `GET /1/workers` — per-worker metrics and aggregate hashrate.
- `GET /1/miners` — active individual miner connections; use for diagnostics, not the main worker view. Its payload includes miner passwords: never render, persist, or log that field.

When a token is configured, send it as:

```http
Authorization: Bearer <token>
```

`/1/workers` returns workers as positional arrays. Keep the field mapping explicit and tested:

1. name
2. last IP
3. connections
4. accepted shares
5. rejected shares
6. invalid shares
7. total hashes
8. last submitted hash timestamp (milliseconds)
9. hashrate 1 minute
10. hashrate 10 minutes
11. hashrate 1 hour
12. hashrate 12 hours
13. hashrate 24 hours

Workers are aggregated by the Proxy's configured worker identity (normally `rig-id`). The UI uses `connections` and `last submitted hash` to sort connected workers first, classify disconnected workers as recently offline/offline, and hide rows after the user-configured retention period. This is API-memory-based display logic, not durable cross-proxy-restart offline history.

## Local development proxy

`docker-compose.yml` provides a development XMRig Proxy only. It is not part of the WebUI production architecture. It builds the pinned official `v6.26.0` source release through `Dockerfile.xmrig-proxy-dev`; do not replace it with Docker Hub's obsolete `xmrig/xmrig-proxy:latest` image, which does not provide the modern `/1/*` API.

```bash
cp .env.example .env
# Set XMRIG_UPSTREAM_USER to a valid pool user/wallet.
docker compose up -d
```

Default development API:

- URL: `http://127.0.0.1:18080`
- Token: value of `XMRIG_API_TOKEN` in `.env`
- Stratum test port: `127.0.0.1:3333`
- The development proxy uses TLS for its upstream connection; its default is MoneroOcean `gulf.moneroocean.stream:20128`.

Useful checks:

```bash
curl -H "Authorization: Bearer $XMRIG_API_TOKEN" http://127.0.0.1:18080/1/summary
curl -H "Authorization: Bearer $XMRIG_API_TOKEN" http://127.0.0.1:18080/1/workers
```

Never commit `.env`, real API tokens, wallet addresses, or pool credentials.

## WebUI development

Install frontend tooling with `npm install`, then run `npm run dev`. The command builds the Tailwind stylesheet and serves generated `public/` at `http://127.0.0.1:4173` on localhost. Use `npm run build` to regenerate static assets without starting the server.

For the reproducible development environment, `.devcontainer/` defines a Node 22 workspace and reuses `docker-compose.yml` to start the development XMRig Proxy alongside it. Open the repository with VS Code's Dev Containers extension and choose **Reopen in Container**. The proxy uses the local `.env`; the workspace runs `npm ci` plus `npx playwright install chromium` on first creation, then starts the WebUI automatically as its long-running service. Its output is available through the Dev Containers log or Compose logs; `npm run dev` remains available for manual restarts. The Dev Container publishes the WebUI only to `127.0.0.1:4173`; the development proxy remains bound to the local API and Stratum ports defined above.

## Browser and security constraints

- The proxy API must be reachable from the **user's browser**, not merely from the host serving the static files.
- XMRig Proxy supports CORS, including the `Authorization` header.
- An HTTPS WebUI cannot directly call an HTTP proxy API because browsers block mixed content. Clearly surface this error and document the HTTPS/reverse-proxy alternative.
- A token stored in `localStorage` is appropriate only for a personal or trusted-LAN dashboard. Treat it as sensitive: never log it, render it, include it in URLs, or commit it to fixtures.
- Bind the development proxy to `127.0.0.1`; do not casually expose its API on `0.0.0.0`.

## Implementation expectations

- Use plain HTML and browser JavaScript modules for the runtime UI. Tailwind CSS is a build-time-only dependency used to compile `frontend/app.css` into `public/market-dark.css`; do not add a JavaScript UI framework without an explicit requirement.
- Frontend sources are under `frontend/`: `index.html`, `app.css`, supporting Market Dark CSS files, browser modules in `frontend/js/`, and vendored browser assets in `frontend/vendor/`. `frontend/js/api.js` owns request construction, timeouts, error normalization, and API payload mapping; `frontend/js/app.js` owns state, rendering, and localStorage settings. `public/` is generated by `npm run build` and is the static deployment directory; do not edit or commit it.
- Preserve the Market Dark visual language from the P2Pool monitor: near-black background, charcoal surfaces, subtle borders, orange primary accent (`#ff7a00`), compact dashboard typography, stat stacks, chips, icon controls, and accessible contrast.
- Keep API access isolated in `frontend/js/api.js` so request construction, timeouts, error normalization, and response mapping are testable.
- Persist connection settings and a bounded, endpoint-agnostic chart history locally. Clear both when the user chooses **Forget connection**. Keep the token out of exported settings by default.
- Provide a connection-test action before saving a new connection.
- Show actionable states for network failure, timeout, invalid JSON, HTTP 401/403, and unreachable API.
- Refresh at a conservative configurable interval (default 10–30 seconds); prevent overlapping requests.
- Format hashrates, timestamps, counters, and share/error rates consistently.
- Design responsive and accessible UI controls; do not rely only on colour to communicate health.

## Validation

Before completing a change:

1. Run the applicable formatter, linter, tests, and build commands when they exist. At minimum for the current frontend, run `npm run build` after changing anything under `frontend/`; run `npm run test:e2e` after UI, rendering, or API integration changes.
2. Use `npm run capture:reference` to inspect the live P2Pool reference dashboard at desktop, tablet, and mobile viewports before significant visual work. The captures are diagnostic artifacts under ignored `test-results/reference/`, not source assets.
3. For Compose changes, run:
   ```bash
   docker compose --env-file .env.example config
   ```
4. For API integration changes, validate against the local proxy when possible.
5. Do not treat an empty `/1/workers` response as an API failure: it is normal when no test miner is connected.

## Documentation auto-maintenance rules

This file is a living operational contract. Update `AGENTS.md` in the same change whenever any of the following becomes stale:

- the product scope or architecture changes (for example, a backend, history, alerts, authentication, or multiple saved proxies are added);
- supported API endpoints, their response mapping, authentication method, or refresh model changes;
- local development commands, Docker services, ports, environment variables, or test commands change;
- security assumptions change, especially token storage, CORS, TLS, reverse proxying, or network exposure;
- a new required tool, coding convention, directory layout, or validation step is introduced.

Also keep `README.md` aligned with user-facing setup instructions. Do not add speculative rules: document only decisions implemented in the repository or explicitly agreed requirements. During reviews, remove obsolete guidance rather than leaving contradictory instructions.
