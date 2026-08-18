import {ipcMain} from "electron"

import type {IStorageController} from "@/types/storage"
import type {MigrationDirection, SyncProvider} from "@shared/types/syncProvider"

// prettier-ignore
export function setupSyncProviderIPC(getStorage: () => IStorageController | null) {
  ipcMain.handle("sync-provider:preview", (_e, target: Exclude<SyncProvider, "off">) => getStorage()?.previewMigration(target))
  ipcMain.handle("sync-provider:migrate", (_e, target: SyncProvider, direction: MigrationDirection | null) => getStorage()?.migrateProvider(target, direction))
}
