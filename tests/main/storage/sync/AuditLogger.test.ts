// @ts-nocheck
import {beforeEach, describe, expect, it, vi} from "vitest"

import {AuditLogger} from "@main/storage/sync/AuditLogger"

describe("AuditLogger", () => {
  let localStore
  let config
  let auditLogger

  beforeEach(() => {
    localStore = {
      writeSyncAudit: vi.fn(),
      getSyncAuditLog: vi.fn().mockResolvedValue([]),
      pruneSyncAudit: vi.fn().mockResolvedValue(0),
    }
    config = {
      remoteSyncInterval: 120000,
      garbageCollectionInterval: 604800000,
      maxDeltasPerFile: 500,
      compactionThreshold: 50,
      auditRetentionInterval: 2592000000,
      auditMaxEntries: 1000,
    }
    auditLogger = new AuditLogger(localStore, config)
  })

  it("writeEntry delegates to localStore", async () => {
    const entry = {
      started_at: "2026-03-24T12:00:00.000Z",
      completed_at: "2026-03-24T12:00:01.000Z",
      duration_ms: 1000,
      strategy: "pull",
      outcome: "success",
      deltas_pushed: 0,
      deltas_pulled: 5,
      conflicts_resolved: 0,
      docs_upserted: 3,
      docs_deleted: 0,
      error_message: null,
      device_id: "dev1",
    }
    await auditLogger.writeEntry(entry)
    expect(localStore.writeSyncAudit).toHaveBeenCalledWith(entry)
  })

  it("getLog delegates with limit", async () => {
    await auditLogger.getLog(50)
    expect(localStore.getSyncAuditLog).toHaveBeenCalledWith(50)
  })

  it("prune delegates with config values", async () => {
    await auditLogger.prune()
    expect(localStore.pruneSyncAudit).toHaveBeenCalledWith(2592000000, 1000)
  })
})
