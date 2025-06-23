import type {StorageManager} from "../types.js"
import {notifyStorageSyncStatus} from "./storage-events.js"

let syncInterval: NodeJS.Timeout | null = null
let isInitialized = false

export function setupStorageSync(storage: StorageManager, interval = 2 * 60 * 1000): void {
  if (isInitialized) {
    console.warn("⚠️ Storage sync already initialized")
    return
  }

  console.log("🔄 Starting storage sync interval (2 minutes)")

  syncInterval = setInterval(async () => {
    try {
      notifyStorageSyncStatus(true)
      await storage.syncStorage()
    } catch (error) {
      console.error("❌ Storage sync interval error:", error)
    } finally {
      notifyStorageSyncStatus(false)
    }
  }, interval)

  isInitialized = true
}

export function teardownStorageSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
    isInitialized = false
    console.log("🛑 Storage sync interval stopped")
  }
}

export async function forceStorageSync(storage: StorageManager): Promise<void> {
  try {
    console.log("🔄 Force storage sync triggered")
    notifyStorageSyncStatus(true)

    await storage.syncStorage()
  } catch (error) {
    console.error("❌ Force storage sync error:", error)
  } finally {
    notifyStorageSyncStatus(false)
  }
}

export function isStorageSyncActive(): boolean {
  return isInitialized && syncInterval !== null
}
