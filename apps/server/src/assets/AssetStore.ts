import {createHash} from "node:crypto"
import {createWriteStream} from "node:fs"
import {join, resolve, sep} from "node:path"
import {Transform} from "node:stream"
import {pipeline} from "node:stream/promises"
import fs from "fs-extra"
import {nanoid} from "nanoid"

import {ProtocolError, ProtocolErrorCode} from "@daily/protocol"

import type {Readable} from "node:stream"
import type {ServerStore} from "../store/instance"

const ASSET_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}\.[A-Za-z0-9]{1,16}$/

export type AssetRecord = {name: string; size: number; sha256: string; uploadedAt: string}
export type AssetStats = {count: number; bytes: number}

type AssetRow = {name: string; size: number; sha256: string; uploaded_at: string}

/** Whether `name` matches the server's asset-name whitelist — an id, a dot, and an extension, nothing else. */
export function isValidAssetName(name: string): boolean {
  return ASSET_NAME_PATTERN.test(name)
}

/** The directory holding every asset blob, flat, directly under the store's data directory. */
export function assetsDir(store: ServerStore): string {
  return join(store.dataDir, "assets")
}

/** Creates the asset directory if it does not exist yet. */
export function ensureAssetsDir(store: ServerStore): void {
  fs.ensureDirSync(assetsDir(store))
}

/** Removes every leftover `.tmp-*` file a previous crash left behind. */
export function sweepPartialUploads(store: ServerStore): void {
  const dir = assetsDir(store)
  if (!fs.existsSync(dir)) return

  for (const entry of fs.readdirSync(dir)) {
    if (entry.startsWith(".tmp-")) fs.removeSync(join(dir, entry))
  }
}

/** Every stored asset's index row. */
export function listAssets(store: ServerStore): AssetRecord[] {
  const rows = store.db.prepare(`SELECT name, size, sha256, uploaded_at FROM assets`).all() as AssetRow[]

  return rows.map(toAssetRecord)
}

/** The index row for `name`, or `null` if nothing was ever uploaded under it. Does not check that the blob is still on disk. */
export function findAsset(store: ServerStore, name: string): AssetRecord | null {
  const row = store.db.prepare(`SELECT name, size, sha256, uploaded_at FROM assets WHERE name = ?`).get(name) as AssetRow | undefined

  return row ? toAssetRecord(row) : null
}

/** The number of stored assets and their total byte size, for `daily-server status`. */
export function assetStats(store: ServerStore): AssetStats {
  return store.db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM assets`).get() as AssetStats
}

/** Throws `ProtocolError(INVALID_ASSET_NAME)` for a name outside the pattern, and resolves to the path of the stored blob. */
export function assetPath(store: ServerStore, name: string): string {
  if (!isValidAssetName(name)) throw new ProtocolError(ProtocolErrorCode.INVALID_ASSET_NAME, `"${name}" is not a valid asset name`)

  const dir = assetsDir(store)
  const candidate = join(dir, name)

  if (!resolve(candidate).startsWith(resolve(dir) + sep)) {
    throw new ProtocolError(ProtocolErrorCode.INVALID_ASSET_NAME, `"${name}" escapes the asset directory`)
  }

  return candidate
}

/**
 * Streams `source` into the asset directory under `name`, replacing whatever was there.
 * Throws `ProtocolError(INVALID_ASSET_NAME)` for a bad name and `ProtocolError(PAYLOAD_TOO_LARGE)`
 * when the stream exceeds `maxBytes`, leaving nothing behind either way.
 */
export async function writeAsset(
  store: ServerStore,
  name: string,
  source: Readable,
  uploadedByDeviceId: string,
  maxBytes: number,
): Promise<AssetRecord> {
  const finalPath = assetPath(store, name)
  ensureAssetsDir(store)

  const tempPath = join(assetsDir(store), `.tmp-${nanoid()}`)
  const hash = createHash("sha256")
  let bytesWritten = 0

  const capAndHash = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesWritten += chunk.length
      if (bytesWritten > maxBytes) {
        callback(new ProtocolError(ProtocolErrorCode.PAYLOAD_TOO_LARGE, `Asset exceeds the ${maxBytes}-byte cap`))
        return
      }

      hash.update(chunk)
      callback(null, chunk)
    },
  })

  try {
    await pipeline(source, capAndHash, createWriteStream(tempPath))
  } catch (err) {
    await fs.remove(tempPath).catch(() => {})
    throw err
  }

  await fs.rename(tempPath, finalPath)

  const uploadedAt = new Date().toISOString()

  store.db
    .prepare(
      `INSERT INTO assets (name, size, sha256, uploaded_at, uploaded_by_device_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         size = excluded.size,
         sha256 = excluded.sha256,
         uploaded_at = excluded.uploaded_at,
         uploaded_by_device_id = excluded.uploaded_by_device_id`,
    )
    .run(name, bytesWritten, hash.digest("hex"), uploadedAt, uploadedByDeviceId)

  return findAsset(store, name) as AssetRecord
}

function toAssetRecord(row: AssetRow): AssetRecord {
  return {name: row.name, size: row.size, sha256: row.sha256, uploadedAt: row.uploaded_at}
}
