import {toShortcutKeys} from "@/utils/shortcuts/toShortcutKey"

import type {AnimatedTab} from "@/ui/common/misc/AnimatedTabs"
import type {SidebarSection} from "./types"

export const BOTTOM_MENU_ITEMS: AnimatedTab<SidebarSection>[] = [
  {
    id: "calendar",
    icon: "calendar",
    label: "Calendar",
    tooltip: `Calendar (${toShortcutKeys("ui:open-calendar-panel")})`,
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "tags",
    icon: "tags",
    label: "Tags",
    tooltip: `Tags (${toShortcutKeys("ui:open-tags-panel")})`,
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "search",
    icon: "search",
    label: "Search",
    tooltip: `Search (${toShortcutKeys("ui:open-search-panel")})`,
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "assistant",
    icon: "ai",
    label: "AI Assistant",
    tooltip: `AI Assistant (${toShortcutKeys("ui:open-assistant-panel")})`,
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
  {
    id: "settings",
    icon: "logo",
    label: "Daily",
    tooltip: `Settings (${toShortcutKeys("ui:open-settings-panel")})`,
    activeClass: "bg-accent/20 text-accent",
    inactiveClass: "text-base-content hover:bg-base-200",
  },
]
