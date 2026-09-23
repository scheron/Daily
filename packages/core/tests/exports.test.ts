import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"
import {describe, expect, it} from "vitest"

const coreDir = join(dirname(fileURLToPath(import.meta.url)), "..")

function readCoreManifest(): {exports: Record<string, string>} {
  return JSON.parse(readFileSync(join(coreDir, "package.json"), "utf-8"))
}

describe("packages/core/package.json exports", () => {
  it("TC-1: exposes the entry point and the twelve subpaths the server and the app reach past it, with no wildcard", () => {
    const {exports} = readCoreManifest()

    expect(exports["./*"]).toBeUndefined()

    expect(exports).toEqual({
      ".": "./src/index.ts",
      "./config/paths": "./src/config/paths.ts",
      "./storage/createStorageCore": "./src/storage/createStorageCore.ts",
      "./storage/database/scripts/migrate": "./src/storage/database/scripts/migrate.ts",
      "./storage/sync/adapters/LocalStorageAdapter": "./src/storage/sync/adapters/LocalStorageAdapter.ts",
      "./types/storage": "./src/types/storage.ts",
      "./utils/files/extractFileIds": "./src/utils/files/extractFileIds.ts",
      "./utils/files/removeFileLink": "./src/utils/files/removeFileLink.ts",
      "./utils/files/sniffImageExt": "./src/utils/files/sniffImageExt.ts",
      "./utils/sync/snapshot/assertKnownSnapshotVersion": "./src/utils/sync/snapshot/assertKnownSnapshotVersion.ts",
      "./utils/sync/snapshot/buildSnapshot": "./src/utils/sync/snapshot/buildSnapshot.ts",
      "./utils/sync/snapshot/isValidSnapshot": "./src/utils/sync/snapshot/isValidSnapshot.ts",
      "./utils/sync/snapshot/normalizeSnapshotDocs": "./src/utils/sync/snapshot/normalizeSnapshotDocs.ts",
    })
  })
})
