#!/bin/bash
set -eu

echo "Using version: $VERSION"
node scripts/release-notes.js "$VERSION"
