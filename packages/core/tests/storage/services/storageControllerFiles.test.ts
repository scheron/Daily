// @ts-nocheck
import {mkdtempSync, rmSync} from "node:fs"
import {readdir} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"

import {FileModel} from "@core/storage/models/FileModel"
import {TaskModel} from "@core/storage/models/TaskModel"
import {FilesService} from "@core/storage/services/FilesService"
import {StorageController} from "@core/storage/StorageController"
import {createTestDatabase} from "../../helpers/db"

vi.mock("../../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    storage: vi.fn(),
    lifecycle: vi.fn(),
    CONTEXT: {FILES: "FILES"},
  },
}))

vi.mock("../../../src/config/env", () => ({ENV: {isDev: false}}))

vi.mock("@daily/protocol", async (importOriginal) => ({...(await importOriginal()), WINDOWS_CONFIG: {main: {width: 800, height: 600}}}))

const WEBP_BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])

describe("StorageController — files", () => {
  let db, assetsDir, controller

  beforeEach(() => {
    db = createTestDatabase()
    assetsDir = mkdtempSync(join(tmpdir(), "daily-controller-files-"))

    const paths = {
      appDataRoot: () => assetsDir,
      dbPath: () => join(assetsDir, "db"),
      assetsDir: () => assetsDir,
      remoteSyncPath: () => join(assetsDir, "remote"),
    }

    const fileModel = new FileModel(db, assetsDir)
    fileModel.initAssets()

    controller = new StorageController(db, paths)
    controller.filesService = new FilesService(fileModel, new TaskModel(db))
  })

  afterEach(() => {
    db?.close()
    rmSync(assetsDir, {recursive: true, force: true})
  })

  it("keeps_a_deleted_files_bytes_on_disk_until_garbage_collection_purges_its_row", async () => {
    const fileId = await controller.saveFile("screenshot.png", WEBP_BYTES)

    await controller.deleteFile(fileId)

    const diskFiles = await readdir(assetsDir)
    expect(diskFiles).toContain(`${fileId}.webp`)
  })
})
