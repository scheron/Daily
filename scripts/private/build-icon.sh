#!/bin/bash

PNG="$1"

if [ -z "$PNG" ]; then
  echo "❌ Specify PNG file, for example:"
  echo "   ./build-icon.sh icon.png"
  exit 1
fi

PNG_DIR=$(dirname "$PNG")
PNG_BASENAME=$(basename "$PNG" .png)

ICON_NAME="$PNG_BASENAME"
ICONSET="$PNG_DIR/${ICON_NAME}.iconset"
ICNS="$PNG_DIR/${ICON_NAME}.icns"

WIDTH=$(sips -g pixelWidth "$PNG" | tail -n1 | cut -d' ' -f4)
HEIGHT=$(sips -g pixelHeight "$PNG" | tail -n1 | cut -d' ' -f4)

if [ "$WIDTH" -lt 1024 ] || [ "$HEIGHT" -lt 1024 ]; then
  echo "⚠️ Warning: Source image should be at least 1024x1024 pixels"
  echo "   Current size: ${WIDTH}x${HEIGHT}"
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "🔄 Creating iconset directory..."
mkdir -p "$ICONSET"

echo "🔄 Generating icons..."
sips -z 16 16     "$PNG" --out "$ICONSET/icon_16x16.png"
sips -z 32 32     "$PNG" --out "$ICONSET/icon_16x16@2x.png"
sips -z 128 128   "$PNG" --out "$ICONSET/icon_128x128.png"
sips -z 256 256   "$PNG" --out "$ICONSET/icon_128x128@2x.png"

echo "🔄 Creating macOS .icns..."
iconutil -c icns "$ICONSET" -o "$ICNS"

rm -rf "$ICONSET"

echo "✅ macOS icon created successfully:"
echo "   - $ICNS"