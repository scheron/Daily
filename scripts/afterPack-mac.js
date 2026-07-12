import {execSync} from "child_process"
import fs from "fs"
import path from "path"

const entitlementsContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.cs.disable-executable-page-protection</key>
    <true/>
  </dict>
</plist>`

export default async function (context) {
  const platform = context.electronPlatformName
  if (platform !== "darwin") {
    console.log(`🛑 Skipping mac-specific signing on ${platform}`)
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)
  const entitlementsPath = path.join(context.appOutDir, "entitlements.plist")
  const resourcesPath = path.join(appPath, "Contents", "Resources")
  const launcherPath = path.join(resourcesPath, "daily")

  if (!fs.existsSync(appPath)) {
    console.error(`❌ App not found at ${appPath}`)
    return
  }

  try {
    console.log(`📝 Creating entitlements file at ${entitlementsPath}...`)
    fs.writeFileSync(entitlementsPath, entitlementsContent)
  } catch (error) {
    console.error(`❌ Error creating entitlements file: ${error.message}`)
    return
  }

  try {
    console.log(`🧰 Creating CLI launcher at ${launcherPath}...`)
    fs.writeFileSync(
      launcherPath,
      `#!/bin/sh
PRG="$0"
while [ -h "$PRG" ]; do
  DIR="$(CDPATH= cd -P -- "$(dirname -- "$PRG")" && pwd)"
  PRG="$(readlink "$PRG")"
  case "$PRG" in
    /*) ;;
    *) PRG="$DIR/$PRG" ;;
  esac
done
SCRIPT_DIR="$(CDPATH= cd -P -- "$(dirname -- "$PRG")" && pwd)"
export ELECTRON_RUN_AS_NODE=1
exec "$SCRIPT_DIR/../MacOS/${appName}" "$SCRIPT_DIR/app/out/cli/index.js" "$@"
`,
      {mode: 0o755},
    )
    fs.chmodSync(launcherPath, 0o755)
  } catch (error) {
    console.error(`❌ Error creating CLI launcher: ${error.message}`)
    return
  }

  try {
    console.log(`🛡️  Removing quarantine from ${appName}.app...`)
    execSync(`xattr -dr com.apple.quarantine "${appPath}"`)
  } catch (error) {
    console.warn(`⚠️  Warning: Could not remove quarantine: ${error.message}`)
  }

  try {
    console.log(`🔐 Signing ${appName}.app with ad-hoc identity...`)
    execSync(`codesign --deep --force --sign - --entitlements "${entitlementsPath}" "${appPath}"`)
  } catch (error) {
    console.error(`❌ Error signing app: ${error.message}`)
    return
  }

  try {
    console.log(`🔍 Verifying signature...`)
    execSync(`codesign --verify --deep --strict "${appPath}"`)
    console.log(`✅ ${appName}.app is now signed and verified`)
  } catch (error) {
    console.error(`❌ Error verifying signature: ${error.message}`)
  }
}
