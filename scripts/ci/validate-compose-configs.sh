#!/bin/bash
set -euo pipefail

(cd /tmp/daily-domain && docker compose -f compose.yaml config -q)
(cd /tmp/daily-ip && docker compose -f compose.yaml config -q)
(cd /tmp/daily-no-proxy && docker compose -f compose.yaml config -q)
