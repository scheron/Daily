// @ts-nocheck
import {readdir} from "node:fs/promises"
import {afterEach, describe, expect, it, vi} from "vitest"

import {makeControllerHarness} from "../../helpers/storageControllerHarness"

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
  let db

  afterEach(() => {
    db?.close()
  })

  it("keeps_a_deleted_files_bytes_on_disk_until_garbage_collection_purges_its_row", async () => {
    const harness = makeControllerHarness()
    db = harness.db
    const {controller, paths} = harness

    const fileId = await controller.saveFile("screenshot.png", WEBP_BYTES)

    await controller.deleteFile(fileId)

    const diskFiles = await readdir(paths.assetsDir())
    expect(diskFiles).toContain(`${fileId}.webp`)
  })
})
