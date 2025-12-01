import type {SidebarSection} from "@/types/sidebar"
import type {AnimatedTab} from "@/ui/common/misc/AnimatedTabs"

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
    id: "cloud-sync",
    icon: "cloud",
    label: "iCloud Sync",
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
