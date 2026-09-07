#!/bin/sh
# Regenerates this stand's compose.yaml and .env with deploy/install.sh — the
# no-proxy topology, fronted here by the stand's own Caddy the way an
# operator's own reverse proxy would front it. Neither generated file is kept
# in the tree; re-run this before bringing the stand up.
set -eu
cd "$(dirname "$0")"
sh ../../../../../deploy/install.sh --domain daily.test --no-proxy --dir . --dry-run
