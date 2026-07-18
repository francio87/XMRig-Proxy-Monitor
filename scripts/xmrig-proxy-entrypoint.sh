#!/bin/sh
set -eu

XMRIG_UPSTREAM_URL="${XMRIG_UPSTREAM_URL:-gulf.moneroocean.stream:20128}"
XMRIG_UPSTREAM_HASHVAULT_URL="${XMRIG_UPSTREAM_HASHVAULT_URL:-pool.hashvault.pro:443}"
XMRIG_UPSTREAM_SUPPORTXMR_URL="${XMRIG_UPSTREAM_SUPPORTXMR_URL:-pool.supportxmr.com:443}"
XMRIG_UPSTREAM_USER="${XMRIG_UPSTREAM_USER:-CHANGE_ME}"
XMRIG_UPSTREAM_PASSWORD="${XMRIG_UPSTREAM_PASSWORD:-x}"
XMRIG_COIN="${XMRIG_COIN:-monero}"
XMRIG_API_PORT="${XMRIG_API_PORT:-18080}"
XMRIG_API_TOKEN="${XMRIG_API_TOKEN:-xmrig-proxy-dev-token-change-me}"

jq -n \
  --arg primaryUrl "$XMRIG_UPSTREAM_URL" \
  --arg hashvaultUrl "$XMRIG_UPSTREAM_HASHVAULT_URL" \
  --arg supportxmrUrl "$XMRIG_UPSTREAM_SUPPORTXMR_URL" \
  --arg user "$XMRIG_UPSTREAM_USER" \
  --arg pass "$XMRIG_UPSTREAM_PASSWORD" \
  --arg coin "$XMRIG_COIN" \
  --arg token "$XMRIG_API_TOKEN" \
  --argjson httpPort "$XMRIG_API_PORT" \
  '
  def pool($url): {
    url: $url,
    user: $user,
    pass: $pass,
    coin: $coin,
    enabled: true,
    tls: true,
    "keepalive": false,
    "nicehash": false
  };
  {
    "http": {
      "enabled": true,
      "host": "0.0.0.0",
      "port": $httpPort,
      "access-token": $token,
      "restricted": true
    },
    "bind": [{"host": "0.0.0.0", "port": 3333, "tls": false}],
    "colors": false,
    "donate-level": 0,
    "mode": "nicehash",
    "pools": [pool($primaryUrl), pool($hashvaultUrl), pool($supportxmrUrl)],
    "retries": 5,
    "retry-pause": 5,
    "workers": true
  }
  ' > /tmp/xmrig-proxy.json

exec xmrig-proxy --config=/tmp/xmrig-proxy.json
