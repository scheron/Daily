#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

SOURCE="$PROJECT_DIR/src/main/native/file-coordinator.swift"
OUTPUT_DIR="$PROJECT_DIR/resources"
OUTPUT="$OUTPUT_DIR/file-coordinator"

mkdir -p "$OUTPUT_DIR"

echo "Building file-coordinator..."
swiftc -O -o "$OUTPUT" "$SOURCE"
echo "Built: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
