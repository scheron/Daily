import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import Database from "better-sqlite3"

/**
 * Magic-byte signature table. A local copy of
 * `src/main/utils/files/sniffImageExt.ts`, which is the canonical source —
 * this script is raw ESM for a node-style runtime and cannot import
 * TypeScript from `src/**`.
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const GIF_SIGNATURE = [0x47, 0x49, 0x46, 0x38]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46]
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50]
const WEBP_SIGNATURE_OFFSET = 8

const flags = parseFlags(process.argv.slice(2))
const dataDir = flags.dataDir ?? path.join(os.homedir(), "Library", "Application Support", "Daily")
const dbPath = path.join(dataDir, "db", "daily.sqlite")
const assetsDir = path.join(dataDir, "assets")

console.log("fix-asset-extensions: for best results, close Daily before running with --apply")

const db = new Database(dbPath)
const updateFile = db.prepare("UPDATE files SET name = ?, mime_type = ?, updated_at = ? WHERE id = ?")
const rowsById = new Map(
  db
    .prepare("SELECT id, name FROM files")
    .all()
    .map((row) => [row.id, row]),
)
const entries = fs.readdirSync(assetsDir)

let mismatched = 0
let fixed = 0

for (const entry of entries) {
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
  if (diskExt === sniffed && dbExt === sniffed) continue

  mismatched++

  const targetPath = path.join(assetsDir, `${id}.${sniffed}`)
  if (targetPath !== filePath && fs.existsSync(targetPath)) {
    console.log(`fix-asset-extensions: conflict ${entry} -> ${id}.${sniffed} already exists, skipped`)
    continue
  }

  const newName = `${path.basename(row.name, path.extname(row.name))}.${sniffed}`
  console.log(`fix-asset-extensions: ${entry} (${row.name}) -> ${id}.${sniffed} (${newName})`)

  if (flags.apply) {
    if (diskExt !== sniffed) fs.renameSync(filePath, targetPath)
    updateFile.run(newName, getMimeType(sniffed), new Date().toISOString(), id)
    fixed++
  }
}

if (flags.apply) {
  console.log(`fix-asset-extensions: ${fixed} of ${entries.length} assets fixed`)
} else {
  console.log(`fix-asset-extensions: ${mismatched} of ${entries.length} assets mismatched (dry run, nothing changed)`)
}

db.close()

/**
 * Parses `--apply`, `--dry-run` (accepted, same as no flags) and
 * `--data-dir <path>` (also accepts `--data-dir=<path>`).
 */
function parseFlags(argv) {
  const result = {apply: false, dataDir: null}

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === "--apply") {
      result.apply = true
    } else if (arg === "--dry-run") {
      continue
    } else if (arg === "--data-dir") {
      result.dataDir = argv[i + 1]
      i++
    } else if (arg.startsWith("--data-dir=")) {
      result.dataDir = arg.slice("--data-dir=".length)
    }
  }

  return result
}

/** Reads the first bytes of a file — enough to cover every signature above. */
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

function matchesAt(data, signature, offset) {
  if (data.length < offset + signature.length) return false
  return signature.every((byte, index) => data[offset + index] === byte)
}

function sniffImageExt(data) {
  if (matchesAt(data, PNG_SIGNATURE, 0)) return "png"
  if (matchesAt(data, JPEG_SIGNATURE, 0)) return "jpg"
  if (matchesAt(data, GIF_SIGNATURE, 0)) return "gif"
  if (matchesAt(data, RIFF_SIGNATURE, 0) && matchesAt(data, WEBP_SIGNATURE, WEBP_SIGNATURE_OFFSET)) return "webp"

  return null
}

/** Local copy of the mime table in `src/main/utils/files/getMimeType.ts`. */
function getMimeType(ext) {
  switch (ext) {
    case "png":
      return "image/png"
    case "jpg":
      return "image/jpeg"
    case "gif":
      return "image/gif"
    case "webp":
      return "image/webp"
    default:
      return "application/octet-stream"
  }
}
