import type {IconName} from "@/ui/base/BaseIcon"
import type {SyncStatus} from "@shared/types/storage"

type SyncStatusEnum = Record<SyncStatus, {icon: IconName; text: string; description: string; color: string}>

export const SYNC_STATUS_ENUM: SyncStatusEnum = {
  syncing: {
    icon: "refresh",
    text: "Syncing...",
    description: "iCloud data is currently syncing...",
    color: "text-accent/80",
  },
  error: {
    icon: "cloud-alert",
    text: "Sync Error",
    description: "There was an error syncing iCloud data",
    color: "text-error",
  },
  inactive: {
    icon: "cloud-off",
    text: "Sync Disabled",
    description: "Enable iCloud sync to backup data",
    color: "text-base-content/30",
  },
  active: {
    icon: "cloud",
    text: "Synced",
    description: "Automatically sync your tasks, tags, and settings to iCloud",
    color: "text-success",
  },
}
