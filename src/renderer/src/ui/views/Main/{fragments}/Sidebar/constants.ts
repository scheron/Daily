import type {IconName} from "@/ui/base/BaseIcon"
import type {AnimatedTab} from "@/ui/common/misc/AnimatedTabs"
import type {SyncStatus} from "@shared/types/storage"
import type {SidebarSection} from "./types"

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
    description: "iCloud data is synced",
    color: "text-success",
  },
}

export const BOTTOM_MENU_ITEMS: AnimatedTab<SidebarSection>[] = [
  {
    id: "calendar",
    icon: "calendar",
    label: "Calendar",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "tags",
    icon: "tags",
    label: "Tags",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "search",
    icon: "search",
    label: "Search",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "cloud-sync",
    icon: "cloud",
    label: "Sync",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "themes",
    icon: "background",
    label: "Themes",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "help",
    icon: "logo",
    label: "Daily",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
]
