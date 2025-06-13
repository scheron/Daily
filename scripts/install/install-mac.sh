#!/bin/bash

set -e

GREEN='\033[0;32m'
NC='\033[0m'

echo "${GREEN}Downloading Daily...${NC}"

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

LATEST_RELEASE=$(curl -s https://api.github.com/repos/scheron/Daily/releases/latest)
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": ".*mac.dmg"' | cut -d'"' -f4)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "${RED}❌ Could not find .dmg in latest release${NC}"
  exit 1
fi

curl -L "$DOWNLOAD_URL" -o daily.dmg

echo "${GREEN}Installing Daily...${NC}"

DMG_MOUNT=$(hdiutil attach daily.dmg | grep "/Volumes/" | cut -f 3-)

cp -R "$DMG_MOUNT/Daily.app" /Applications/

hdiutil detach "$DMG_MOUNT"

xattr -rd com.apple.quarantine /Applications/Daily.app

cd - > /dev/null
rm -rf "$TEMP_DIR"

echo "${GREEN}✅ Daily has been installed successfully!${NC}"
echo "You can find Daily in your Applications folder."