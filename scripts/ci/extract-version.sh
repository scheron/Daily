#!/bin/bash

echo "VERSION=${GITHUB_REF#refs/tags/}" >> "$GITHUB_ENV"
