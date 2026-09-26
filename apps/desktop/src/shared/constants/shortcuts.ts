export const SHORTCUTS_MAP = {
  "tasks:create": {channel: "shortcut:tasks:create", label: "New Task", accelerator: "CmdOrCtrl+N"},

  "ui:calendar-dock:toggle": {channel: "shortcut:ui:calendar-dock:toggle", label: "Toggle Calendar", accelerator: "CmdOrCtrl+E"},

  // Settings
  "ui:open-search-panel": {channel: "shortcut:ui:open-search-panel", label: "Search", accelerator: "CmdOrCtrl+F"},
  "ui:open-assistant-panel": {channel: "shortcut:ui:open-assistant-panel", label: "AI Assistant", accelerator: "CmdOrCtrl+Shift+A"},
  "ui:open-settings-panel": {channel: "shortcut:ui:open-settings-panel", label: "Settings", accelerator: "CmdOrCtrl+,"},
  "settings:general": {channel: "settings:open:general", label: "General", accelerator: "CmdOrCtrl+Shift+1", section: "general"},
  "settings:projects": {channel: "settings:open:projects", label: "Projects", accelerator: "CmdOrCtrl+Shift+2", section: "projects"},
  "settings:sync": {channel: "settings:open:sync", label: "Sync", accelerator: "CmdOrCtrl+Shift+3", section: "sync"},
  "settings:ai": {channel: "settings:open:ai", label: "Daily AI", accelerator: "CmdOrCtrl+Shift+4", section: "ai"},
  "settings:deleted-tasks": {
    channel: "settings:open:deleted-tasks",
    label: "Recently Deleted",
    accelerator: "CmdOrCtrl+Shift+5",
    section: "deleted-tasks",
  },
  "settings:debug": {channel: "settings:open:debug", label: "DEBUG", accelerator: "CmdOrCtrl+Shift+6", section: "debug"},

  // Local
  "editor:close": {label: "Close", accelerator: "Escape"},
  "editor:save": {label: "Save", accelerator: "CmdOrCtrl+S"},
  "editor:save-close": {label: "Save & Close", accelerator: "CmdOrCtrl+Enter"},
} as const
