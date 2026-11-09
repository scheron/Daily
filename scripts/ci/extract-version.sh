#!/bin/bash
set -eu

if [[ "$GITHUB_REF" == refs/tags/* ]]; then
  version="${GITHUB_REF#refs/tags/}"
else
  version="v$(node -p 'require("./apps/desktop/package.json").version')"
fi

echo "VERSION=$version" >> "$GITHUB_ENV"
