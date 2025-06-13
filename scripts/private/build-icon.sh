#!/bin/bash

ICON_NAME="icon"
ICONSET="${ICON_NAME}.iconset"
ICNS="${ICON_NAME}.icns"
ICO="${ICON_NAME}.ico"
PNG="$1"

if [ -z "$PNG" ]; then
  echo "❌ Specify PNG file, for example:"
  echo "   ./build-icon.sh icon.png"
  exit 1
fi

if ! command -v magick &> /dev/null; then
  echo "❌ ImageMagick is required for Windows icon creation"
  echo "   Please install it using: brew install imagemagick"
  exit 1
fi

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
mkdir -p $ICONSET

echo "🔄 Generating icons..."
sips -z 16 16     "$PNG" --out $ICONSET/icon_16x16.png
sips -z 32 32     "$PNG" --out $ICONSET/icon_16x16@2x.png
sips -z 32 32     "$PNG" --out $ICONSET/icon_32x32.png
sips -z 64 64     "$PNG" --out $ICONSET/icon_32x32@2x.png
sips -z 128 128   "$PNG" --out $ICONSET/icon_128x128.png
sips -z 256 256   "$PNG" --out $ICONSET/icon_128x128@2x.png
sips -z 256 256   "$PNG" --out $ICONSET/icon_256x256.png
sips -z 512 512   "$PNG" --out $ICONSET/icon_256x256@2x.png
sips -z 512 512   "$PNG" --out $ICONSET/icon_512x512.png
cp "$PNG" $ICONSET/icon_512x512@2x.png

echo "🔄 Creating macOS .icns..."
iconutil -c icns $ICONSET -o $ICNS

echo "🔄 Creating Windows .ico..."
WIN_ICONSET="win_iconset"
mkdir -p $WIN_ICONSET

# Only include standard Windows icon sizes
cp $ICONSET/icon_16x16.png $WIN_ICONSET/icon_16x16.png
cp $ICONSET/icon_32x32.png $WIN_ICONSET/icon_32x32.png
cp $ICONSET/icon_128x128.png $WIN_ICONSET/icon_128x128.png
cp $ICONSET/icon_256x256.png $WIN_ICONSET/icon_256x256.png

# Use magick instead of convert
magick $WIN_ICONSET/icon_*.png $ICO

rm -rf $ICONSET
rm -rf $WIN_ICONSET

echo "✅ Icons created successfully:"
echo "   - macOS: $ICNS"
echo "   - Windows: $ICO"