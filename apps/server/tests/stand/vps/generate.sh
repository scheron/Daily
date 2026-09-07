#!/bin/sh
# Regenerates this stand's compose.yaml and .env with deploy/install.sh — the
# self-signed topology it mints for --ip. Neither generated file is kept in
# the tree; re-run this before bringing the stand up.
set -eu
cd "$(dirname "$0")"
sh ../../../../../deploy/install.sh --ip daily-vps.test --dir . --dry-run
