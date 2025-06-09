#!/bin/bash

ICON_NAME="icon"
ICONSET="${ICON_NAME}.iconset"
ICNS="${ICON_NAME}.icns"
PNG="$1"

if [ -z "$PNG" ]; then
  echo "❌ Specify PNG file, for example:"
  echo "   ./build-icon.sh icon.png"
  exit 1
fi

mkdir -p $ICONSET

sips -z 16 16     "$PNG" --out $ICONSET/icon_16x16.png
sips -z 32 32     "$PNG" --out $ICONSET/icon_16x16@2x.png
sips -z 32 32     "$PNG" --out $ICONSET/icon_32x32.png
sips -z 64 64     "$PNG" --out $ICONSET/icon_32x32@2x.png
sips -z 128 128   "$PNG" --out $ICONSET/icon_128x128.png
sips -z 256 256   "$PNG" --out $ICONSET/icon_128x128@2x.png
sips -z 256 256   "$PNG" --out $ICONSET/icon_256x256.png
sips -z 512 512   "$PNG" --out $ICONSET/icon_256x256@2x.png
sips -z 512 512   "$PNG" --out $ICONSET/icon_512x512.png
cp "$PNG" $ICONSET/icon_512x512@2x.png # предполагаем 1024x1024

iconutil -c icns $ICONSET -o $ICNS

rm -rf $ICONSET

echo "✅ $ICNS готов"