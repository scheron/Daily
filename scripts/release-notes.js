import fs from "fs"
import path from "path"
import {fileURLToPath} from "url"

function escapeRegex(str) {
  return str.replace(/\\/g, "\\\\").replace(/[.*+?^${}()|[\]-]/g, "\\$&")
}

function getReleaseNotes(version) {
  version = version.replace(/^v/, "")
  const changelogPath = path.join(process.cwd(), "CHANGELOG.md")
  const changelog = fs.readFileSync(changelogPath, "utf8")

  const escapedVersion = escapeRegex(version)
  const regex = new RegExp(`^## v${escapedVersion}[\\s\\S]*?(?=^## v\\d|\\Z)`, "m")

  const match = changelog.match(regex)
  if (!match) {
    console.error(`❌ Could not find changelog section for v${version}`)
    process.exit(1)
  }

  const lines = match[0].split("\n").slice(1)
  return lines.join("\n").trim()
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const version = process.argv[2]

  if (!version) {
    console.error("❌ Usage: node scripts/release-notes.js <version>")
    process.exit(1)
  }

  const notes = getReleaseNotes(version)
  fs.writeFileSync("release-notes.md", notes, "utf8")
}
