import type {AnimatedTab} from "@/ui/common/misc/AnimatedTabs"
import type {SidebarSection} from "./types"

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
    id: "assistant",
    icon: "ai",
    label: "AI Assistant",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "settings",
    icon: "logo",
    label: "Daily",
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
]
