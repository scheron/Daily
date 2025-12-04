import type {IconName} from "@/ui/base/BaseIcon"
import type {TaskStatus} from "@shared/types/storage"

export type SidebarSection = "calendar" | "tags" | "cloud-sync" | "themes" | "help" | "search"

export type TaskStatusFilter = "all" | TaskStatus

export type SidebarMenuItem = {
  id: SidebarSection
  icon: IconName
  label: string
}
