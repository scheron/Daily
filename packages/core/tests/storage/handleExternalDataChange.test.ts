// @ts-nocheck
import {describe, expect, it, vi} from "vitest"

import {StorageController} from "../../src/storage/StorageController"

vi.mock("../../src/utils/logger", () => ({
  logger: {info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), storage: vi.fn(), lifecycle: vi.fn(), CONTEXT: {STORAGE: "STORAGE"}},
}))

describe("handleExternalDataChange", () => {
  it("rebuilds the index and notifies data change", async () => {
    const controller = new StorageController(null, {
      appDataRoot: () => "/tmp/daily-test",
      assetsDir: () => "/tmp/daily-test/assets",
      dbPath: () => "/tmp/daily-test/db",
      remoteSyncPath: () => "/tmp/daily-test/remote",
      mutationSignalPath: () => "/tmp/daily-test/.s",
    })
    const rebuild = vi.fn()
    const notify = vi.fn()
    controller.searchService = {rebuildIndex: rebuild}
    controller.notifyStorageDataChange = notify
    await controller.handleExternalDataChange()
    expect(rebuild).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledOnce()
  })
})
