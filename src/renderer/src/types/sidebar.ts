import type {IconName} from "@/ui/base/BaseIcon"

export type SidebarSection = "calendar" | "tags" | "cloud-sync" | "themes" | "help"

export type SidebarMenuItem = {
  id: SidebarSection
  icon: IconName
  label: string
}
