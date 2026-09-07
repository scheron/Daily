#!/bin/bash
set -euo pipefail

mkdir -p /tmp/daily-domain /tmp/daily-ip /tmp/daily-no-proxy
sh deploy/install.sh --domain daily.example.com --dir /tmp/daily-domain --dry-run
sh deploy/install.sh --ip 203.0.113.10 --dir /tmp/daily-ip --dry-run
sh deploy/install.sh --domain daily.example.com --no-proxy --dir /tmp/daily-no-proxy --dry-run
