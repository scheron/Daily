#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "${GREEN}Downloading Daily...${NC}"

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

LATEST_RELEASE=$(curl -s https://api.github.com/repos/scheron/Daily/releases/latest)
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": ".*-linux-.*AppImage"' | cut -d'"' -f4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "${RED}Error: Could not find Linux AppImage in the latest release${NC}"
    exit 1
fi

curl -L "$DOWNLOAD_URL" -o daily.AppImage

chmod +x daily.AppImage

INSTALL_DIR="$HOME/.local/bin"
mkdir -p "$INSTALL_DIR"

mv daily.AppImage "$INSTALL_DIR/daily"

DESKTOP_DIR="$HOME/.local/share/applications"
mkdir -p "$DESKTOP_DIR"

cat > "$DESKTOP_DIR/daily.desktop" << EOL
[Desktop Entry]
Name=Daily
Exec=$INSTALL_DIR/daily
Type=Application
Categories=Utility;
EOL

cd - > /dev/null
rm -rf "$TEMP_DIR"

echo "${GREEN}Daily has been installed successfully!${NC}"
echo "You can now run Daily from your applications menu or by typing 'daily' in the terminal." 