#!/bin/bash

VERSION="${GITHUB_REF#refs/tags/}"
echo "Using version: $VERSION"
node scripts/release-notes.js "$VERSION"
