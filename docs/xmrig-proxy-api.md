# XMRig Proxy HTTP API (v6.26.0)

This monitor targets the official XMRig Proxy `v6.26.0` HTTP API. This reference was verified against that release's `ApiRouter.cpp`, `HttpApiRequest.cpp`, and statistics sources.

## Authentication and transport

All monitor requests use `GET` and, when configured, send:

```http
Authorization: Bearer <token>
```

The browser must be able to reach the API and the Proxy/reverse proxy must permit the WebUI origin through CORS, including `Authorization`. The API does not provide the monitor with the Proxy's configured pool list.

## Supported monitoring endpoints

| Endpoint | Data available | Monitor use |
| --- | --- | --- |
| `GET /1/summary` | Proxy metadata, host resources, global hashrate, miner/worker counts, aggregate upstream connection counters, and global share results | Summary cards, chart, system and upstream cards |
| `GET /1/workers` | Worker aggregation and per-worker counters/hashrate | Worker table and offline classification |
| `GET /1/miners` | Active individual miner connections | Diagnostics table and worker dialog |

`GET /2/summary` and `GET /api.json` are aliases for the summary response in this release. The monitor deliberately uses the stable `/1/summary` endpoint. `/1/workers` and `/1/miners` are the only worker/miner routes implemented by the v6.26.0 router.

## `/1/summary`

### Base metadata and host data

| Field | Meaning |
| --- | --- |
| `id` | Proxy API instance ID |
| `worker_id` | Proxy API worker ID (hostname by default) |
| `uptime` | Proxy API uptime in seconds |
| `restricted` | Whether the HTTP API is in restricted mode |
| `resources.memory.free` / `total` / `resident_set_memory` | Host memory metrics in bytes |
| `resources.load_average` | 1, 5 and 15 minute load averages |
| `resources.hardware_concurrency` | CPU hardware concurrency |
| `features` | Features compiled into this Proxy build |
| `version`, `kind`, `mode`, `ua`, `algo` | Proxy build/runtime metadata |
| `donate_level`, `donated` | Donation configuration and calculated donation percentage |

### Hashrate and clients

| Field | Meaning |
| --- | --- |
| `hashrate.total` | Six values, in H/s: 1m, 10m, 1h, 12h, 24h and all-time/uptime |
| `miners.now` / `miners.max` | Current and peak miner connection counts |
| `workers` | Number of known worker identities |

### Upstreams

| Field | Meaning |
| --- | --- |
| `upstreams.active` | Active upstream connections |
| `upstreams.sleep` | Sleeping upstream connections |
| `upstreams.error` | Failed upstream connections |
| `upstreams.total` | Total live upstream connections tracked by the splitter |
| `upstreams.ratio` | Upstream-to-miner connection ratio |

These are **runtime connection counters**, not the configured pool inventory. The response does not contain a pool URL, name, configured-pool count, pool priority, or a per-pool state. With a primary plus failover pools, it is normal to see `active: 1` and `total: 1` while the primary is healthy.

### Share results

| Field | Meaning |
| --- | --- |
| `results.accepted`, `rejected`, `invalid`, `expired` | Global share counters |
| `results.avg_time` | Average submission interval calculated by the Proxy |
| `results.latency` | Median share latency in milliseconds |
| `results.hashes_total`, `hashes_donate` | Global and donated hashes |
| `results.best` | Ten best share difficulties |

## `/1/workers`

The response contains `mode` plus `workers`, where each worker is a positional array. The stable order in v6.26.0 is:

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

The monitor maps these arrays explicitly in `frontend/js/api.js`. The worker response also includes `hashrate.total` with the same six global time windows as the summary.

The timestamp is the last submitted hash/share, **not** a connection heartbeat. The monitor's **Last Seen** value is instead refreshed to `now` whenever `/1/miners` or the worker connection count confirms that the miner is live, and shows the submitted-share time only after it is no longer active. Likewise, Proxy hashrates are rolling estimates calculated from submitted shares; they can remain zero or low for a connected low-hashrate miner until enough shares arrive. The monitor uses `/1/miners` to mark a matching live miner connection as active independently of these share-derived values.

## `/1/miners`

The response provides a `format` array and positional `miners` rows. In v6.26.0 its fields are:

1. `id`
2. `ip`
3. `tx`
4. `rx`
5. `state`
6. `diff`
7. `user`
8. `password`
9. `rig_id`
10. `agent`

`password` is sent by the Proxy API but is sensitive: the monitor must never render, persist, or log it. The UI may display the configured `user` for diagnostics, and uses ID, IP, RX/TX, state, difficulty, rig ID, and agent.

## Information not available through this API

The v6.26.0 monitoring router does **not** expose pool configuration or per-pool telemetry. In particular, a browser-only monitor cannot obtain the configured pool URLs, active pool identity, configured backup count, per-pool latency, or per-pool shares through `/1/*`.

Do not infer configured failover pools from `upstreams.total`. To display configuration inventory, it must be supplied independently to the frontend; to display actual per-pool runtime state requires a Proxy API feature/upstream change rather than a dashboard-only change.
