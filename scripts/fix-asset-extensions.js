import fs from "node:fs"
import {createRequire} from "node:module"
import os from "node:os"
import path from "node:path"
import {parseArgs} from "node:util"

import {getMimeType} from "../packages/core/src/utils/files/getMimeType.ts"
import {sniffImageExt} from "../packages/core/src/utils/files/sniffImageExt.ts"

const {values: flags} = parseArgs({options: {apply: {type: "boolean"}, "dry-run": {type: "boolean"}, "data-dir": {type: "string"}}})
if (flags.apply && flags["dry-run"]) throw new Error("Choose either --apply or --dry-run.")

const require = createRequire(new URL("../apps/desktop/package.json", import.meta.url))
const Database = require("better-sqlite3")

const dataDir = flags["data-dir"] ?? path.join(os.homedir(), "Library", "Application Support", "Daily")
const dbPath = path.join(dataDir, "db", "daily.sqlite")
const assetsDir = path.join(dataDir, "assets")

console.log("fix-asset-extensions: for best results, close Daily before running with --apply")

const db = new Database(dbPath, {fileMustExist: true, readonly: !flags.apply})
const updateFile = flags.apply ? db.prepare("UPDATE files SET name = ?, mime_type = ?, updated_at = ? WHERE id = ?") : null
const rowsById = new Map(
  db
    .prepare("SELECT id, name, mime_type FROM files")
    .all()
    .map((row) => [row.id, row]),
)
const entries = fs.readdirSync(assetsDir, {withFileTypes: true}).filter((entry) => entry.isFile())

let mismatched = 0
let fixed = 0

for (const {name: entry} of entries) {
  const dotIndex = entry.lastIndexOf(".")
  const id = dotIndex !== -1 ? entry.slice(0, dotIndex) : entry
  const diskExt = dotIndex !== -1 ? entry.slice(dotIndex + 1) : ""
  const filePath = path.join(assetsDir, entry)

  const sniffed = sniffImageExt(readHead(filePath))
  if (sniffed === null) continue

  const row = rowsById.get(id)
  if (!row) {
    console.log(`fix-asset-extensions: orphan ${entry} has no matching row in files, skipped`)
    continue
  }

  const dbExt = path.extname(row.name).slice(1)
  const mimeType = getMimeType(sniffed)
  if (diskExt === sniffed && dbExt === sniffed && row.mime_type === mimeType) continue

  mismatched++

  const targetPath = path.join(assetsDir, `${id}.${sniffed}`)
  if (targetPath !== filePath && fs.existsSync(targetPath)) {
    console.log(`fix-asset-extensions: conflict ${entry} -> ${id}.${sniffed} already exists, skipped`)
    continue
  }

  const newName = `${path.basename(row.name, path.extname(row.name))}.${sniffed}`
  console.log(`fix-asset-extensions: ${entry} (${row.name}) -> ${id}.${sniffed} (${newName})`)

  if (updateFile) {
    let renamed = false
    try {
      db.transaction(() => {
        updateFile.run(newName, mimeType, new Date().toISOString(), id)
        if (filePath !== targetPath) {
          fs.renameSync(filePath, targetPath)
          renamed = true
        }
      })()
    } catch (error) {
      if (renamed) fs.renameSync(targetPath, filePath)
      throw error
    }
    fixed++
  }
}

if (flags.apply) {
  console.log(`fix-asset-extensions: ${fixed} of ${entries.length} assets fixed`)
} else {
  console.log(`fix-asset-extensions: ${mismatched} of ${entries.length} assets mismatched (dry run, nothing changed)`)
}

db.close()

function readHead(filePath, length = 32) {
  const buffer = Buffer.alloc(length)
  const fd = fs.openSync(filePath, "r")

  try {
    const bytesRead = fs.readSync(fd, buffer, 0, length, 0)
    return buffer.subarray(0, bytesRead)
  } finally {
    fs.closeSync(fd)
  }
}
