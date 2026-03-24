import type {ILocalStorage, SyncAuditEntry, SyncConfig} from "@/types/sync"

export class AuditLogger {
  constructor(
    private localStore: ILocalStorage,
    private config: SyncConfig,
  ) {}

  async writeEntry(entry: Omit<SyncAuditEntry, "id">): Promise<void> {
    await this.localStore.writeSyncAudit(entry)
  }

  async getLog(limit?: number): Promise<SyncAuditEntry[]> {
    return this.localStore.getSyncAuditLog(limit)
  }

  async prune(): Promise<number> {
    return this.localStore.pruneSyncAudit(this.config.auditRetentionInterval, this.config.auditMaxEntries)
  }
}
