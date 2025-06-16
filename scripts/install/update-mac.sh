#!/bin/bash

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

APP_PATH="/Applications/Daily.app"
APP_EXEC="$APP_PATH/Contents/MacOS/Daily"
APP_NAME="Daily"
BACKUP_PATH="/Applications/Daily.app.backup"

echo "${GREEN}🔍 Checking for latest Daily version...${NC}"

TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

LATEST_RELEASE=$(curl -s https://api.github.com/repos/scheron/Daily/releases/latest)
LATEST_VERSION=$(echo "$LATEST_RELEASE" | grep -o '"tag_name": ".*"' | cut -d'"' -f4 | sed 's/^v//')
DOWNLOAD_URL=$(echo "$LATEST_RELEASE" | grep -o '"browser_download_url": ".*mac.dmg"' | cut -d'"' -f4)

if [ -z "$DOWNLOAD_URL" ]; then
  echo "${RED}❌ Could not find .dmg in latest release${NC}"
  exit 1
fi

if [ -f "$APP_PATH/Contents/Info.plist" ]; then
  CURRENT_VERSION=$(defaults read "$APP_PATH/Contents/Info.plist" CFBundleShortVersionString)
  echo "${GREEN}📱 Current version: $CURRENT_VERSION${NC}"
  echo "${GREEN}📱 Latest version: $LATEST_VERSION${NC}"
  
  if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
    echo "${GREEN}✅ You already have the latest version installed!${NC}"
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
    exit 0
  fi
else
  echo "${YELLOW}⚠️ No current version found - performing fresh install${NC}"
fi

echo "${GREEN}⬇️ Downloading latest version from GitHub...${NC}"
if ! curl -L "$DOWNLOAD_URL" -o daily.dmg; then
  echo "${RED}❌ Failed to download the update${NC}"
  exit 1
fi

if [ ! -f "daily.dmg" ] || [ ! -s "daily.dmg" ]; then
  echo "${RED}❌ Downloaded file is empty or missing${NC}"
  exit 1
fi

WAS_RUNNING=false
if pgrep -fx "$APP_EXEC" > /dev/null; then
  WAS_RUNNING=true
  echo "${GREEN}🛑 Closing running Daily instance...${NC}"
  osascript -e 'quit app "Daily"'
  sleep 2
fi

if [ -d "$APP_PATH" ]; then
  echo "${YELLOW}📦 Creating backup of current version...${NC}"
  if [ -d "$BACKUP_PATH" ]; then
    rm -rf "$BACKUP_PATH"
  fi
  cp -R "$APP_PATH" "$BACKUP_PATH"
fi

echo "${GREEN}📦 Mounting DMG...${NC}"
DMG_MOUNT=$(hdiutil attach daily.dmg | grep "/Volumes/" | cut -f 3-)

if [ -z "$DMG_MOUNT" ]; then
  echo "${RED}❌ Failed to mount DMG${NC}"
  if [ -d "$BACKUP_PATH" ]; then
    echo "${YELLOW}🔄 Restoring from backup...${NC}"
    rm -rf "$APP_PATH"
    cp -R "$BACKUP_PATH" "$APP_PATH"
  fi
  exit 1
fi

echo "${GREEN}🔁 Replacing old Daily.app in /Applications...${NC}"
rm -rf "$APP_PATH"
cp -R "$DMG_MOUNT/Daily.app" "$APP_PATH"

if [ ! -d "$APP_PATH" ]; then
  echo "${RED}❌ Failed to install new version${NC}"
  if [ -d "$BACKUP_PATH" ]; then
    echo "${YELLOW}🔄 Restoring from backup...${NC}"
    cp -R "$BACKUP_PATH" "$APP_PATH"
  fi
  exit 1
fi

echo "${GREEN}💥 Removing quarantine attributes...${NC}"
xattr -rd com.apple.quarantine "$APP_PATH"

echo "${GREEN}💾 Cleaning up...${NC}"
hdiutil detach "$DMG_MOUNT"
cd - > /dev/null
rm -rf "$TEMP_DIR"

if [ -d "$BACKUP_PATH" ]; then
  rm -rf "$BACKUP_PATH"
fi

echo "${GREEN}✅ Daily has been updated successfully!${NC}"

if [ "$WAS_RUNNING" = true ]; then
  echo "${GREEN}🚀 Relaunching Daily...${NC}"
  open "$APP_PATH"
fi