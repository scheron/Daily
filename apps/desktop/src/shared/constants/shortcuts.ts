export const SHORTCUTS_MAP = {
  "tasks:create": {channel: "shortcut:tasks:create", label: "New Task", accelerator: "CmdOrCtrl+N"},

  "ui:calendar-dock:toggle": {channel: "shortcut:ui:calendar-dock:toggle", label: "Toggle Calendar", accelerator: "CmdOrCtrl+E"},

  "ui:open-search-panel": {channel: "shortcut:ui:open-search-panel", label: "Search", accelerator: "CmdOrCtrl+F"},
  "ui:open-assistant-panel": {label: "AI Assistant", accelerator: "CmdOrCtrl+Shift+A"},
  "ui:open-settings-panel": {label: "Settings", accelerator: "CmdOrCtrl+,"},
  "settings:general": {label: "General", accelerator: "CmdOrCtrl+Shift+1", section: "general"},
  "settings:projects": {label: "Projects", accelerator: "CmdOrCtrl+Shift+2", section: "projects"},
  "settings:sync": {label: "Sync", accelerator: "CmdOrCtrl+Shift+3", section: "sync"},
  "settings:ai": {label: "Daily AI", accelerator: "CmdOrCtrl+Shift+4", section: "ai"},
  "settings:deleted-tasks": {
    label: "Recently Deleted",
    accelerator: "CmdOrCtrl+Shift+5",
    section: "deleted-tasks",
  },
  "settings:debug": {label: "DEBUG", accelerator: "CmdOrCtrl+Shift+6", section: "debug"},

  "editor:close": {label: "Close", accelerator: "Escape"},
  "editor:save": {label: "Save", accelerator: "CmdOrCtrl+S"},
  "editor:save-close": {label: "Save & Close", accelerator: "CmdOrCtrl+Enter"},
  "markdown:bold": {label: "Bold", accelerator: "CmdOrCtrl+B"},
  "markdown:italic": {label: "Italic", accelerator: "CmdOrCtrl+I"},
  "markdown:code": {label: "Inline code", accelerator: "CmdOrCtrl+`"},
  "comments:submit": {label: "Send", accelerator: "CmdOrCtrl+Enter"},
  "comments:cancel": {label: "Cancel", accelerator: "Escape"},
  "subtasks:submit": {label: "Save", accelerator: "CmdOrCtrl+Enter"},
  "subtasks:cancel": {label: "Cancel", accelerator: "Escape"},
} as const
